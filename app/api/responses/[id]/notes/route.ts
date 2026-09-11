import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorize } from "@/lib/authz";
import { PERMISSION } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

// Internal notes on a response.
//
// These are for the team only: `response_notes` has no public/anon RLS policy,
// so a form respondent can never read them. Reads need `responses.read`,
// writes need `responses.update`.

async function inActiveWorkspace(supabase: ReturnType<typeof createClient>, responseId: string, workspaceId: string) {
  const { data: row } = await supabase.from("responses").select("id, form_id").eq("id", responseId).maybeSingle();
  if (!row) return null;
  const { data: form } = await supabase.from("forms").select("workspace_id").eq("id", row.form_id).maybeSingle();
  if (!form || form.workspace_id !== workspaceId) return null;
  return row;
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const auth = await authorize(PERMISSION.RESPONSES_READ);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createClient();
  const row = await inActiveWorkspace(supabase, params.id, auth.ctx.workspace.id);
  if (!row) return NextResponse.json({ error: "Response not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("response_notes")
    .select("id, author_id, body, created_at")
    .eq("response_id", params.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with author display names.
  const rows = data ?? [];
  const authorIds = Array.from(new Set(rows.map((n) => n.author_id).filter((v): v is string => Boolean(v))));
  const nameById: Record<string, string | null> = {};
  if (authorIds.length > 0) {
    const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", authorIds);
    (profs ?? []).forEach((p) => {
      nameById[p.id] = p.full_name;
    });
  }

  return NextResponse.json({
    notes: rows.map((n) => ({
      id: n.id,
      body: n.body,
      createdAt: n.created_at,
      author: (n.author_id && nameById[n.author_id]) || "A team member",
    })),
  });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await authorize(PERMISSION.RESPONSES_UPDATE);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createClient();
  const row = await inActiveWorkspace(supabase, params.id, auth.ctx.workspace.id);
  if (!row) return NextResponse.json({ error: "Response not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "Note can't be empty" }, { status: 400 });

  const { data, error } = await supabase
    .from("response_notes")
    .insert({ response_id: params.id, author_id: auth.ctx.userId, body: text.slice(0, 4000) })
    .select("id, author_id, body, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    workspaceId: auth.ctx.workspace.id,
    action: "response.note_added",
    resourceType: "response",
    resourceId: params.id,
  });

  return NextResponse.json({ ok: true, note: data }, { status: 201 });
}