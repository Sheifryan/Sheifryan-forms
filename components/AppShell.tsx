import { createClient } from "@/lib/supabase/server";
import { resolveActiveWorkspace, resolveWorkspaces, resolveProfile, workspaceSchemaReady, isOrganisation } from "@/lib/workspace-server";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { FormatProvider } from "./FormatProvider";

export interface ShellUser {
  email?: string | null;
  fullName?: string | null;
}

export interface ShellWorkspace {
  name?: string | null;
  plan?: string | null;
}

interface Props {
  active:
    | "dashboard"
    | "forms"
    | "submissions"
    | "responses"
    | "analytics"
    | "files"
    | "workflows"
    | "wallet"
    | "settings"
    | "members"
    | "activity"
    | "onboarding";
  /** Header title for the page. */
  title: string;
  /** When true, the header shows a time-based greeting instead of `title`. */
  greeting?: boolean;
  /** Name/email shown in the shell and header ("David" / david@x.com). */
  user?: ShellUser;
  workspace?: ShellWorkspace;
  /** Active folder view for the sidebar highlight ("all" | "none" | folder id). */
  activeFolderId?: string;
  /** Per-folder form counts — the dashboard passes these for the count badges. */
  folderCounts?: { all: number; none: number; [folderId: string]: number };
  children: React.ReactNode;
}

export async function AppShell({
  active,
  title,
  greeting = false,
  user,
  workspace,
  activeFolderId = "all",
  folderCounts,
  children,
}: Props) {
  const supabase = createClient();
  const { data: folders } = await supabase.from("folders").select("id, name").order("created_at", { ascending: true });

  // The shell owns workspace context, so individual pages don't have to thread
  // it through. Both calls tolerate an un-migrated database.
  const [{ workspace: activeWs }, workspaceList, { profile }, orgSchemaReady] = await Promise.all([
    resolveActiveWorkspace(),
    resolveWorkspaces(),
    resolveProfile(),
    workspaceSchemaReady(),
  ]);
  const orgMode = isOrganisation(activeWs);
  const activePlan = activeWs?.plan ?? workspace?.plan;
  const activeName = activeWs?.name ?? workspace?.name;

  // Formatting context for every client component in the tree. Sourced from the
  // profile (never the runtime) so the server render and the client hydration
  // produce identical strings — see lib/format.ts for why that matters.
  const prefs = profile?.preferences ?? {};

  return (
    <FormatProvider locale={prefs.language ?? null} timeZone={prefs.timezone ?? null}>
      <div className="min-h-screen bg-paper text-ink dark:bg-night dark:text-inkDark">
        <AppSidebar
          active={active}
          folders={folders ?? []}
          activeFolderId={activeFolderId}
          counts={folderCounts}
          userName={user?.fullName}
          userEmail={user?.email}
          plan={activePlan}
          workspaceName={activeName}
          workspaces={workspaceList.map((w) => ({ id: w.id, name: w.name, kind: w.kind, plan: w.plan, role: w.role, logo_url: w.logo_url }))}
          activeWorkspaceId={activeWs?.id ?? null}
          isOrganisation={orgMode}
          orgSchemaReady={orgSchemaReady}
        />
        <div className="min-w-0 flex-1 lg:pl-64">
          <AppHeader
            title={title}
            greeting={greeting}
            userName={user?.fullName}
            userEmail={user?.email}
            plan={activePlan}
            workspaceKind={activeWs?.kind ?? null}
          />
          {children}
        </div>
      </div>
    </FormatProvider>
  );
}
