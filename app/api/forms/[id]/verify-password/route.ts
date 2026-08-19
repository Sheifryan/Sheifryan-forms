import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { hashFormPassword } from "@/lib/password";

const COOKIE_PREFIX = "easyform_pw_";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password) {
    return NextResponse.json({ ok: false, error: "Enter a password." }, { status: 400 });
  }

  // Service client is the only context allowed to read password_hash —
  // both anon and authenticated roles have that column's SELECT revoked
  // at the database level (see migration 0003).
  const service = createServiceClient();
  const { data: form, error } = await service
    .from("forms")
    .select("id, status, password_hash")
    .eq("id", params.id)
    .single();

  if (error || !form || form.status !== "published") {
    return NextResponse.json({ ok: false, error: "Form not found." }, { status: 404 });
  }
  if (!form.password_hash) {
    // Not actually password-protected server-side — treat as success so
    // the UI doesn't get stuck on a gate that shouldn't exist.
    return NextResponse.json({ ok: true });
  }

  const attemptHash = hashFormPassword(params.id, password);
  if (attemptHash !== form.password_hash) {
    return NextResponse.json({ ok: false, error: "Incorrect password." }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  // The cookie value is the hash itself (not the plaintext password), so a
  // page reload can re-verify by comparing it server-side against the DB
  // without storing any session state. Scoped to this form only.
  response.cookies.set({
    name: `${COOKIE_PREFIX}${params.id}`,
    value: attemptHash,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: `/f/${params.id}`,
    maxAge: 60 * 60 * 24, // 24 hours
  });
  return response;
}
