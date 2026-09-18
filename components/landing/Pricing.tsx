import Link from "next/link";
import { Check } from "lucide-react";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { Reveal, Stagger, StaggerItem } from "./Reveal";

/**
 * Pricing. Rendered straight from lib/plans.ts so the landing page can never
 * quote a limit the app doesn't actually enforce. The three personal plans are
 * shown; organisation plans are referenced in the footnote.
 *
 * There is no billing provider wired up in this deployment (the wallet top-up
 * uses MarzPay, which needs MARZPAY_* env vars), so every CTA leads to signup
 * rather than pretending to start a checkout.
 */
export function Pricing() {
  const plans = PLAN_ORDER.map((id) => PLANS[id]);

  return (
    <section id="pricing" className="scroll-mt-20 border-y border-line bg-white py-16 sm:py-20 dark:border-lineDark dark:bg-panelDark">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl dark:text-inkDark">
            Simple plans that grow with your forms.
          </h2>
          <p className="mt-3 font-body text-[14.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
            Start free. Upgrade when your response volume or storage needs more room.
          </p>
        </Reveal>

        <Stagger className="mt-10 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <StaggerItem key={plan.id}>
              <div
                className={`flex h-full flex-col rounded-xl border bg-paper p-5 dark:bg-night/40 ${
                  plan.highlight
                    ? "border-signal shadow-lg shadow-signal/10"
                    : "border-line dark:border-lineDark"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-[15px] font-bold text-ink dark:text-inkDark">
                    {plan.name}
                  </h3>
                  {plan.highlight && (
                    <span className="rounded-full bg-gradient-to-r from-signal to-accent2 px-2.5 py-1 font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-white">
                      Most popular
                    </span>
                  )}
                </div>
                <p className="mt-1 font-body text-[12px] text-slate-500 dark:text-mutedDark">
                  {plan.tagline}
                </p>
                <p className="mt-4 font-display text-3xl font-bold text-ink dark:text-inkDark">
                  ${plan.priceMonthly}
                  <span className="font-body text-[12.5px] font-medium text-slate-400 dark:text-mutedDark">
                    {plan.priceMonthly === 0 ? " / forever" : " / month"}
                  </span>
                </p>

                <ul className="mt-5 flex-1 space-y-2">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 font-body text-[12.5px] text-slate-600 dark:text-mutedDark"
                    >
                      <Check size={14} className="mt-0.5 shrink-0 text-signal dark:text-signalSoft" />
                      {f}
                    </li>
                  ))}
                  <li className="flex items-start gap-2 font-body text-[12.5px] text-slate-600 dark:text-mutedDark">
                    <Check size={14} className="mt-0.5 shrink-0 text-signal dark:text-signalSoft" />
                    {new Intl.NumberFormat("en-US").format(plan.limits.creditsPerMonth)} AI credits / month
                  </li>
                </ul>

                <Link
                  href="/signup"
                  className={`mt-6 rounded-lg px-4 py-2.5 text-center font-body text-[13px] font-semibold transition ${
                    plan.highlight
                      ? "bg-gradient-to-r from-signal to-accent2 text-white hover:opacity-90"
                      : "border border-line text-ink hover:border-signal hover:text-signal dark:border-lineDark dark:text-inkDark"
                  }`}
                >
                  {plan.priceMonthly === 0 ? "Start free" : `Choose ${plan.name}`}
                </Link>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <p className="mt-6 text-center font-body text-[12px] text-slate-400 dark:text-mutedDark">
          Working with a team? Organisation plans (Starter, Business, Enterprise) add shared
          workspaces, members, roles and an activity log.
        </p>
      </div>
    </section>
  );
}
