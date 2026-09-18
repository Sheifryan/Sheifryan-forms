import Link from "next/link";
import { ArrowRight, LayoutTemplate } from "lucide-react";
import { DashboardMockup } from "./DashboardMockup";

/**
 * Hero. Server component — the only animated piece is <DashboardMockup>, which
 * is a client component. The headline, sub-copy and CTAs animate by transform
 * only (never opacity) so the LCP element is painted on the very first frame.
 */
export function Hero({ authed }: { authed: boolean }) {
  return (
    <section className="relative overflow-hidden pb-16 pt-14 sm:pt-20">
      {/* Soft brand wash behind the hero — pure CSS, no image assets. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 -top-32 h-[26rem] w-[26rem] rounded-full bg-signal/10 blur-3xl dark:bg-signal/20" />
        <div className="absolute -right-20 top-10 h-[22rem] w-[22rem] rounded-full bg-accent2/10 blur-3xl dark:bg-accent2/15" />
      </div>

      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-signal dark:text-signalSoft">
            Build · Collect · Analyze
          </p>

          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.1] tracking-tight text-ink sm:text-5xl lg:text-6xl dark:text-inkDark">
            Forms that do more than{" "}
            <span className="bg-gradient-to-r from-signal to-accent2 bg-clip-text text-transparent">
              collect answers.
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl font-body text-[15px] leading-relaxed text-slate-600 sm:text-base dark:text-mutedDark">
            Create powerful forms in minutes, collect responses securely, analyze your data with AI,
            and automate what happens next — all from one simple workspace.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={authed ? "/dashboard" : "/signup"}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-signal to-accent2 px-6 py-3 font-body text-sm font-semibold text-white shadow-lg shadow-signal/20 transition hover:opacity-90 sm:w-auto"
            >
              {authed ? "Go to dashboard" : "Start Building Free"}
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/templates"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-6 py-3 font-body text-sm font-semibold text-ink transition hover:border-signal hover:text-signal sm:w-auto dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
            >
              <LayoutTemplate size={16} />
              Explore Templates
            </Link>
          </div>

          <p className="mt-4 font-body text-[12.5px] text-slate-400 dark:text-mutedDark">
            No complicated setup. Build your first form in minutes.
          </p>
        </div>

        <DashboardMockup />
      </div>
    </section>
  );
}
