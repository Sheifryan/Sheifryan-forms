import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Reveal } from "./Reveal";

/**
 * Shared hero for the sub-pages (/product, /features, /ai, /pricing).
 *
 * Same brand wash and typography as the landing Hero, minus the dashboard
 * mockup, and the same authed-aware primary CTA so a signed-in visitor is never
 * sent back to signup. `secondary` renders one outline link to wherever the page
 * leads next (docs, templates, …).
 */
export function PageHero({
  eyebrow,
  title,
  description,
  highlights,
  authed,
  secondary,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description: string;
  highlights?: string[];
  authed: boolean;
  secondary?: { label: string; href: string };
}) {
  return (
    <section className="relative overflow-hidden pb-12 pt-14 sm:pt-16">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 -top-32 h-[24rem] w-[24rem] rounded-full bg-signal/10 blur-3xl dark:bg-signal/20" />
        <div className="absolute -right-20 top-6 h-[20rem] w-[20rem] rounded-full bg-accent2/10 blur-3xl dark:bg-accent2/15" />
      </div>

      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-signal dark:text-signalSoft">
            {eyebrow}
          </p>
          <h1 className="mt-4 font-display text-3xl font-bold leading-[1.1] tracking-tight text-ink sm:text-4xl lg:text-5xl dark:text-inkDark">
            {title}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl font-body text-[15px] leading-relaxed text-slate-600 dark:text-mutedDark">
            {description}
          </p>

          {highlights && (
            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              {highlights.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-1.5 font-body text-[12.5px] text-slate-600 dark:text-mutedDark"
                >
                  <Check size={13} className="shrink-0 text-signal dark:text-signalSoft" />
                  {item}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={authed ? "/dashboard" : "/signup"}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-signal to-accent2 px-6 py-3 font-body text-sm font-semibold text-white shadow-lg shadow-signal/20 transition hover:opacity-90 sm:w-auto"
            >
              {authed ? "Go to dashboard" : "Start Building Free"}
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            {secondary && (
              <Link
                href={secondary.href}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-6 py-3 font-body text-sm font-semibold text-ink transition hover:border-signal hover:text-signal sm:w-auto dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
              >
                {secondary.label}
              </Link>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
