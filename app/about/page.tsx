import type { Metadata } from "next";
import { MotionProvider } from "@/components/landing/MotionProvider";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { FinalCta } from "@/components/landing/FinalCta";
import { AboutHero, AboutLoop, AboutMission, AboutNumbers, AboutPrinciples } from "@/components/landing/AboutSections";
import { isSignedIn } from "@/lib/landing-session";

export const metadata: Metadata = {
  title: "About us",
  description:
    "NibbleForms is a form platform for people who care about what happens after the submission — build, collect, analyse and automate in one workspace.",
  openGraph: {
    title: "About NibbleForms",
    description: "Why NibbleForms exists: a form is where the work starts, not where it ends.",
    type: "website",
  },
};

/**
 * Public About page.
 *
 * Same shell as /templates and /docs: MotionProvider → LandingNav → content →
 * the shared FinalCta → LandingFooter. All figures in the sections come from
 * components/landing/AboutSections.tsx, which derives them from lib/schema.ts
 * and lib/templates.ts.
 */
export default async function AboutPage() {
  const authed = await isSignedIn();

  return (
    <MotionProvider>
      <div className="min-h-screen bg-paper text-ink antialiased dark:bg-night dark:text-inkDark">
        <LandingNav authed={authed} />

        <main>
          <AboutHero authed={authed} />
          <AboutMission />
          <AboutLoop />
          <AboutPrinciples />
          <AboutNumbers />
          <FinalCta authed={authed} />
        </main>

        <LandingFooter />
      </div>
    </MotionProvider>
  );
}
