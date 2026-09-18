// Service-role activity logging.
//
// The workflow runner fires from a *public* submission, where there is no
// session — so `logActivity` in lib/activity.ts (which writes as the signed-in
// user, and therefore imports next/headers) can't be used. This variant takes
// the service client instead and records a null actor, so the feed reads
// "Someone ran a workflow" rather than mis-attributing it to a person.
//
// Kept in its own module so the runner's import graph stays free of Next-only
// modules and can be unit-tested with plain `tsc` + `node --test`.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface SystemActivityInput {
  workspaceId: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string | null;
  resourceLabel?: string | null;
  metadata?: Record<string, unknown>;
}

/** Never throws: audit logging must not break the work it records. */
export async function logSystemActivity(service: SupabaseClient, input: SystemActivityInput): Promise<void> {
  if (!input.workspaceId) return;
  try {
    await service.from("activity_logs").insert({
      workspace_id: input.workspaceId,
      user_id: null,
      action: input.action,
      resource_type: input.resourceType ?? null,
      resource_id: input.resourceId ?? null,
      resource_label: input.resourceLabel ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (err) {
    console.error("[activity] failed to log system action", input.action, err);
  }
}
