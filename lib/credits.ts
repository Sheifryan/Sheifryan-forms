// Credit spends.
//
// The wallet UI promises "1 credit = 1 submission · 10 MB storage · 1 workflow
// run · 1 email", but until now the only writer of `credit_transactions` was the
// top-up route — nothing ever debited. This records usage without ever blocking
// the work it meters: an unaffordable or missing workspace simply isn't charged,
// and the caller carries on.

import type { SupabaseClient } from "@supabase/supabase-js";

export type CreditCategory = "submission" | "storage" | "email" | "workflow" | "other";

export interface SpendResult {
  charged: boolean;
  balance?: number;
  /** Why nothing was charged (never an error the caller must handle). */
  reason?: string;
}

export async function spendCredits(
  service: SupabaseClient,
  opts: { workspaceId: string | null; amount: number; category: CreditCategory; description: string }
): Promise<SpendResult> {
  if (!opts.workspaceId || opts.amount <= 0) return { charged: false, reason: "no workspace" };
  try {
    const { data } = await service
      .from("workspaces")
      .select("credits_balance")
      .eq("id", opts.workspaceId)
      .maybeSingle();
    const balance = Number((data as { credits_balance?: number } | null)?.credits_balance ?? 0);
    if (balance < opts.amount) return { charged: false, reason: "insufficient credits" };

    // Ledger first (so balance_after is accurate), then the workspace balance —
    // the same order the top-up route uses, and both as the service role.
    const { error: txnError } = await service.from("credit_transactions").insert({
      workspace_id: opts.workspaceId,
      kind: "usage",
      category: opts.category,
      description: opts.description.slice(0, 200),
      amount: -opts.amount,
      balance_after: balance - opts.amount,
    });
    if (txnError) return { charged: false, reason: txnError.message };

    await service.from("workspaces").update({ credits_balance: balance - opts.amount }).eq("id", opts.workspaceId);
    return { charged: true, balance: balance - opts.amount };
  } catch (err) {
    return { charged: false, reason: err instanceof Error ? err.message : "credit debit failed" };
  }
}
