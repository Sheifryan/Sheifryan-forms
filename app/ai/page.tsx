import type { Metadata } from "next";
import { MotionProvider } from "@/components/landing/MotionProvider";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { PageHero } from "@/components/landing/PageHero";
import { AiShowcase } from "@/components/landing/AiShowcase";
import { AiCapabilities } from "@/components/landing/FeaturePageSections";
import { FinalCta } from "@/components/landing/FinalCta";
import { isSignedIn } from "@/lib/landing-session";

export const metadata: Metadata = {
  title: "AI",
  description:
    "Generate, import, improve and critique forms with AI, then ask plain-English questions about the responses you collected.",
  openGraph: {
    title: "NibbleForms — AI",
    description:
      "AI that drafts, improves, reviews and explains — reading your real submissions, never inventing answers.",
    type: "website",
  },
};

/**
 * Public AI page. Composes the landing page's AiShowcase with the fuller
 * capability grid from FeaturePageSections.
 */
export default async function AiPage() {
  const authed = await isSignedIn();

  return (
    <MotionProvider>
      <div className="min-h-screen bg-paper text-ink antialiased dark:bg-night dark:text-inkDark">
        <LandingNav authed={authed} />

        <main>
          <PageHero
            eyebrow="AI"
            title={
              <>
                AI built into the{" "}
                <span className="bg-gradient-to-r from-signal to-accent2 bg-clip-text text-transparent">
                  form workflow.
                </span>
              </>
            }
            description="AI helps before the form is published and after the responses arrive — drafting fields, tightening wording, reviewing structure and answering questions about your data."
            highlights={[
              "Generate a form",
              "Import a photo or PDF",
              "Improve wording",
              "Critique before publishing",
              "Ask your data",
            ]}
            authed={authed}
            secondary={{ label: "How AI works and what it costs", href: "/docs#ai" }}
          />
          <AiShowcase />
          <AiCapabilities />
          <FinalCta authed={authed} />
        </main>

        <LandingFooter />
      </div>
    </MotionProvider>
  );
}
