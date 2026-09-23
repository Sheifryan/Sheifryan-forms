import { Fragment } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, Globe, Send, Webhook, Workflow } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "./Reveal";

const FLOW = [
  { icon: Send, title: "Form submission", body: "A respondent submits your published form." },
  { icon: Workflow, title: "Workflow", body: "A rule triggers — on any form, or one specific form." },
  { icon: Webhook, title: "Webhook / integration", body: "The payload is signed and delivered to your endpoint." },
  { icon: Globe, title: "Your application", body: "Your CRM, helpdesk or internal tool takes it from there." },
];

/** Automation & integrations — the developer-facing half of the product. */
export function Integrations() {
  return (
    <section
      id="integrations"
      className="scroll-mt-20 border-y border-line bg-white py-16 dark:border-lineDark dark:bg-panelDark sm:py-20"
    >
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink dark:text-inkDark sm:text-3xl">
            Connect forms to the work that follows.
          </h2>
          <p className="mt-3 font-body text-[14.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
            Your form shouldn&apos;t be the end of the process. Send every submission on to the tools your team already
            runs.
          </p>
        </Reveal>

        <Stagger className="mt-10 flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
          {FLOW.map((step, i) => (
            <Fragment key={step.title}>
              <StaggerItem className="flex-1">
                <div className="h-full rounded-xl border border-line bg-paper p-4 dark:border-lineDark dark:bg-night/40">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-signalSoft/20 text-signal dark:text-signalSoft">
                    <step.icon size={16} />
                  </span>
                  <h3 className="mt-3 font-display text-[13.5px] font-bold text-ink dark:text-inkDark">{step.title}</h3>
                  <p className="mt-1 font-body text-[12px] leading-relaxed text-slate-600 dark:text-mutedDark">
                    {step.body}
                  </p>
                </div>
              </StaggerItem>
              {i < FLOW.length - 1 && (
                <div aria-hidden className="flex shrink-0 items-center justify-center py-1 text-signalSoft">
                  <ArrowDown size={14} className="lg:hidden" />
                  <ArrowRight size={14} className="hidden lg:block" />
                </div>
              )}
            </Fragment>
          ))}
        </Stagger>

        <Reveal className="mt-8" delay={0.05}>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Webhooks", body: "POST a JSON payload to any HTTPS endpoint." },
              { label: "HMAC signatures", body: "Every delivery is signed so you can verify it." },
              { label: "Automated retries", body: "Failed deliveries are retried and logged." },
              { label: "Workflow automation", body: "Trigger actions and assign to team members." },
            ].map((item) => (
              <li
                key={item.label}
                className="rounded-xl border border-line bg-paper px-4 py-3 dark:border-lineDark dark:bg-night/40"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400 dark:text-mutedDark">
                  {item.label}
                </p>
                <p className="mt-1.5 font-body text-[12.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-center font-body text-[12px] text-slate-400 dark:text-mutedDark">
            Payment collection is available where MarzPay is configured, so forms can do more than gather information.
          </p>
          <div className="mt-4 text-center">
            <Link
              href="/docs#webhooks"
              className="group inline-flex items-center gap-1.5 font-body text-[13px] font-semibold text-signal transition hover:text-accent2 dark:text-signalSoft"
            >
              Read the webhook &amp; embedding docs
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
