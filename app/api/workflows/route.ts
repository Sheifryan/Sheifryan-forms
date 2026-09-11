import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveWorkspace } from "@/lib/workspace-server";
import { authorize } from "@/lib/authz";
import { PERMISSION } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

const ACTION_TYPES_RAW = [
  "email_notification",
  "confirmation_email",
  "webhook",
  "update_status",
  "assign_response",
  "notify_team",
] as const;
type WorkflowActionType = (typeof ACTION_TYPES_RAW)[number];

interface WorkflowAction {
  type: WorkflowActionType;
  label?: string;
  emailTo?: string;
  webhookUrl?: string;
  internalStatus?: string;
  /** assign_response — the workspace member who owns the new response. */
  assignToUserId?: string;
  /** notify_team — members to alert. Empty means "everyone with access". */
  notifyUserIds?: string[];
}

function validActions(value: unknown): WorkflowAction[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((a) => a && typeof a === "object" && ACTION_TYPES_RAW.includes((a as WorkflowAction).type))
    .slice(0, 5)
    .map((a) => {
      const action = a as WorkflowAction;
      const clean: WorkflowAction = { type: action.type };
      if (typeof action.label === "string") clean.label = action.label.slice(0, 80);
      if (typeof action.emailTo === "string") clean.emailTo = action.emailTo.slice(0, 200);
      if (typeof action.webhookUrl === "string") clean.webhookUrl = action.webhookUrl.slice(0, 500);
      if (typeof action.internalStatus === "string") clean.internalStatus = action.internalStatus.slice(0, 40);
      if (typeof action.assignToUserId === "string" && action.assignToUserId) clean.assignToUserId = action.assignToUserId;
      if (Array.isArray(action.notifyUserIds)) {
        clean.notifyUserIds = action.notifyUserIds.filter((v) => typeof v === "string").slice(0, 50);
      }
      return clean;
    });
}

// GET [/api/workflows?form=<id>]      – list workflows for the current workspace.
// POST [/api/workflows]                – create a workflow.
// POST [/api/workflows?duplicate=<id>] – clone an existing workflow.
// PATCH [/api/workflows?id=<w>]        – update fields.
// DELETE [/api/workflows?id=<w>]       – remove a workflow.
async function workspaceScope() {
  const { workspace } = await resolveActiveWorkspace();
  return workspace?.id ?? null;
}

/** Active member ids of a workspace — used to reject dangling assignees. */
async function activeMemberIds(supabase: ReturnType<typeof createClient>, workspaceId: string): Promise<Set<string>> {
  const { data } = await supabase.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("status", "active");
  return new Set((data ?? []).map((m) => m.user_id));
}

/**
 * Drops collaborator references that don't belong to the workspace. A stale id
 * would otherwise sit in the JSON forever and silently never fire.
 */
function pruneActions(actions: WorkflowAction[], memberIds: Set<string> | null): WorkflowAction[] {
  if (!memberIds) return actions;
  return actions.map((a) => {
    const next = { ...a };
    if (next.assignToUserId && !memberIds.has(next.assignToUserId)) delete next.assignToUserId;
    if (next.notifyUserIds) {
      const kept = next.notifyUserIds.filter((id) => memberIds.has(id));
      if (kept.length > 0) next.notifyUserIds = kept;
      else delete next.notifyUserIds;
    }
    return next;
  });
}

export async function GET(request: Request) {
  const auth = await authorize(PERMISSION.FORMS_READ);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createClient();
  const workspaceId = auth.ctx.workspace.id;

  let query = supabase
    .from("workflows")
    .select("id, workspace_id, name, trigger_type, trigger_form_id, actions, enabled, last_run_at, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  const { searchParams } = new URL(request.url);
  const formId = searchParams.get("form");
  if (formId) query = query.eq("trigger_form_id", formId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workflows: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await authorize(PERMISSION.WORKFLOWS_CREATE);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createClient();
  const workspaceId = auth.ctx.workspace.id;
  const { searchParams } = new URL(request.url);
  const duplicateId = searchParams.get("duplicate");
  const memberIds = await activeMemberIds(supabase, workspaceId);

  // Duplicate: clone an existing workflow of THIS workspace, disabled so a
  // half-edited copy never starts firing.
  if (duplicateId) {
    const { data: source } = await supabase
      .from("workflows")
      .select("name, trigger_type, trigger_form_id, actions")
      .eq("id", duplicateId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!source) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });

    const { data, error } = await supabase
      .from("workflows")
      .insert({
        workspace_id: workspaceId,
        name: `${source.name} (copy)`,
        trigger_type: source.trigger_type,
        trigger_form_id: source.trigger_form_id,
        actions: pruneActions(validActions(source.actions), memberIds),
        enabled: false,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logActivity({
      workspaceId,
      action: "workflow.duplicated",
      resourceType: "workflow",
      resourceId: data.id,
      metadata: { source_id: duplicateId },
    });
    return NextResponse.json({ id: data.id }, { status: 201 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "New workflow";
  const triggerFormId = typeof body.formId === "string" ? body.formId : null;
  const actions = pruneActions(validActions(body.actions), memberIds);

  // The trigger form (if any) must belong to the user's workspace.
  const { data: ownedForm } = triggerFormId
    ? await supabase.from("forms").select("workspace_id").eq("id", triggerFormId).maybeSingle()
    : { data: null };
  if (triggerFormId && (!ownedForm || ownedForm.workspace_id !== workspaceId)) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("workflows")
    .insert({
      workspace_id: workspaceId,
      name,
      trigger_type: "new_response",
      trigger_form_id: triggerFormId,
      actions,
      enabled: true,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    workspaceId,
    action: "workflow.created",
    resourceType: "workflow",
    resourceId: data.id,
    metadata: { name },
  });

  return NextResponse.json({ id: data.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await authorize(PERMISSION.WORKFLOWS_UPDATE);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createClient();
  const workspaceId = auth.ctx.workspace.id;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
  if (typeof body.enabled === "boolean") update.enabled = body.enabled;
  if (body.actions !== undefined) {
    update.actions = pruneActions(validActions(body.actions), await activeMemberIds(supabase, workspaceId));
  }
  if (typeof body.triggerFormId === "string" && body.triggerFormId) {
    const { data: owned } = await supabase.from("forms").select("workspace_id").eq("id", body.triggerFormId).maybeSingle();
    if (owned && owned.workspace_id === workspaceId) update.trigger_form_id = body.triggerFormId;
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true });

  const { error } = await supabase.from("workflows").update(update).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await authorize(PERMISSION.WORKFLOWS_DELETE);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase.from("workflows").delete().eq("id", id).eq("workspace_id", auth.ctx.workspace.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    workspaceId: auth.ctx.workspace.id,
    action: "workflow.deleted",
    resourceType: "workflow",
    resourceId: id,
  });

  return NextResponse.json({ ok: true });
}