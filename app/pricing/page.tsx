import type { Metadata } from "next";
import { MotionProvider } from "@/components/landing/MotionProvider";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { PageHero } from "@/components/landing/PageHero";
import { Pricing } from "@/components/landing/Pricing";
import { BillingFaq, PlanComparison } from "@/components/landing/PricingPageSections";
import { FinalCta } from "@/components/landing/FinalCta";
import { isSignedIn } from "@/lib/landing-session";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Start free and upgrade when your response volume, storage or team grows. Every limit is enforced by the app, not just advertised.",
  openGraph: {
    title: "NibbleForms — Pricing",
    description:
      "Personal and organisation plans, credit packs and honest limits.",
    type: "website",
  },
};

/**
 * Public Pricing page. The plan cards come from the landing page's Pricing
 * component; PlanComparison and BillingFaq add the full generated tables and the
 * billing model behind them.
 */
export default async function PricingPage() {
  const authed = await isSignedIn();

  return (
    <MotionProvider>
      <div className="min-h-screen bg-paper text-ink antialiased dark:bg-night dark:text-inkDark">
        <LandingNav authed={authed} />

        <main>
          <PageHero
            eyebrow="Pricing"
            title={
              <>
                Plans that match{" "}
                <span className="bg-gradient-to-r from-signal to-accent2 bg-clip-text text-transparent">
                  how much you collect.
                </span>
              </>
            }
            description="Start free and upgrade when response volume, storage or your team grows. Every limit on this page is enforced by the app — the tables below are generated from the same plan data."
            highlights={[
              "Free forever plan",
              "No credit card to start",
              "Personal and organisation plans",
              "Credits only for work actually done",
            ]}
            authed={authed}
            secondary={{ label: "Compare plans in the docs", href: "/docs#plans" }}
          />
          <Pricing />
          <PlanComparison />
          <BillingFaq />
          <FinalCta authed={authed} />
        </main>

        <LandingFooter />
      </div>
    </MotionProvider>
  );
}
