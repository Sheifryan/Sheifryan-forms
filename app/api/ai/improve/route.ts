import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured, aiRateLimited, completeJSON } from "@/lib/ai/client";
import { buildCritiquePrompt, buildImprovePrompt, type EditableFormShape } from "@/lib/ai/prompts";
import { improveSchema, normalizeGeneratedFields } from "@/lib/ai/contracts";
import type { FormField, FormSchema } from "@/lib/schema";

type RawImprove = z.infer<typeof improveSchema>;

/**
 * AI-improved version of a form. Only allowed while the form has no responses
 * yet (changing field ids/options after people answered would corrupt the
 * history). Returns a schema the owner previews and applies explicitly.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "AI isn't configured yet. Add AI_API_KEY to your .env file and restart the dev server." },
      { status: 503 }
    );
  }
  if (aiRateLimited(user.id, 5)) {
    return NextResponse.json({ error: "Too many AI requests — try again in a minute." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const formId = typeof body?.formId === "string" ? body.formId : "";
  if (!formId) return NextResponse.json({ error: "Missing form id" }, { status: 400 });

  const { data: form } = await supabase
    .from("forms")
    .select("id, owner_id, title, description, schema, settings")
    .eq("id", formId)
    .eq("owner_id", user.id)
    .single();
  if (!form || form.owner_id !== user.id) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  // Rewriting questions is only safe before anyone has responded.
  const { count } = await supabase
    .from("responses")
    .select("id", { count: "exact", head: true })
    .eq("form_id", formId);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "This form already has responses, so questions can't be rewritten safely." },
      { status: 409 }
    );
  }

  const snapshotSchema = body?.schema as FormSchema | undefined;
  const clientFields: FormField[] = Array.isArray(snapshotSchema?.fields)
    ? (snapshotSchema.fields as FormField[])
    : [];
  const effective: EditableFormShape = {
    title: typeof body?.title === "string" && body.title.trim() ? body.title.trim() : form.title,
    description:
      typeof body?.description === "string" && body.description.trim()
        ? body.description.trim()
        : (form.description as string | undefined) ?? "",
    fields: clientFields.length > 0
      ? clientFields.filter((f) => f && typeof f.id === "string" && typeof f.label === "string")
      : (((form.schema as FormSchema | null)?.fields as FormField[] | undefined) ?? []),
  };
  if (effective.fields.length === 0) {
    return NextResponse.json({ error: "Add at least one question before asking for improvements." }, { status: 400 });
  }

  try {
    const crit = buildCritiquePrompt(effective);
    const critique = await completeJSON<{ summary: string }>({
      system: crit.system,
      user: crit.user,
      schema: critiqueSummaryContract,
    });
    const { system, user: userPrompt } = buildImprovePrompt(effective, critique.summary);
    const raw = await completeJSON<RawImprove>({ system, user: userPrompt, schema: improveSchema });
    const fields = normalizeGeneratedFields(raw.fields, effective.fields);
    return NextResponse.json({ summary: raw.summary, fields });
  } catch (err) {
    console.error("[ai/improve]", err);
    const message = err instanceof Error ? err.message : "The AI improvement failed. Try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// Small contract for the critique step that leads into an improvement, so the
// model only needs to summarize (not return the full suggestion list).
const critiqueSummaryContract = z.object({ summary: z.string().min(1).max(1500) });
