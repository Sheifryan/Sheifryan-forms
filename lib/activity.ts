import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Organisation activity log.
//
// Written as the *signed-in user* (not the service role), so the RLS insert
// policy on activity_logs guarantees the row is attributed to a real active
// member of that workspace. Logging must never break the action it records, so
// every failure is swallowed.
// ---------------------------------------------------------------------------

export type ActivityAction =
  | "workspace.created"
  | "workspace.updated"
  | "workspace.security_updated"
  | "workspace.deleted"
  | "member.invited"
  | "member.joined"
  | "member.removed"
  | "member.role_changed"
  | "member.suspended"
  | "member.reactivated"
  | "form.created"
  | "form.updated"
  | "form.published"
  | "form.unpublished"
  | "form.duplicated"
  | "form.deleted"
  | "form.collaborator_added"
  | "form.collaborator_removed"
  | "response.received"
  | "response.assigned"
  | "response.status_changed"
  | "response.note_added"
  | "response.deleted"
  | "workflow.created"
  | "workflow.updated"
  | "workflow.toggled"
  | "workflow.duplicated"
  | "workflow.deleted"
  | "workflow.ran"
  | "file.deleted"
  | "billing.plan_changed"
  | "billing.credits_purchased";

export type ActivityResourceType = "workspace" | "form" | "response" | "member" | "workflow" | "file" | "billing";

export interface LogActivityInput {
  workspaceId: string;
  action: ActivityAction;
  resourceType?: ActivityResourceType;
  resourceId?: string | null;
  resourceLabel?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("activity_logs").insert({
      workspace_id: input.workspaceId,
      user_id: user.id,
      action: input.action,
      resource_type: input.resourceType ?? null,
      resource_id: input.resourceId ?? null,
      resource_label: input.resourceLabel ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (err) {
    // Never let audit logging fail the primary operation.
    console.error("[activity] failed to log", input.action, err);
  }
}

/**
 * Log an action that has no signed-in actor — see lib/system-activity.ts.
 *
 * Split out because the workflow runner (a public, session-less request path)
 * must not drag next/headers into its import graph.
 */
export { logSystemActivity, type SystemActivityInput } from "./system-activity";

/** Human-readable verb for an action, used by the activity feed. */
export function activityVerb(action: string): string {
  const verbs: Record<string, string> = {
    "workspace.created": "created the organisation",
    "workspace.updated": "updated organisation settings",
    "workspace.security_updated": "updated security policy",
    "workspace.deleted": "deleted the organisation",
    "member.invited": "invited a member",
    "member.joined": "joined the organisation",
    "member.removed": "removed a member",
    "member.role_changed": "changed a member's role",
    "member.suspended": "suspended a member",
    "member.reactivated": "reactivated a member",
    "form.created": "created a form",
    "form.updated": "updated a form",
    "form.published": "published a form",
    "form.unpublished": "unpublished a form",
    "form.duplicated": "duplicated a form",
    "form.deleted": "deleted a form",
    "form.collaborator_added": "added a form collaborator",
    "form.collaborator_removed": "removed a form collaborator",
    "response.received": "received a new response",
    "response.assigned": "assigned a response",
    "response.status_changed": "changed a response status",
    "response.note_added": "added a note to a response",
    "response.deleted": "deleted a response",
    "workflow.created": "created a workflow",
    "workflow.updated": "updated a workflow",
    "workflow.toggled": "toggled a workflow",
    "workflow.duplicated": "duplicated a workflow",
    "workflow.deleted": "deleted a workflow",
    "workflow.ran": "ran a workflow",
    "file.deleted": "deleted a file",
    "billing.plan_changed": "changed the subscription plan",
    "billing.credits_purchased": "purchased credits",
  };
  return verbs[action] ?? action.replace(/[._]/g, " ");
}

/** Tailwind chip classes per action family, for the activity feed. */
export function activityTone(action: string): string {
  if (action.startsWith("form.")) return "bg-signalSoft/25 text-signal";
  if (action.startsWith("member.")) return "bg-accent2/15 text-accent2";
  if (action.startsWith("response.")) return "bg-sky-100 text-sky-700";
  if (action.startsWith("workflow.")) return "bg-emerald-100 text-emerald-700";
  if (action.startsWith("billing.")) return "bg-amber-100 text-amber-700";
  if (action.startsWith("file.")) return "bg-paper text-slate-500 dark:bg-panelDark dark:text-mutedDark";
  return "bg-paper text-slate-500 dark:bg-panelDark dark:text-mutedDark";
}