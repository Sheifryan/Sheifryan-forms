import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { resolveActiveWorkspace, resolveProfile } from "@/lib/workspace-server";
import { planById } from "@/lib/plans";
import { WorkflowsClient } from "./WorkflowsClient";

export default async function WorkflowsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { workspace } = await resolveActiveWorkspace();
  const { profile } = await resolveProfile();

  let formsQuery = supabase.from("forms").select("id, title").order("title", { ascending: true });
  if (workspace) formsQuery = formsQuery.eq("workspace_id", workspace.id);
  const { data: forms } = await formsQuery;

  let workflows: {
    id: string;
    name: string;
    triggerType: string;
    triggerFormId: string | null;
    actions: unknown;
    enabled: boolean;
    lastRunAt: string | null;
    createdAt: string;
  }[] = [];
  if (workspace) {
    const { data } = await supabase
      .from("workflows")
      .select("id, name, trigger_type, trigger_form_id, actions, enabled, last_run_at, created_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false });
    workflows = (data ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      triggerType: w.trigger_type,
      triggerFormId: w.trigger_form_id,
      actions: w.actions,
      enabled: Boolean(w.enabled),
      lastRunAt: w.last_run_at,
      createdAt: w.created_at,
    }));
  }

  const plan = planById(workspace?.plan);
  const workflowLimit = plan.limits.workflows;

  // Team members, so the assign/notify actions can pick real people.
  let members: { userId: string; name: string | null; email: string | null }[] = [];
  if (workspace && workspace.kind === "business") {
    const { data: memberRows } = await supabase
      .from("workspace_members")
      .select("user_id, email")
      .eq("workspace_id", workspace.id)
      .eq("status", "active");
    const ids = (memberRows ?? []).map((m) => m.user_id);
    const nameById: Record<string, string | null> = {};
    if (ids.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      (profs ?? []).forEach((p) => {
        nameById[p.id] = p.full_name;
      });
    }
    members = (memberRows ?? []).map((m) => ({
      userId: m.user_id,
      name: nameById[m.user_id] ?? null,
      email: m.email ?? null,
    }));
  }

  // Recent workflow activity — a lightweight "history" feed sourced from the
  // same activity_logs table the Activity page reads.
  let history: { id: string; action: string; createdAt: string; actorName: string | null }[] = [];
  if (workspace) {
    const { data: logs } = await supabase
      .from("activity_logs")
      .select("id, action, user_id, created_at")
      .eq("workspace_id", workspace.id)
      .eq("resource_type", "workflow")
      .order("created_at", { ascending: false })
      .limit(8);
    const rows = logs ?? [];
    const actorIds = Array.from(new Set(rows.map((l) => l.user_id).filter((v): v is string => Boolean(v))));
    const actorNames: Record<string, string | null> = {};
    if (actorIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
      (profs ?? []).forEach((p) => {
        actorNames[p.id] = p.full_name;
      });
    }
    history = rows.map((l) => ({
      id: l.id,
      action: l.action,
      createdAt: l.created_at,
      actorName: l.user_id ? actorNames[l.user_id] ?? null : null,
    }));
  }

  return (
    <AppShell
      active="workflows"
      title="Workflows"
      user={{ email: user.email, fullName: profile?.full_name || (user.user_metadata?.full_name as string) }}
      workspace={{ name: workspace?.name, plan: workspace?.plan }}
    >
      <WorkflowsClient
        workflows={workflows}
        forms={forms ?? []}
        current={workflows.length}
        limit={workflowLimit}
        planName={plan.name}
        members={members}
        orgMode={workspace?.kind === "business"}
        history={history}
      />
    </AppShell>
  );
}