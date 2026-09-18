import type { Metadata } from "next";
import { MotionProvider } from "@/components/landing/MotionProvider";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { isSignedIn } from "@/lib/landing-session";
import { templateSummaries } from "@/lib/templates";
import { TemplatesBrowser } from "./TemplatesBrowser";

export const metadata: Metadata = {
  title: "Form templates",
  description:
    "Browse ready-to-use form templates across registration, HR, feedback, marketing, sales, events, education, healthcare and more.",
};

/**
 * Public template gallery. Renders the same TEMPLATES list the in-app gallery
 * uses, but read-only and without an account — "Use template" sends the visitor
 * to signup (which lands on /onboarding).
 */
export default async function TemplatesPage() {
  const authed = await isSignedIn();
  const summaries = templateSummaries();
  const categories = Array.from(new Set(summaries.map((t) => t.category)));

  return (
    <MotionProvider>
      <div className="min-h-screen bg-paper text-ink antialiased dark:bg-night dark:text-inkDark">
        <LandingNav authed={authed} onHome={false} />
        <main className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-signal dark:text-signalSoft">
              {summaries.length} templates · {categories.length} categories
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl dark:text-inkDark">
              Start with a template. Make it yours.
            </h1>
            <p className="mt-3 font-body text-[14.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
              Every template is a set of pre-built fields with real options and sensible required
              flags — pick one and it opens in the builder, ready to edit.
            </p>
          </div>

          <TemplatesBrowser templates={summaries} categories={categories} authed={authed} />
        </main>
        <LandingFooter />
      </div>
    </MotionProvider>
  );
}
