"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Coins, Plus } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useFormat } from "@/components/FormatProvider";
import { CREDIT_PACKS } from "@/lib/plans";

interface Txn {
  id: string;
  kind: string;
  category: string;
  description: string;
  amount: number;
  balanceAfter: number;
  createdAt: string;
}

const CATEGORY_META: Record<string, { label: string; chip: string }> = {
  submission: { label: "Submissions", chip: "bg-signalSoft/20 text-signal" },
  storage: { label: "Storage", chip: "bg-sky-100 text-sky-700" },
  email: { label: "Email", chip: "bg-amber-100 text-amber-700" },
  workflow: { label: "Workflows", chip: "bg-emerald-100 text-emerald-700" },
  purchase: { label: "Purchase", chip: "bg-success/15 text-success" },
  bonus: { label: "Bonus", chip: "bg-accent2/15 text-accent2" },
  other: { label: "Other", chip: "bg-paper text-slate-500 dark:bg-panelDark dark:text-mutedDark" },
};

export function WalletClient({
  balance,
  transactions,
  planName,
  workspaceName,
}: {
  balance: number;
  transactions: Txn[];
  planName: string;
  workspaceName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { formatDateTime, formatNumber } = useFormat();
  const [buying, setBuying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState<{ credits: number; priceUsd: number } | null>(null);

  const usage: Record<string, number> = {};
  for (const t of transactions) {
    if (t.kind === "usage") usage[t.category] = (usage[t.category] ?? 0) + Math.abs(t.amount);
  }
  const usageTotal = Object.values(usage).reduce((a, b) => a + b, 0);
  const purchased = transactions.filter((t) => t.kind === "purchase").reduce((a, t) => a + Math.abs(t.amount), 0);

  async function confirmBuy() {
    if (!confirmOpen) return;
    setBuying(true);
    const res = await fetch("/api/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credits: confirmOpen.credits, priceUsd: confirmOpen.priceUsd }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      toast.success("Credits added", { description: `${formatNumber(confirmOpen.credits)} credits added to your balance.` });
      setConfirmOpen(null);
      router.refresh();
    } else {
      toast.error("Couldn't buy credits", { description: data.error ?? "Try again in a moment." });
    }
    setBuying(false);
  }

  return (
    <div className="min-h-screen p-7">
      {/* Balance hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-signal via-violet-600 to-accent2 p-7 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-body text-[11.5px] font-medium text-violet-100">{workspaceName} · {planName} plan</p>
            <p className="mt-0.5 font-display text-3xl font-bold">{formatNumber(balance)}</p>
            <p className="font-body text-[12.5px] text-violet-100">available credits</p>
          </div>
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <Coins size={26} />
          </span>
        </div>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <button
            onClick={() => setConfirmOpen(CREDIT_PACKS[1])}
            className="flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 font-body text-[12.5px] font-semibold text-signal transition hover:bg-violet-50"
          >
            <Plus size={14} /> Buy Credits
          </button>
          <button onClick={() => router.push("/settings?tab=billing")} className="rounded-full border border-white/50 bg-white/15 px-4 py-2 font-body text-xs font-semibold text-white backdrop-blur transition hover:bg-white/30">
            View plan limits
          </button>
        </div>
      </div>

      {/* Credit packs */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {CREDIT_PACKS.map((p) => (
          <div key={p.credits} className={`rounded-xl border p-4 dark:border-lineDark ${p.popular ? "border-signal bg-signalSoft/10" : "border-line bg-white dark:bg-panelDark"}`}>
            <div className="flex items-center justify-between">
              <p className="font-display text-lg font-bold text-ink dark:text-inkDark">{formatNumber(p.credits)}</p>
              {p.popular && <span className="rounded-full bg-signal px-2 py-0.5 font-body text-[10px] font-semibold text-white">Popular</span>}
            </div>
            <p className="font-body text-[12px] text-slate-500 dark:text-mutedDark">credits</p>
            {p.bonus && <p className="mt-1 font-body text-[11px] font-medium text-success">{p.bonus}</p>}
            <p className="mt-2 font-body text-[15px] font-semibold text-ink dark:text-inkDark">${p.priceUsd}</p>
            <button onClick={() => setConfirmOpen({ credits: p.credits, priceUsd: p.priceUsd })} className="mt-2.5 w-full rounded-lg bg-signal px-3 py-1.5 font-body text-[11.5px] font-semibold text-white transition hover:opacity-90">
              Buy ${p.priceUsd}
            </button>
          </div>
        ))}
      </div>

      {/* Usage + history */}
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.6fr]">
        <div className="rounded-xl border border-line bg-white p-4 shadow-sm dark:border-lineDark dark:bg-panelDark">
          <h3 className="font-display text-[15px] font-semibold text-ink dark:text-inkDark">Where credits go</h3>
          <div className="mt-3 space-y-2.5">
            {Object.keys(usage).length === 0 && purchased === 0 && (
              <p className="font-body text-[12px] text-slate-400 dark:text-mutedDark">No usage yet — start collecting responses to see it here.</p>
            )}
            {Object.entries(usage).map(([cat, amount]) => <UsageBar key={cat} cat={cat} amount={amount} total={usageTotal} />)}
            <p className="font-body text-[11px] text-slate-400 dark:text-mutedDark">1 credit = 1 submission · 10 MB storage · 1 workflow run · 1 email</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm dark:border-lineDark dark:bg-panelDark">
          <h3 className="px-4 py-3 font-display text-[15px] font-semibold text-ink dark:text-inkDark">Transaction history</h3>
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-line bg-paper text-left dark:border-lineDark dark:bg-panelDark">
                <th className="px-4 py-2.5 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Description</th>
                <th className="px-4 py-2.5 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Category</th>
                <th className="px-4 py-2.5 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Date</th>
                <th className="px-4 py-2.5 text-right font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Credits</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const meta = CATEGORY_META[t.category] ?? CATEGORY_META.other;
                return (
                  <tr key={t.id} className="border-b border-line last:border-0 dark:border-lineDark">
                    <td className="px-4 py-2.5">
                      <span className="block max-w-[240px] truncate font-body text-[12.5px] text-ink dark:text-inkDark">{t.description}</span>
                      <span className="font-body text-[10.5px] text-slate-400 dark:text-mutedDark">Balance after: {formatNumber(t.balanceAfter)}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 font-body text-[10px] font-semibold ${meta.chip}`}>{meta.label}</span>
                    </td>
                    <td className="px-4 py-2.5 font-body text-[12px] text-slate-500 dark:text-mutedDark">{formatDateTime(t.createdAt)}</td>
                    <td className={`px-4 py-2.5 text-right font-body text-sm font-semibold ${t.amount > 0 ? "text-success" : "text-ink dark:text-inkDark"}`}>
                      {t.amount > 0 ? `+${formatNumber(t.amount)}` : formatNumber(t.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={() => setConfirmOpen(null)}>
          <div className="w-full max-w-sm rounded-xl border border-line bg-white p-5 shadow-2xl dark:border-lineDark dark:bg-panelDark" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-base font-semibold text-ink dark:text-inkDark">Buy credits</h3>
            <p className="mt-2 font-body text-[13px] text-slate-500 dark:text-mutedDark">
              Add <b>{formatNumber(confirmOpen.credits)} credits</b> to <b>{workspaceName}</b> for <b>${confirmOpen.priceUsd}</b>.
            </p>
            <p className="mt-1 font-body text-[11.5px] text-slate-400 dark:text-mutedDark">This is a simulated purchase — no real charge will be made.</p>
            <div className="mt-4 flex justify-end gap-2.5">
              <button onClick={() => setConfirmOpen(null)} className="rounded-lg border border-line px-3.5 py-2 font-body text-xs font-medium text-slate-600 transition hover:bg-paper dark:border-lineDark dark:bg-panelDark dark:text-mutedDark">
                Cancel
              </button>
              <button onClick={() => void confirmBuy()} disabled={buying} className="flex items-center gap-1.5 rounded-lg bg-signal px-3.5 py-2 font-body text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
                <Check size={13} /> {buying ? "Processing…" : `Buy for $${confirmOpen.priceUsd}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UsageBar({ cat, amount, total }: { cat: string; amount: number; total: number }) {
  const { formatNumber } = useFormat();
  const meta = CATEGORY_META[cat] ?? CATEGORY_META.other;
  const pct = total > 0 ? Math.round((amount / Math.max(total, 1)) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5">
      <span className={`rounded-full px-2 py-0.5 font-body text-[10px] font-semibold ${meta.chip}`}>{meta.label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper dark:bg-panelDark">
        <div className="h-full rounded-full bg-signal" style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right font-body text-[11px] font-semibold text-ink dark:text-inkDark">-{formatNumber(amount)}</span>
    </div>
  );
}