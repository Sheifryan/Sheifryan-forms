// GET /api/notifications  — the signed-in user's recent notifications + unread
//                           count, for the header bell.
// PATCH /api/notifications — mark one notification read ({ id }) or all of them
//                           read (no body / { all: true }).
//
// Rows are written by the service-role workflow runner (`notify_team`), so this
// route only ever reads and updates the caller's own rows. The database enforces
// the same thing (0020): `user_id = auth.uid()` on both select and update.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const LIMIT = 20;

export const runtime = "nodejs";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, href, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  // A database without 0020 applied answers 42P01 here; the bell just stays empty
  // rather than breaking the header.
  if (error) return NextResponse.json({ notifications: [], unread: 0 });

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  return NextResponse.json({
    unread: count ?? 0,
    notifications: (data ?? []).map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      href: n.href,
      readAt: n.read_at,
      createdAt: n.created_at,
    })),
  });
}

export async function PATCH(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  const readAt = new Date().toISOString();

  const query = id
    ? supabase.from("notifications").update({ read_at: readAt }).eq("user_id", user.id).eq("id", id)
    : supabase.from("notifications").update({ read_at: readAt }).eq("user_id", user.id).is("read_at", null);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
