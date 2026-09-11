import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorize } from "@/lib/authz";
import { PERMISSION } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

const RESPONSE_STATUSES = ["new", "in_progress", "completed", "archived"] as const;

// Confirms the response belongs to the caller's ACTIVE workspace before any
// write. RLS already scopes reads; this stops a member of two workspaces from
// acting on the wrong one.
async function responseInActiveWorkspace(supabase: ReturnType<typeof createClient>, responseId: string, workspaceId: string) {
  const { data: row } = await supabase.from("responses").select("id, form_id").eq("id", responseId).maybeSingle();
  if (!row) return null;
  const { data: form } = await supabase.from("forms").select("workspace_id").eq("id", row.form_id).maybeSingle();
  if (!form || form.workspace_id !== workspaceId) return null;
  return row;
}

// PATCH /api/responses/[id] — assign to a member and/or change status.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await authorize(PERMISSION.RESPONSES_UPDATE);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createClient();
  const workspaceId = auth.ctx.workspace.id;

  const row = await responseInActiveWorkspace(supabase, params.id, workspaceId);
  if (!row) return NextResponse.json({ error: "Response not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  if (body.assignedTo === null) update.assigned_to = null;
  else if (typeof body.assignedTo === "string" && body.assignedTo) update.assigned_to = body.assignedTo;

  if (typeof body.status === "string" && (RESPONSE_STATUSES as readonly string[]).includes(body.status)) {
    update.status = body.status;
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true });

  const { error } = await supabase.from("responses").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    workspaceId,
    action: update.status ? "response.status_changed" : "response.assigned",
    resourceType: "response",
    resourceId: params.id,
    metadata: update,
  });

  return NextResponse.json({ ok: true });
}

// Deletes a response. The response's file objects are left orphaned in the
// bucket (form_files rows cascade away with the response; the objects stay
// until a cleanup sweep).
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: responseRow } = await supabase.from("responses").select("form_id").eq("id", params.id).maybeSingle();
  if (!responseRow) return NextResponse.json({ error: "Response not found" }, { status: 404 });

  const { error } = await supabase.from("responses").delete().eq("id", params.id).eq("form_id", responseRow.form_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}