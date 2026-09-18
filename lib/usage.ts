// The single source of truth for "how much of the plan is used".
//
// Both the Billing tab (server-rendered) and GET /api/billing call computeUsage,
// so the two can never disagree — they previously duplicated these queries and
// drifted. Every field maps 1:1 to a PlanLimits key, which is what planUsageRows
// uses to build the Billing rows, so a new plan limit shows up in one place.
//
// Counts are read with the caller's client for the workspace the caller is
// already authorised to see, so RLS scopes them exactly like the UI does.
// Metering is read-only: nothing here blocks anything.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanLimits } from "@/lib/plans";

export interface PlanUsage {
  forms: number;
  monthlyResponses: number;
  responses: number;
  storageBytes: number;
  workflows: number;
  fileUploads: number;
  members: number;
  /** AI requests this month, counted from ai_usage (see lib/ai/quota.ts). */
  aiRequests: number;
}

/** Local midnight on the 1st — the window every "/ month" limit resets on. */
export function monthStart(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** A workspace always has at least its owner as a member. */
export const EMPTY_USAGE: PlanUsage = {
  forms: 0,
  monthlyResponses: 0,
  responses: 0,
  storageBytes: 0,
  workflows: 0,
  fileUploads: 0,
  members: 1,
  aiRequests: 0,
};

/** Rows in ai_usage for the current month. Exported so the quota module can
 *  reuse it instead of duplicating the window/filter logic. */
export async function countAiRequests(client: SupabaseClient, workspaceId: string): Promise<number> {
  const { count } = await client
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .gte("created_at", monthStart().toISOString());
  return count ?? 0;
}

/**
 * Live usage for one workspace. Never throws on an empty workspace: with no
 * forms the response/file queries are scoped to an impossible id rather than
 * being skipped, so the result is 0 instead of "everything".
 */
export async function computeUsage(client: SupabaseClient, workspaceId: string): Promise<PlanUsage> {
  const noForms = ["00000000-0000-0000-0000-000000000000"];
  const monthIso = monthStart().toISOString();

  const { count: forms } = await client
    .from("forms")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  const { data: formRows } = await client.from("forms").select("id").eq("workspace_id", workspaceId);
  const formIds = (formRows ?? []).map((f) => (f as { id: string }).id);
  const scoped = formIds.length > 0 ? formIds : noForms;

  const [responses, monthlyResponses, workflows, files, fileUploads, members, aiRequests] = await Promise.all([
    client.from("responses").select("id", { count: "exact", head: true }).in("form_id", scoped),
    client.from("responses").select("id", { count: "exact", head: true }).in("form_id", scoped).gte("created_at", monthIso),
    client.from("workflows").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    client.from("form_files").select("size_bytes").in("form_id", scoped),
    client.from("form_files").select("id", { count: "exact", head: true }).in("form_id", scoped),
    client.from("workspace_members").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "active"),
    countAiRequests(client, workspaceId),
  ]);

  const sizeRows = (files.data ?? []) as { size_bytes?: number | null }[];

  return {
    forms: forms ?? 0,
    monthlyResponses: monthlyResponses.count ?? 0,
    responses: responses.count ?? 0,
    storageBytes: sizeRows.reduce((sum, f) => sum + Number(f.size_bytes ?? 0), 0),
    workflows: workflows.count ?? 0,
    fileUploads: fileUploads.count ?? 0,
    members: Math.max(members.count ?? 0, 1),
    aiRequests,
  };
}

export interface UsageMeterRow {
  /** Which PlanUsage field this row reads. */
  key: keyof PlanUsage;
  label: string;
  /** -1 = unlimited (UsageRow renders "Unlimited"). */
  limit: number;
  bytes?: boolean;
  /** Seat counts only mean something for organisations. */
  organisationsOnly?: boolean;
}

/** Every plan limit as a Billing row, in a stable order. Adding a limit to
 *  PlanLimits and a field to PlanUsage is all it takes to appear in the tab. */
export function planUsageRows(limits: PlanLimits, isOrganisation: boolean): UsageMeterRow[] {
  const rows: UsageMeterRow[] = [
    { key: "forms", label: "Forms", limit: limits.forms },
    { key: "monthlyResponses", label: "Responses / month", limit: limits.monthlyResponses },
    { key: "storageBytes", label: "Storage", limit: limits.storageBytes, bytes: true },
    { key: "workflows", label: "Workflows", limit: limits.workflows },
    { key: "fileUploads", label: "File uploads", limit: limits.fileUploads },
    { key: "aiRequests", label: "AI requests / month", limit: limits.aiRequestsPerMonth },
  ];
  if (isOrganisation) rows.push({ key: "members", label: "Members", limit: limits.members });
  return rows;
}
