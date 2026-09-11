import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveWorkspace } from "@/lib/workspace-server";

// Deletes a folder scoped to the caller's active workspace. RLS enforces
// membership; the workspace filter stops cross-workspace deletes.
function scopedDelete(supabase: ReturnType<typeof createClient>, table: "folders", id: string, workspaceId?: string) {
  let q = supabase.from(table).delete().eq("id", id);
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  return q;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await resolveActiveWorkspace();

  const body = await request.json().catch(() => ({}));
  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  let updateQuery = supabase.from("folders").update({ name: body.name.trim() }).eq("id", params.id);
  if (workspace?.id) updateQuery = updateQuery.eq("workspace_id", workspace.id);
  const { error } = await updateQuery;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await resolveActiveWorkspace();

  // Forms in this folder fall back to Uncategorized automatically —
  // forms.folder_id references folders(id) on delete set null.
  const { error } = await scopedDelete(supabase, "folders", params.id, workspace?.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
