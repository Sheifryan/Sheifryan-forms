import type { Metadata } from "next";
import { MotionProvider } from "@/components/landing/MotionProvider";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { Hero } from "@/components/landing/Hero";
import { CapabilityStrip } from "@/components/landing/CapabilityStrip";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { Steps } from "@/components/landing/Steps";
import { AiShowcase } from "@/components/landing/AiShowcase";
import { LandingTemplates } from "@/components/landing/LandingTemplates";
import { Security } from "@/components/landing/Security";
import { Pricing } from "@/components/landing/Pricing";
import { WorkspaceShowcase } from "@/components/landing/WorkspaceShowcase";
import { Integrations } from "@/components/landing/Integrations";
import { FinalCta } from "@/components/landing/FinalCta";
import { isSignedIn } from "@/lib/landing-session";

export const metadata: Metadata = {
  title: "Forms that do more than collect answers",
  description:
    "Create powerful forms in minutes, collect responses securely, analyze your data with AI, and automate what happens next — all from one simple workspace.",
  openGraph: {
    title: "NibbleForms — Forms that do more than collect answers",
    description:
      "Build forms, collect responses, analyze submissions and automate workflows from one workspace.",
    type: "website",
  },
};

/**
 * Public landing page.
 *
 * This route used to redirect straight to /dashboard; it now renders the
 * marketing page and swaps its CTAs for "Go to dashboard" when a session
 * already exists — deliberately not a forced redirect, so the page stays
 * reachable (and previewable) while signed in.
 *
 * Section order is the agreed flow: nav → hero + dashboard mockup →
 * capabilities → features → build/share/collect/understand → AI → templates →
 * security → pricing → workspace → automation → final CTA → footer.
 */
export default async function LandingPage() {
  const authed = await isSignedIn();

  return (
    <MotionProvider>
      <div className="min-h-screen bg-paper text-ink antialiased dark:bg-night dark:text-inkDark">
        <LandingNav authed={authed} />

        <main>
          <Hero authed={authed} />
          <CapabilityStrip />
          <FeatureGrid />
          <Steps />
          <AiShowcase />
          <LandingTemplates />
          <Security />
          <Pricing />
          <WorkspaceShowcase />
          <Integrations />
          <FinalCta authed={authed} />
        </main>

        <LandingFooter />
      </div>
    </MotionProvider>
  );
}
