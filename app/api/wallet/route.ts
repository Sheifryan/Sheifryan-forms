import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { resolveActiveWorkspace } from "@/lib/workspace-server";

// Credit ledger. Purchases (inserts) are simulated here — there's no real
// payment provider wired into the wallet yet (forms already have MarzPay for
// field-level collections). The insert runs with the service client because
// RLS only grants the owner SELECT on their own transactions.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await resolveActiveWorkspace();
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const credits = Number(body.credits);
  const priceUsd = Number(body.priceUsd);
  if (!Number.isFinite(credits) || credits <= 0 || credits > 100000) {
    return NextResponse.json({ error: "Invalid credit amount" }, { status: 400 });
  }

  const service = createServiceClient();
  const balance = Number(workspace.credits_balance ?? 0);

  // Insert a transaction first so the balance_after is accurate, then update
  // the workspace balance. Both run as service-role so the RLS SELECT-only
  // policy on the ledger doesn't block us.
  const { error: txnError } = await service.from("credit_transactions").insert({
    workspace_id: workspace.id,
    kind: "purchase",
    category: "purchase",
    description: `Purchased ${credits.toLocaleString()} credits${Number.isFinite(priceUsd) && priceUsd > 0 ? ` — USD ${priceUsd}` : ""}`,
    amount: credits,
    balance_after: balance + credits,
  });

  if (txnError) return NextResponse.json({ error: txnError.message }, { status: 500 });

  const { error: updateError } = await service
    .from("workspaces")
    .update({ credits_balance: balance + credits })
    .eq("id", workspace.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, balance: balance + credits });
}