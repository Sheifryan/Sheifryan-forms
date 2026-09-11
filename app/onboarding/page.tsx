import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-server";
import { firstName } from "@/lib/workspace";
import { OnboardingClient } from "./OnboardingClient";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: { open?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { workspace, available } = await resolveWorkspace();

  // A fully onboarded user has no reason to go through the flow again — send
  // them home (they can reach onboarding from the dashboard banner anytime).
  if (available && workspace?.onboarded_at) redirect("/dashboard");

  const suggested = `${firstName((user.user_metadata?.full_name as string) ?? "") || "My"}'s Workspace`;

  return (
    <div className="min-h-screen bg-paper dark:bg-night">
      <OnboardingClient
        email={user.email}
        suggestedName={suggested}
        workspaceName={workspace?.name ?? suggested}
        isNew={!workspace || !workspace.onboarded_at}
        initialOpen={searchParams.open}
      />
    </div>
  );
}