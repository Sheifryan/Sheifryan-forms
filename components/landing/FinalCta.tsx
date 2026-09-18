import Link from "next/link";
import { ArrowRight, LayoutTemplate } from "lucide-react";
import { Reveal } from "./Reveal";

/** Dramatic full-width closing CTA. */
export function FinalCta({ authed }: { authed: boolean }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-signal via-[#8B2FD6] to-accent2 py-16 sm:py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_20%_20%,white,transparent_45%),radial-gradient(circle_at_80%_70%,white,transparent_40%)]"
      />
      <Reveal className="relative mx-auto max-w-3xl px-5 text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Your next form should do more.
        </h2>
        <p className="mx-auto mt-4 max-w-xl font-body text-[14.5px] leading-relaxed text-white/90">
          Build beautiful forms, collect better responses, and turn your data into action with
          NibbleForms.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href={authed ? "/dashboard" : "/signup"}
            className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 font-body text-sm font-semibold text-signal transition hover:bg-white/90 sm:w-auto"
          >
            {authed ? "Go to dashboard" : "Start Building Free"}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/templates"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/50 px-6 py-3 font-body text-sm font-semibold text-white transition hover:bg-white/10 sm:w-auto"
          >
            <LayoutTemplate size={16} />
            Explore Templates
          </Link>
        </div>

        <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/70">
          Free to start · No credit card
        </p>
      </Reveal>
    </section>
  );
}
