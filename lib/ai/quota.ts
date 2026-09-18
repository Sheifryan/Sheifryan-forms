// AI request metering.
//
// Every other plan limit is derived live from the resource table it measures
// (forms, responses, form_files, workflows, workspace_members), so no history
// is needed. An AI call leaves no such trace — the provider is external — so
// each successful request writes one row here, and the Billing tab counts the
// current month's rows against the plan's aiRequestsPerMonth.
//
// METER ONLY: nothing in the app blocks on these numbers yet. The writer is
// deliberately fire-and-forget, mirroring lib/credits.ts — metering must never
// break the feature it meters.

import type { SupabaseClient } from "@supabase/supabase-js";
import { planById } from "@/lib/plans";
import { countAiRequests } from "@/lib/usage";

export type AiRequestKind = "ask" | "insight" | "generate" | "improve" | "critique" | "import";

export const AI_REQUEST_KINDS: AiRequestKind[] = ["ask", "insight", "generate", "improve", "critique", "import"];

export interface AiUsage {
  used: number;
  /** -1 = unlimited. */
  limit: number;
  unlimited: boolean;
  /** null when unlimited. */
  remaining: number | null;
}

/**
 * Record one AI request against the workspace that owns the form. One user
 * action = one row, however many provider calls it took (ask interprets, then
 * optionally narrates; improve critiques, then rewrites).
 *
 * Never throws and never rejects — `void recordAiUsage(...)` and carry on.
 * Returns whether the row was written (for tests and logging).
 */
export async function recordAiUsage(
  service: SupabaseClient,
  opts: { workspaceId: string | null; userId?: string | null; formId?: string | null; kind: AiRequestKind }
): Promise<boolean> {
  if (!opts.workspaceId) return false;
  try {
    const { error } = await service.from("ai_usage").insert({
      workspace_id: opts.workspaceId,
      user_id: opts.userId ?? null,
      form_id: opts.formId ?? null,
      kind: opts.kind,
    });
    if (error) {
      console.error("[ai/quota] usage not recorded:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[ai/quota] usage not recorded:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** This month's AI requests for a workspace, against its plan's allowance. */
export async function getAiUsage(
  client: SupabaseClient,
  workspaceId: string,
  plan: string | null | undefined
): Promise<AiUsage> {
  const limit = planById(plan).limits.aiRequestsPerMonth;
  const used = await countAiRequests(client, workspaceId);
  const unlimited = limit < 0;
  return {
    used,
    limit,
    unlimited,
    remaining: unlimited ? null : Math.max(0, limit - used),
  };
}
