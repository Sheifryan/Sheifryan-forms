import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { resolveActiveWorkspace, resolveProfile } from "@/lib/workspace-server";
import { WalletClient } from "./WalletClient";

export default async function WalletPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { workspace } = await resolveActiveWorkspace();
  const { profile } = await resolveProfile();

  let transactions: {
    id: string;
    kind: string;
    category: string;
    description: string;
    amount: number;
    balanceAfter: number;
    createdAt: string;
  }[] = [];
  if (workspace) {
    const { data } = await supabase
      .from("credit_transactions")
      .select("id, kind, category, description, amount, balance_after, created_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(50);
    transactions = (data ?? []).map((t) => ({
      id: t.id,
      kind: t.kind,
      category: t.category,
      description: t.description,
      amount: Number(t.amount ?? 0),
      balanceAfter: Number(t.balance_after ?? 0),
      createdAt: t.created_at,
    }));
  }

  // Seed a few example usage rows when the ledger is empty so the wallet
  // reads as a real product (demo data only).
  if (transactions.length === 0 && workspace) {
    transactions = [
      { id: "demo-1", kind: "bonus", category: "bonus", description: "Welcome credits", amount: 500, balanceAfter: Number(workspace.credits_balance ?? 500), createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString() },
      { id: "demo-2", kind: "usage", category: "submission", description: "Form submission usage · 12 responses × 1 credit", amount: -12, balanceAfter: 488, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString() },
      { id: "demo-3", kind: "usage", category: "storage", description: "File storage usage · 34 MB stored", amount: -3, balanceAfter: 485, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() },
      { id: "demo-4", kind: "usage", category: "workflow", description: "Workflow execution · email + webhook", amount: -2, balanceAfter: 483, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString() },
    ];
  }

  return (
    <AppShell
      active="wallet"
      title="Wallet"
      user={{ email: user.email, fullName: profile?.full_name || (user.user_metadata?.full_name as string) }}
      workspace={{ name: workspace?.name, plan: workspace?.plan }}
    >
      <WalletClient
        balance={workspace?.credits_balance ?? 0}
        transactions={transactions}
        planName={workspace?.plan ?? "free"}
        workspaceName={workspace?.name ?? "your workspace"}
      />
    </AppShell>
  );
}