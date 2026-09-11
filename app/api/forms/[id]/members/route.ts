import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorize, type AuthContext } from "@/lib/authz";
import { can, formAccessFlags, isFormAccessLevel, PERMISSION } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

// ---------------------------------------------------------------------------
// Per-form collaboration (form_members, migration 0013).
//
// A form lives in a workspace, so workspace members already reach it through
// the org role. `form_members` exists to let one form be shared with a SPECIFIC
// subset/different level — e.g. an editor who only works on one form.
//
// Who may manage access: the form's creator, organisation admins/owners (they
// hold `forms.update` / `forms.delete`), or a form_members row with
// `can_manage` set. Everyone else can still read the roster if they're a
// collaborator (RLS policy "collaborators read form members").
// ---------------------------------------------------------------------------

type SupabaseClient = ReturnType<typeof createClient>;

async function loadForm(supabase: SupabaseClient, formId: string, workspaceId: string) {
  // forms.owner_id (0001) is the form's creator — it is never rewritten when a
  // form moves workspace, so it's the right column for the "Creator" badge.
  const { data: form } = await supabase.from("forms").select("id, title, workspace_id, owner_id").eq("id", formId).maybeSingle();
  if (!form || form.workspace_id !== workspaceId) return null;
  return form;
}

async function mayManage(supabase: SupabaseClient, ctx: AuthContext, formId: string): Promise<boolean> {
  if (can(ctx.member, PERMISSION.FORMS_UPDATE) || can(ctx.member, PERMISSION.FORMS_DELETE)) return true;
  const { data } = await supabase.from("form_members").select("can_manage").eq("form_id", formId).eq("user_id", ctx.userId).maybeSingle();
  return Boolean(data?.can_manage);
}

async function nameMap(supabase: SupabaseClient, ids: string[]) {
  const map: Record<string, { name: string | null; email: string | null }> = {};
  if (ids.length === 0) return map;
  const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
  (data ?? []).forEach((p) => {
    map[p.id] = { name: p.full_name, email: p.email };
  });
  return map;
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const auth = await authorize(PERMISSION.FORMS_READ);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createClient();
  const form = await loadForm(supabase, params.id, auth.ctx.workspace.id);
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 });

  const { data: rows, error } = await supabase
    .from("form_members")
    .select("user_id, role, can_edit, can_view_responses, can_manage, can_view_analytics")
    .eq("form_id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const collaboratorIds = (rows ?? []).map((r) => r.user_id);

  // Active workspace members are the only people a form can be shared with.
  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("user_id, email, role")
    .eq("workspace_id", auth.ctx.workspace.id)
    .eq("status", "active");

  const names = await nameMap(supabase, Array.from(new Set([...collaboratorIds, ...(memberRows ?? []).map((m) => m.user_id)])));

  const collaborators = (rows ?? []).map((r) => ({
    userId: r.user_id,
    level: r.role,
    name: names[r.user_id]?.name ?? null,
    email: names[r.user_id]?.email ?? null,
    isCreator: r.user_id === form.owner_id,
  }));

  const added = new Set(collaboratorIds);
  const candidates = (memberRows ?? [])
    .filter((m) => !added.has(m.user_id))
    .map((m) => ({
      userId: m.user_id,
      workspaceRole: m.role,
      name: names[m.user_id]?.name ?? null,
      email: names[m.user_id]?.email ?? m.email ?? null,
    }));

  return NextResponse.json({
    collaborators,
    candidates,
    canManage: await mayManage(supabase, auth.ctx, params.id),
  });
}

/**
 * POST adds a collaborator, or updates their level if they're already on the
 * form (upsert — the form_members(form_id, user_id) unique index backs it).
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await authorize(PERMISSION.FORMS_READ);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createClient();
  const form = await loadForm(supabase, params.id, auth.ctx.workspace.id);
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 });

  if (!(await mayManage(supabase, auth.ctx, params.id))) {
    return NextResponse.json({ error: "You don't have permission to manage form access." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId : "";
  const level = body.level;
  if (!userId || !isFormAccessLevel(level)) {
    return NextResponse.json({ error: "A member and an access level are required." }, { status: 400 });
  }

  // Only active members of this workspace may be added — no dangling grants to
  // strangers guessing a user id.
  const { data: target } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", auth.ctx.workspace.id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "That person isn't a member of this workspace." }, { status: 400 });

  const flags = formAccessFlags(level);
  const { error } = await supabase
    .from("form_members")
    .upsert({ form_id: params.id, user_id: userId, role: level, ...flags, added_by: auth.ctx.userId }, { onConflict: "form_id,user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    workspaceId: auth.ctx.workspace.id,
    action: "form.collaborator_added",
    resourceType: "form",
    resourceId: params.id,
    metadata: { user_id: userId, level },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = await authorize(PERMISSION.FORMS_READ);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createClient();
  const form = await loadForm(supabase, params.id, auth.ctx.workspace.id);
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 });

  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  // Anyone may remove themselves; managing others needs manage rights.
  if (userId !== auth.ctx.userId && !(await mayManage(supabase, auth.ctx, params.id))) {
    return NextResponse.json({ error: "You don't have permission to manage form access." }, { status: 403 });
  }

  const { error } = await supabase.from("form_members").delete().eq("form_id", params.id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    workspaceId: auth.ctx.workspace.id,
    action: "form.collaborator_removed",
    resourceType: "form",
    resourceId: params.id,
    metadata: { user_id: userId },
  });

  return NextResponse.json({ ok: true });
}
