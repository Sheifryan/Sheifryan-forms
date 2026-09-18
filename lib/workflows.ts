// Workflow execution — the runtime that was missing.
//
// Workflows have been configurable since 0011 (a trigger plus an ordered list of
// actions), but nothing ever consumed them: /api/workflows is CRUD-only, the
// submit route fired form-level webhooks directly, and `last_run_at` was never
// written. This module runs them.
//
// It works on the SERVICE client, because it is triggered by a public
// submission where there is no session. It is strictly best-effort: every action
// is isolated, so a bad URL, a missing email key or a stale assignee can never
// turn a recorded submission into an error for the respondent.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormSchema, WebhookConfig, WebhookEvent } from "./schema";
import { respondentFrom } from "./respondents";
import { buildSubmissionPayload, deliverWebhook } from "./webhooks";
import { emailFromAnswers, sendEmail } from "./email";
import { spendCredits } from "./credits";
import { logSystemActivity } from "./system-activity";

/** Mirrors ACTION_TYPES_RAW in app/api/workflows/route.ts (the write gate). */
export const WORKFLOW_ACTION_TYPES = [
  "email_notification",
  "confirmation_email",
  "webhook",
  "update_status",
  "assign_response",
  "notify_team",
] as const;

export type WorkflowActionType = (typeof WORKFLOW_ACTION_TYPES)[number];

export interface WorkflowAction {
  type: WorkflowActionType;
  label?: string;
  /** email_notification — defaults to the form's notifyEmail. */
  emailTo?: string;
  /** webhook — where the submission payload is POSTed. */
  webhookUrl?: string;
  /** update_status — one of the responses.status values from 0013. */
  internalStatus?: string;
  /** assign_response — a workspace member. */
  assignToUserId?: string;
  /** notify_team — empty means "everyone with access". */
  notifyUserIds?: string[];
}

export interface WorkflowRow {
  id: string;
  workspace_id: string;
  name: string;
  trigger_type: string;
  trigger_form_id: string | null;
  actions: unknown;
  enabled: boolean;
}

export interface RunContext {
  formId: string;
  /** The form's workspace (null for pre-workspace forms) — scopes the query. */
  workspaceId: string | null;
  responseId: string;
  answers: Record<string, unknown>;
  schema: FormSchema;
  formTitle: string;
  schemaVersion: number;
  /** The form's own notification address, used by email_notification. */
  notifyEmail: string | null;
}

export interface ActionResult {
  workflowId: string;
  type: WorkflowActionType;
  ok: boolean;
  detail?: string;
}

export interface WorkflowRunSummary {
  workflowId: string;
  name: string;
  /** Set when the run was refused as a duplicate. */
  skipped?: "already-ran";
  actions: ActionResult[];
}

/** The statuses responses.status accepts (0013). */
export const RESPONSE_STATUSES = new Set(["new", "in_progress", "completed", "archived"]);
const MAX_ACTIONS = 5;

/** Runtime-safe read of the stored jsonb; the CRUD route is the write gate. */
export function parseWorkflowActions(raw: unknown): WorkflowAction[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (a): a is WorkflowAction =>
        Boolean(a) && typeof a === "object" && WORKFLOW_ACTION_TYPES.includes((a as WorkflowAction).type)
    )
    .slice(0, MAX_ACTIONS);
}

/**
 * Enabled workflows that should fire for this form.
 *
 * A workflow applies when it targets this form, or when it targets no form at
 * all ("any form") — but only within its own workspace, so one organisation's
 * catch-all can never run on another organisation's submission. Pre-workspace
 * forms have no workspace to match, so only explicitly targeted workflows apply.
 */
export async function workflowsForForm(
  service: SupabaseClient,
  formId: string,
  workspaceId: string | null
): Promise<WorkflowRow[]> {
  let query = service
    .from("workflows")
    .select("id, workspace_id, name, trigger_type, trigger_form_id, actions, enabled")
    .eq("enabled", true);

  if (workspaceId) {
    query = query
      .eq("workspace_id", workspaceId)
      .or(`trigger_form_id.eq.${formId},trigger_form_id.is.null`);
  } else {
    query = query.eq("trigger_form_id", formId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[workflows] couldn't load workflows:", error.message);
    return [];
  }
  return (data ?? []) as WorkflowRow[];
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Active members of a workspace — used to validate and to fan out. */
async function activeMemberIds(service: SupabaseClient, workspaceId: string): Promise<string[]> {
  const { data } = await service
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("status", "active");
  return (data ?? []).map((m) => m.user_id as string);
}

function respondentLabel(answers: Record<string, unknown>): string {
  return respondentFrom(answers);
}

/**
 * Emails are billed like everything else in the wallet ("1 credit = 1 email"),
 * and only on success — a rejected or unconfigured send costs nothing.
 */
async function meterEmail(service: SupabaseClient, ctx: RunContext, to: string): Promise<void> {
  await spendCredits(service, {
    workspaceId: ctx.workspaceId,
    amount: 1,
    category: "email",
    description: `Email to ${to}`,
  });
}

async function runAction(
  service: SupabaseClient,
  workflow: WorkflowRow,
  action: WorkflowAction,
  ctx: RunContext
): Promise<string | undefined> {
  switch (action.type) {
    case "update_status": {
      const status = (action.internalStatus ?? "").trim();
      if (!RESPONSE_STATUSES.has(status)) {
        throw new Error(`"${status || "(empty)"}" is not a response status`);
      }
      const { error } = await service.from("responses").update({ status }).eq("id", ctx.responseId);
      if (error) throw new Error(error.message);
      return `status → ${status}`;
    }

    case "assign_response": {
      const assignee = (action.assignToUserId ?? "").trim();
      if (!assignee) throw new Error("no assignee configured");
      if (ctx.workspaceId) {
        const members = await activeMemberIds(service, ctx.workspaceId);
        if (!members.includes(assignee)) throw new Error("assignee is no longer an active member");
      }
      const { error } = await service.from("responses").update({ assigned_to: assignee }).eq("id", ctx.responseId);
      if (error) throw new Error(error.message);
      return "response assigned";
    }

    case "webhook": {
      const url = (action.webhookUrl ?? "").trim();
      if (!/^https?:\/\//i.test(url)) throw new Error("no webhook URL configured");

      // Reuse the form-level delivery path, so workflow webhooks inherit the
      // signed payload, the timeout and the webhook_deliveries audit trail.
      const webhook: WebhookConfig = {
        id: `workflow-${workflow.id}`,
        name: action.label || workflow.name,
        url,
        events: ["submission"] as WebhookEvent[],
        enabled: true,
        createdAt: new Date().toISOString(),
      };
      const payload = buildSubmissionPayload(
        { id: ctx.formId, title: ctx.formTitle, schema_version: ctx.schemaVersion },
        ctx.schema,
        {
          responseId: ctx.responseId,
          answers: ctx.answers,
          meta: { source: "workflow", workflowId: workflow.id },
          createdAt: new Date().toISOString(),
        }
      );
      const result = await deliverWebhook(service, {
        formId: ctx.formId,
        webhook,
        event: "submission",
        payload,
      });
      if (!result.ok) {
        throw new Error(result.error ?? `endpoint returned HTTP ${result.statusCode ?? "?"}`);
      }
      return `delivered (HTTP ${result.statusCode})`;
    }

    case "email_notification": {
      const to = (action.emailTo ?? "").trim() || (ctx.notifyEmail ?? "").trim();
      const result = await sendEmail({
        to,
        subject: `New response — ${ctx.formTitle}`,
        text:
          `${respondentLabel(ctx.answers)} submitted "${ctx.formTitle}".\n\n` +
          `Open it: /responses?form=${ctx.formId}&open=${ctx.responseId}\n`,
      });
      if (!result.ok) throw new Error(result.error ?? "email failed");
      await meterEmail(service, ctx, to);
      return `emailed ${to}`;
    }

    case "confirmation_email": {
      const to = emailFromAnswers(ctx.answers);
      if (!to) throw new Error("the submission didn't include an email address");
      const result = await sendEmail({
        to,
        subject: `Thanks for submitting ${ctx.formTitle}`,
        text: `Thanks — your response to "${ctx.formTitle}" has been recorded.\n`,
      });
      if (!result.ok) throw new Error(result.error ?? "email failed");
      await meterEmail(service, ctx, to);
      return `confirmation sent to ${to}`;
    }

    case "notify_team": {
      if (!ctx.workspaceId) throw new Error("this form isn't in a workspace");
      const configured = (action.notifyUserIds ?? []).filter(Boolean);
      const members = await activeMemberIds(service, ctx.workspaceId);
      const recipients = configured.length > 0 ? configured.filter((id) => members.includes(id)) : members;
      if (recipients.length === 0) throw new Error("no team members to notify");

      const rows = recipients.map((userId) => ({
        workspace_id: ctx.workspaceId,
        user_id: userId,
        kind: "workflow",
        title: `New response — ${ctx.formTitle}`,
        body: `${respondentLabel(ctx.answers)} submitted a response${workflow.name ? ` (${workflow.name})` : ""}.`,
        href: `/responses?form=${ctx.formId}&open=${ctx.responseId}`,
        resource_type: "response",
        resource_id: ctx.responseId,
      }));
      const { error } = await service.from("notifications").insert(rows);
      if (error) throw new Error(error.message);
      return `notified ${recipients.length} member${recipients.length === 1 ? "" : "s"}`;
    }

    default:
      throw new Error(`unsupported action "${String((action as { type?: string }).type)}"`);
  }
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** True when this workflow already ran for this response (idempotency guard). */
async function alreadyRan(service: SupabaseClient, workflowId: string, responseId: string): Promise<boolean> {
  const { data } = await service
    .from("workflow_runs")
    .select("id")
    .eq("workflow_id", workflowId)
    .eq("response_id", responseId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Run every enabled workflow that a new response triggers.
 *
 * Never throws: a failure here must not affect the response the respondent just
 * submitted. Returns a per-workflow summary (mostly for tests and callers that
 * want to log it).
 */
export async function runWorkflows(service: SupabaseClient, ctx: RunContext): Promise<WorkflowRunSummary[]> {
  let workflows: WorkflowRow[] = [];
  try {
    workflows = await workflowsForForm(service, ctx.formId, ctx.workspaceId);
  } catch (err) {
    console.error("[workflows] lookup failed:", err);
    return [];
  }

  const summaries: WorkflowRunSummary[] = [];

  for (const workflow of workflows) {
    try {
      // A retried submission must not assign, email or post twice.
      if (await alreadyRan(service, workflow.id, ctx.responseId)) {
        summaries.push({ workflowId: workflow.id, name: workflow.name, skipped: "already-ran", actions: [] });
        continue;
      }

      const actions = parseWorkflowActions(workflow.actions);
      const results: ActionResult[] = [];
      for (const action of actions) {
        try {
          const detail = await runAction(service, workflow, action, ctx);
          results.push({ workflowId: workflow.id, type: action.type, ok: true, detail });
        } catch (err) {
          const detail = err instanceof Error ? err.message : "action failed";
          results.push({ workflowId: workflow.id, type: action.type, ok: false, detail });
          console.error(`[workflows] ${workflow.name}: ${action.type} failed —`, detail);
        }
      }

      const ok = results.every((r) => r.ok);

      // Record the run: this row IS the idempotency guard, and doubles as the
      // per-action history. Insert first; if a concurrent submit won the race we
      // just leave its row alone.
      const { error: runError } = await service.from("workflow_runs").insert({
        workflow_id: workflow.id,
        response_id: ctx.responseId,
        workspace_id: ctx.workspaceId,
        ok,
        actions: results.map((r) => ({ type: r.type, ok: r.ok, detail: r.detail ?? null })),
      });
      if (runError && !/duplicate key/i.test(runError.message)) {
        console.error(`[workflows] couldn't record the run for ${workflow.name}:`, runError.message);
      }

      await service.from("workflows").update({ last_run_at: new Date().toISOString() }).eq("id", workflow.id);

      await logSystemActivity(service, {
        workspaceId: workflow.workspace_id,
        action: "workflow.ran",
        resourceType: "workflow",
        resourceId: workflow.id,
        resourceLabel: workflow.name,
        metadata: { formId: ctx.formId, responseId: ctx.responseId, ok, actions: results },
      });

      // The wallet promises "1 credit = 1 workflow run". Never fatal, and never
      // charged twice: this path runs once per (workflow, response).
      await spendCredits(service, {
        workspaceId: ctx.workspaceId,
        amount: 1,
        category: "workflow",
        description: `Workflow "${workflow.name}" ran`,
      });

      summaries.push({ workflowId: workflow.id, name: workflow.name, actions: results });
    } catch (err) {
      // One broken workflow never stops the others (or the submission).
      console.error(`[workflows] ${workflow.name} failed:`, err);
      summaries.push({ workflowId: workflow.id, name: workflow.name, actions: [] });
    }
  }

  return summaries;
}


