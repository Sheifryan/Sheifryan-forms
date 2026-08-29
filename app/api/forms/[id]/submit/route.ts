import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { validateSubmission, type FormSchema, type FormSettings } from "@/lib/schema";

// Extremely simple in-memory rate limit for demo purposes. Swap for
// Upstash Redis (or similar) before shipping — this resets on every deploy
// and doesn't work across multiple server instances.
const submitTimestamps = new Map<string, number[]>();
const RATE_LIMIT = 5; // submissions
const RATE_WINDOW_MS = 60_000; // per minute, per IP+form

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = (submitTimestamps.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  timestamps.push(now);
  submitTimestamps.set(key, timestamps);
  return timestamps.length > RATE_LIMIT;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    return await handleSubmit(request, params.id);
  } catch (err) {
    console.error(`[submit] Unexpected error for form ${params.id}:`, err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal server error" }, { status: 500 });
  }
}

async function handleSubmit(request: Request, id: string) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Honeypot: a hidden field named "company" that real users never fill in.
  // Bots that auto-fill every field trip this silently — we return success
  // without writing a row, so the bot doesn't learn anything.
  if (body.company) {
    return NextResponse.json({ ok: true });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(`${id}:${ip}`)) {
    return NextResponse.json({ error: "Too many submissions. Try again in a minute." }, { status: 429 });
  }

  // Anonymous read here is fine — RLS only allows published forms through.
  const supabase = createClient();
  const { data: form, error: formError } = await supabase
    .from("forms")
    .select("id, schema, schema_version, status, settings")
    .eq("id", id)
    .single();

  if (formError || !form) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }
  if (form.status !== "published") {
    return NextResponse.json({ error: "This form is not accepting responses" }, { status: 403 });
  }

  const settings = form.settings as FormSettings;

  // Password-protected forms: require the same cookie the page-level gate
  // sets after a correct password, so this route can't be hit directly to
  // bypass the gate shown on /f/[id].
  if (settings?.passwordProtected) {
    const cookieValue = cookies().get(`easyform_pw_${id}`)?.value;
    const service = createServiceClient();
    const { data: hashRow } = await service.from("forms").select("password_hash").eq("id", id).single();
    const verified = Boolean(hashRow?.password_hash) && cookieValue === hashRow.password_hash;
    if (!verified) {
      return NextResponse.json({ error: "This form requires a password." }, { status: 401 });
    }
  }

  // Enforce a close date, if the form owner set one.
  if (settings?.closeOnDate && settings.closeDate) {
    const closeAt = new Date(settings.closeDate + "T23:59:59");
    if (Date.now() > closeAt.getTime()) {
      return NextResponse.json({ error: "This form is no longer accepting responses." }, { status: 403 });
    }
  }

  // Enforce a maximum response count, if the form owner set one. This does
  // a live count rather than trusting a cached number, since two people
  // could submit concurrently near the limit.
  if (settings?.limitResponses && settings.maxResponses) {
    const { count } = await supabase
      .from("responses")
      .select("id", { count: "exact", head: true })
      .eq("form_id", form.id);
    if ((count ?? 0) >= settings.maxResponses) {
      return NextResponse.json({ error: "This form has reached its response limit." }, { status: 403 });
    }
  }

  const result = validateSubmission(form.schema as FormSchema, body.answers ?? {});
  if (!result.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: result.errors }, { status: 422 });
  }

  // Service client bypasses RLS for the insert — safe here because we've
  // already independently confirmed the form is published and the payload
  // is validated against its schema above.
  const service = createServiceClient();
  const { data: inserted, error: insertError } = await service
    .from("responses")
    .insert({
      form_id: form.id,
      schema_version: form.schema_version,
      answers: result.data,
      meta: {
        userAgent: request.headers.get("user-agent") ?? "",
      },
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? "Couldn't record the response" }, { status: 500 });
  }

  // Link every file referenced by this submission to its response. Files whose
  // refs were uploaded but never submitted stay orphaned (response_id null).
  const fileIds: string[] = [];
  for (const field of (form.schema as FormSchema).fields) {
    if (field.type !== "file") continue;
    const refs = result.data[field.id];
    if (Array.isArray(refs)) {
      for (const ref of refs) if (ref && typeof ref.id === "string") fileIds.push(ref.id);
    }
  }
  if (fileIds.length > 0) {
    const { error: linkError } = await service
      .from("form_files")
      .update({ response_id: inserted.id })
      .eq("form_id", form.id)
      .in("id", fileIds)
      .is("response_id", null);
    if (linkError) console.error(`[submit] Couldn't link files to response ${inserted.id}:`, linkError.message);
  }

  return NextResponse.json({
    ok: true,
    confirmationMessage: settings?.confirmationMessage,
    redirectUrl: settings?.redirectUrl || undefined,
  });
}
