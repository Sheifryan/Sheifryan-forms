import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveProfile } from "@/lib/workspace-server";
import { OnboardingOrgClient } from "./OnboardingOrgClient";

export const metadata = { title: "Create an organisation · NibbleForms" };

export default async function OrganisationOnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { profile } = await resolveProfile();
  const fullName = profile?.full_name || (user.user_metadata?.full_name as string) || "";

  return (
    <div className="min-h-screen bg-paper dark:bg-night">
      <OnboardingOrgClient email={user.email ?? ""} fullName={fullName} />
    </div>
  );
}