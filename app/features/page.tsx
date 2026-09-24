import type { Metadata } from "next";
import { MotionProvider } from "@/components/landing/MotionProvider";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { PageHero } from "@/components/landing/PageHero";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { FieldTypesShowcase } from "@/components/landing/FeaturePageSections";
import { Security } from "@/components/landing/Security";
import { FinalCta } from "@/components/landing/FinalCta";
import { FIELD_GROUPS, THEMES } from "@/lib/schema";
import { isSignedIn } from "@/lib/landing-session";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Field types, conditional rules, multi-page forms, private file collection, response controls and analytics — every part of the form workflow, built in.",
  openGraph: {
    title: "NibbleForms — Features",
    description:
      "From the first question to the final automation, in one workspace.",
    type: "website",
  },
};

// Derived so the hero can't advertise a count the product doesn't ship.
const FIELD_COUNT = FIELD_GROUPS.reduce((total, group) => total + group.types.length, 0);
const THEME_COUNT = Object.keys(THEMES).length;

/**
 * Public Features page. Reuses the landing page's FeatureGrid and Security
 * sections, with the generated field catalogue in between.
 */
export default async function FeaturesPage() {
  const authed = await isSignedIn();

  return (
    <MotionProvider>
      <div className="min-h-screen bg-paper text-ink antialiased dark:bg-night dark:text-inkDark">
        <LandingNav authed={authed} />

        <main>
          <PageHero
            eyebrow="Features"
            title={
              <>
                Every part of the form workflow,{" "}
                <span className="bg-gradient-to-r from-signal to-accent2 bg-clip-text text-transparent">
                  built in.
                </span>
              </>
            }
            description="From the first question to the final automation: fields, rules, multi-page forms, private file collection, response controls and analytics — all in one workspace."
            highlights={[
              `${FIELD_COUNT} field types`,
              "Conditional rules",
              "Multi-page forms",
              "Private file uploads",
              `${THEME_COUNT} accent themes`,
            ]}
            authed={authed}
            secondary={{ label: "Read the documentation", href: "/docs#fields" }}
          />
          <FeatureGrid />
          <FieldTypesShowcase />
          <Security />
          <FinalCta authed={authed} />
        </main>

        <LandingFooter />
      </div>
    </MotionProvider>
  );
}
