import type { Metadata } from "next";
import { MotionProvider } from "@/components/landing/MotionProvider";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { PageHero } from "@/components/landing/PageHero";
import { CapabilityStrip } from "@/components/landing/CapabilityStrip";
import { WorkspaceShowcase } from "@/components/landing/WorkspaceShowcase";
import { Steps } from "@/components/landing/Steps";
import { AiShowcase } from "@/components/landing/AiShowcase";
import { Integrations } from "@/components/landing/Integrations";
import { FinalCta } from "@/components/landing/FinalCta";
import { isSignedIn } from "@/lib/landing-session";

export const metadata: Metadata = {
  title: "Product",
  description:
    "One workspace for the whole form lifecycle — build, share, collect, understand and automate without exporting between tools.",
  openGraph: {
    title: "NibbleForms — Product",
    description:
      "The workspace, the four-step workflow and the automation that keeps every response moving.",
    type: "website",
  },
};

/**
 * Public Product page.
 *
 * Same shell as /docs and /about: MotionProvider → LandingNav → LandingFooter,
 * with a PageHero instead of the landing Hero. Sections alternate transparent and
 * white backgrounds so no two bordered bands ever meet.
 */
export default async function ProductPage() {
  const authed = await isSignedIn();

  return (
    <MotionProvider>
      <div className="min-h-screen bg-paper text-ink antialiased dark:bg-night dark:text-inkDark">
        <LandingNav authed={authed} />

        <main>
          <PageHero
            eyebrow="Product"
            title={
              <>
                One workspace for the whole{" "}
                <span className="bg-gradient-to-r from-signal to-accent2 bg-clip-text text-transparent">
                  form lifecycle.
                </span>
              </>
            }
            description="Build the questions, share the form, collect responses and files, understand the data, then automate what happens next — without exporting between four different tools."
            highlights={["Build", "Share", "Collect", "Understand", "Automate"]}
            authed={authed}
            secondary={{ label: "Read the documentation", href: "/docs" }}
          />
          <CapabilityStrip />
          <WorkspaceShowcase />
          <Steps />
          <AiShowcase />
          <Integrations />
          <FinalCta authed={authed} />
        </main>

        <LandingFooter />
      </div>
    </MotionProvider>
  );
}
