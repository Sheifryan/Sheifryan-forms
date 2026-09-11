import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { resolveActiveWorkspace, resolveProfile, isOrganisation } from "@/lib/workspace-server";
import { respondentFrom } from "@/lib/respondents";
import { activityVerb, activityTone } from "@/lib/activity";
import { DashboardClient } from "./DashboardClient";

const CURRENT_MONTH_ISO = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString();
};

export default async function DashboardPage({ searchParams }: { searchParams: { open?: string; onboarded?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { workspace } = await resolveActiveWorkspace();
  const { profile } = await resolveProfile();

  let query = supabase
    .from("forms")
    .select("id, title, status, schema, theme, folder_id, created_at, updated_at, views, owner_id")
    .order("updated_at", { ascending: false });
  if (workspace) query = query.eq("workspace_id", workspace.id);
  let { data: forms, error: formsError } = await query;

  // Pre-migration fallback: `views` doesn't exist yet, so retry without it.
  if (formsError) {
    let retry = supabase
      .from("forms")
      .select("id, title, status, schema, theme, folder_id, created_at, updated_at, owner_id")
      .order("updated_at", { ascending: false });
    if (workspace) retry = retry.eq("workspace_id", workspace.id);
    const res = await retry;
    forms = res.data as typeof forms;
  }

  const { data: folders } = await supabase.from("folders").select("id, name").order("created_at", { ascending: true });

  // Same pre-migration guard for responses.is_read.
  interface RespStat {
    form_id: string;
    created_at: string;
  }
  let responseRows: RespStat[] = [];
  const withRead = await supabase.from("responses").select("form_id, created_at, is_read");
  if (withRead.error) {
    const without = await supabase.from("responses").select("form_id, created_at");
    responseRows = (without.data ?? []) as RespStat[];
  } else {
    responseRows = (withRead.data ?? []) as RespStat[];
  }
  const responseCounts: Record<string, number> = {};
  let totalResponses = 0;
  let thisMonthResponses = 0;
  const monthStart = Date.parse(CURRENT_MONTH_ISO());
  responseRows.forEach((r) => {
    responseCounts[r.form_id] = (responseCounts[r.form_id] ?? 0) + 1;
    totalResponses++;
    if (Date.parse(r.created_at) >= monthStart) thisMonthResponses++;
  });

  // Latest submissions across all of the user's forms, joined client-side
  // with their form titles for the "Recent responses" panel.
  let recentResponses: { id: string; formId: string; formTitle: string; answers: Record<string, unknown>; createdAt: string }[] = [];
  const { data: recentRows } = await supabase
    .from("responses")
    .select("id, form_id, answers, created_at")
    .order("created_at", { ascending: false })
    .limit(8);
  const formById = new Map((forms ?? []).map((f) => [f.id, f]));
  (recentRows ?? []).forEach((r) => {
    const form = formById.get(r.form_id);
    recentResponses.push({
      id: r.id,
      formId: r.form_id,
      formTitle: form?.title ?? "Deleted form",
      answers: (r.answers as Record<string, unknown>) ?? {},
      createdAt: r.created_at,
    });
  });

  const folderCounts: { all: number; none: number; [folderId: string]: number } = { all: (forms ?? []).length, none: (forms ?? []).filter((f) => !f.folder_id).length };
  for (const f of folders ?? []) folderCounts[f.id] = (forms ?? []).filter((x) => x.folder_id === f.id).length;

  // ---- Organisation context (members, activity feed, creators) --------------
  // All of this is organisation-only; personal workspaces skip the extra
  // queries entirely.
  const orgMode = isOrganisation(workspace);
  let activeMembers = 0;
  let activities: { id: string; actor: string; action: string; resourceLabel: string | null; tone: string; verb: string; createdAt: string }[] = [];
  const creatorNames: Record<string, string> = {};

  if (orgMode && workspace) {
    const { count } = await supabase
      .from("workspace_members")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("status", "active");
    activeMembers = count ?? 0;

    const { data: logs } = await supabase
      .from("activity_logs")
      .select("id, user_id, action, resource_type, resource_label, created_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(8);

    interface LogRow {
      id: string;
      user_id: string | null;
      action: string;
      resource_type: string | null;
      resource_label: string | null;
      created_at: string;
    }
    const logRows = (logs ?? []) as LogRow[];

    // Resolve display names for both log actors and form creators.
    const ids = new Set<string>();
    logRows.forEach((l) => l.user_id && ids.add(l.user_id));
    (forms ?? []).forEach((f) => f.owner_id && ids.add(f.owner_id));
    if (ids.size > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", Array.from(ids));
      (profs ?? []).forEach((p) => {
        if (p.full_name) creatorNames[p.id] = p.full_name;
      });
    }

    activities = logRows.map((l) => ({
      id: l.id,
      actor: (l.user_id && creatorNames[l.user_id]) || "A team member",
      action: l.action,
      resourceLabel: l.resource_label,
      tone: activityTone(l.action),
      verb: activityVerb(l.action),
      createdAt: l.created_at,
    }));
  }

  return (
    <AppShell
      active="dashboard"
      title="Dashboard"
      greeting
      user={{ email: user.email, fullName: profile?.full_name || (user.user_metadata?.full_name as string) }}
      workspace={{ name: workspace?.name, plan: workspace?.plan }}
      activeFolderId="all"
      folderCounts={folderCounts}
    >
      <DashboardClient
        forms={forms ?? []}
        folders={folders ?? []}
        responseCounts={responseCounts}
        recentResponses={recentResponses.map((r) => ({ ...r, respondent: respondentFrom(r.answers) }))}
        stats={{
          totalForms: (forms ?? []).length,
          totalResponses,
          thisMonthResponses,
          credits: workspace?.credits_balance ?? 0,
          onboarded: Boolean(workspace?.onboarded_at),
        }}
        orgMode={orgMode}
        activeMembers={activeMembers}
        activities={activities}
        creatorNames={creatorNames}
        workspaceLabel={workspace?.name ?? undefined}
        initialGalleryOpen={searchParams.open === "templates"}
        justOnboarded={searchParams.onboarded === "1"}
      />
    </AppShell>
  );
}
