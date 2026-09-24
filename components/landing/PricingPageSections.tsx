import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { ORG_PLAN_ORDER, PLAN_ORDER, PLANS, formatBytes } from "@/lib/plans";
import { Reveal } from "./Reveal";

/**
 * Page-specific sections for /pricing.
 *
 * Both tables are generated from lib/plans.ts — the same data the app enforces
 * and the landing page's Pricing cards read from — so a comparison row can never
 * contradict what a workspace actually gets.
 */

const nf = new Intl.NumberFormat("en-US");

/** -1 means "unlimited" throughout lib/plans.ts. */
const count = (n: number) => (n === -1 ? "Unlimited" : nf.format(n));
const price = (monthly: number) => (monthly === 0 ? "Free" : `$${monthly} / month`);

const PERSONAL_HEADERS = [
  "Plan",
  "Price",
  "Forms",
  "Responses / month",
  "Storage",
  "Workflows",
  "AI credits / month",
];

const ORG_HEADERS = [
  "Plan",
  "Price",
  "Forms",
  "Responses / month",
  "Storage",
  "Workflows",
  "Members",
];

const PERSONAL_ROWS = PLAN_ORDER.map((id) => {
  const plan = PLANS[id];
  return [
    plan.name,
    price(plan.priceMonthly),
    count(plan.limits.forms),
    count(plan.limits.monthlyResponses),
    formatBytes(plan.limits.storageBytes),
    count(plan.limits.workflows),
    count(plan.limits.creditsPerMonth),
  ];
});

const ORG_ROWS = ORG_PLAN_ORDER.map((id) => {
  const plan = PLANS[id];
  return [
    plan.name,
    price(plan.priceMonthly),
    count(plan.limits.forms),
    count(plan.limits.monthlyResponses),
    formatBytes(plan.limits.storageBytes),
    count(plan.limits.workflows),
    count(plan.limits.members),
  ];
});

function PlanTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-lg border border-line dark:border-lineDark">
      <table className="w-full min-w-[44rem] border-collapse text-left">
        <thead className="bg-paper dark:bg-night/40">
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                scope="col"
                className="border-b border-line px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:border-lineDark dark:text-mutedDark"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className="border-b border-line last:border-0 dark:border-lineDark">
              {row.map((cell, index) => (
                <td
                  key={index}
                  className={`px-3 py-2 font-body text-[12.5px] ${
                    index === 0
                      ? "font-semibold text-ink dark:text-inkDark"
                      : "text-slate-600 dark:text-mutedDark"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PlanComparison() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl dark:text-inkDark">
            Compare every limit.
          </h2>
          <p className="mt-3 font-body text-[14.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
            Personal plans are for one person. Organisation plans replace the member limit and add
            shared workspaces, roles and an activity log.
          </p>
        </Reveal>

        <Reveal className="mt-10" delay={0.05}>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-signal dark:text-signalSoft">
            Personal
          </p>
          <PlanTable headers={PERSONAL_HEADERS} rows={PERSONAL_ROWS} />
        </Reveal>

        <Reveal className="mt-10" delay={0.1}>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-signal dark:text-signalSoft">
            Organisation
          </p>
          <PlanTable headers={ORG_HEADERS} rows={ORG_ROWS} />
        </Reveal>
      </div>
    </section>
  );
}

const BILLING_FACTS = [
  {
    title: "Credits are the metering unit",
    body: "AI actions, workflow runs and each email actually sent cost credits. Failed or unconfigured actions are not charged.",
  },
  {
    title: "Top up from the Wallet",
    body: "When a busy month runs your credits down, credit packs are available from the Wallet.",
  },
  {
    title: "The limits are real",
    body: "Forms, responses, storage, workflows and uploads are counted server-side. Both tables above come from the same plan data the app enforces.",
  },
  {
    title: "Payments stay optional",
    body: "Payment fields work where MarzPay is configured for the deployment. Everything else works without it.",
  },
];

export function BillingFaq() {
  return (
    <section className="border-y border-line bg-white py-16 sm:py-20 dark:border-lineDark dark:bg-panelDark">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl dark:text-inkDark">
            How billing works.
          </h2>
          <p className="mt-3 font-body text-[14.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
            No hidden metering — every charge maps to something the app actually did.
          </p>
        </Reveal>

        <Reveal className="mt-10 grid gap-4 sm:grid-cols-2" delay={0.05}>
          {BILLING_FACTS.map((fact) => (
            <div
              key={fact.title}
              className="rounded-xl border border-line bg-paper p-5 dark:border-lineDark dark:bg-night/40"
            >
              <div className="flex items-center gap-2">
                <Check size={14} className="shrink-0 text-signal dark:text-signalSoft" />
                <h3 className="font-display text-[14px] font-bold text-ink dark:text-inkDark">
                  {fact.title}
                </h3>
              </div>
              <p className="mt-2 font-body text-[12.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
                {fact.body}
              </p>
            </div>
          ))}
        </Reveal>

        <Reveal className="mt-8 text-center" delay={0.1}>
          <Link
            href="/docs#plans"
            className="group inline-flex items-center gap-1.5 font-body text-[13.5px] font-semibold text-signal transition hover:text-accent2 dark:text-signalSoft"
          >
            Plans, credits and billing in the docs
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
