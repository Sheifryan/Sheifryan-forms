import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { resolveActiveWorkspace, resolveProfile, isOrganisation } from "@/lib/workspace-server";
import { AnalyticsClient } from "./AnalyticsClient";
import type { AnalysisResult } from "@/lib/ai/contracts";

interface AnalysisRow {
  id: string;
  form_id: string;
  created_at: string;
  responses_analyzed: number;
  response_window: { from?: string | null; to?: string | null };
  insight: unknown;
  model: string | null;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: { form?: string; member?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { workspace } = await resolveActiveWorkspace();
  const { profile } = await resolveProfile();

  // Org analytics can be scoped to one member (forms they created). Personal
  // workspaces skip the picker entirely — there's only ever one person.
  const orgMode = isOrganisation(workspace);
  const memberFilter = searchParams.member ?? null;

  let members: { userId: string; name: string | null; email: string | null }[] = [];
  if (orgMode && workspace) {
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

  let query = supabase.from("forms").select("id, title, schema, views").order("updated_at", { ascending: false });
  if (workspace) query = query.eq("workspace_id", workspace.id);
  if (memberFilter) query = query.eq("owner_id", memberFilter);
  let { data: forms, error: formsError } = await query;
  if (formsError) {
    let retry = supabase.from("forms").select("id, title, schema").order("updated_at", { ascending: false });
    if (workspace) retry = retry.eq("workspace_id", workspace.id);
    if (memberFilter) retry = retry.eq("owner_id", memberFilter);
    const res = await retry;
    forms = res.data as typeof forms;
  }

  const activeFormId = searchParams.form ?? forms?.[0]?.id ?? null;
  const activeForm = (forms ?? []).find((f) => f.id === activeFormId) ?? forms?.[0];
  void activeForm;

  let responses: { id: string; answers: Record<string, unknown>; created_at: string }[] = [];
  if (activeFormId) {
    const { data } = await supabase
      .from("responses")
      .select("id, answers, created_at")
      .eq("form_id", activeFormId)
      .order("created_at", { ascending: false });
    responses = data ?? [];
  }

  // Cached AI analysis for the active form (latest run).
  let analysis: {
    id: string;
    createdAt: string;
    responsesAnalyzed: number;
    to: string | null;
    insight: AnalysisResult;
    model: string | null;
  } | null = null;
  if (activeFormId) {
    const { data: row } = await supabase
      .from("form_analyses")
      .select("id, form_id, created_at, responses_analyzed, response_window, insight, model")
      .eq("form_id", activeFormId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const r = row as AnalysisRow | null;
    if (r) {
      analysis = {
        id: r.id,
        createdAt: r.created_at,
        responsesAnalyzed: r.responses_analyzed,
        to: r.response_window?.to ?? null,
        insight: r.insight as AnalysisResult,
        model: r.model,
      };
    }
  }

  // Responses newest-first: analysis is stale when the newest response is newer
  // than the window the last run covered.
  const newestResponseAt = responses[0]?.created_at ?? null;
  const newerAvailable =
    responses.length > 0 &&
    (!analysis || (newestResponseAt ? Date.parse(newestResponseAt) : 0) > (analysis.to ? Date.parse(analysis.to) : 0));

  return (
    <AppShell
      active="analytics"
      title="Analytics"
      user={{ email: user.email, fullName: profile?.full_name || (user.user_metadata?.full_name as string) }}
      workspace={{ name: workspace?.name, plan: workspace?.plan }}
    >
      <AnalyticsClient
        forms={forms ?? []}
        activeFormId={activeFormId}
        responses={responses}
        analysis={analysis}
        newerAvailable={newerAvailable}
        members={members}
        memberFilter={memberFilter}
        orgMode={orgMode}
      />
    </AppShell>
  );
}

