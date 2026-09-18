import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { resolveActiveWorkspace, resolveProfile } from "@/lib/workspace-server";
import { respondentFrom } from "@/lib/respondents";
import { ResponsesClient } from "./ResponsesClient";

export default async function ResponsesPage({ searchParams }: { searchParams: { form?: string; from?: string; to?: string; open?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { workspace } = await resolveActiveWorkspace();
  const { profile } = await resolveProfile();

  let query = supabase.from("forms").select("id, title, schema").order("title", { ascending: true });
  if (workspace) query = query.eq("workspace_id", workspace.id);
  const { data: forms } = await query;
  const formRows = forms ?? [];
  const formIds = formRows.map((f) => f.id);

  // Only ever query responses belonging to the caller's own forms.
  let rq = supabase.from("responses").select("id, form_id, answers, created_at, is_read").order("created_at", { ascending: false });
  if (formIds.length > 0) rq = rq.in("form_id", formIds);
  else rq = rq.eq("form_id", "00000000-0000-0000-0000-000000000000");

  const activeFormId = searchParams.form && formIds.includes(searchParams.form) ? searchParams.form : null;

  const scopedFormIds = formIds.length ? formIds : ["00000000-0000-0000-0000-000000000000"];
  const fromIso = searchParams.from ? new Date(searchParams.from).toISOString() : null;
  const toIso = searchParams.to ? new Date(`${searchParams.to}T23:59:59`).toISOString() : null;

  type RespData = {
    id: string;
    form_id: string;
    answers: Record<string, unknown>;
    created_at: string;
    is_read?: boolean;
    assigned_to?: string | null;
    status?: string;
  };

  // Literal select strings (not a dynamic one) so supabase-js keeps its
  // compile-time row types. Three tiers handle a database where 0013 hasn't
  // been applied yet (no assigned_to / status) or even 0011 (no is_read).
  async function fetchFull() {
    let rq = supabase
      .from("responses")
      .select("id, form_id, answers, created_at, is_read, assigned_to, status")
      .order("created_at", { ascending: false })
      .in("form_id", scopedFormIds);
    if (activeFormId) rq = rq.eq("form_id", activeFormId);
    if (fromIso) rq = rq.gte("created_at", fromIso);
    if (toIso) rq = rq.lte("created_at", toIso);
    return rq;
  }
  async function fetchWithRead() {
    let rq = supabase.from("responses").select("id, form_id, answers, created_at, is_read").order("created_at", { ascending: false }).in("form_id", scopedFormIds);
    if (activeFormId) rq = rq.eq("form_id", activeFormId);
    if (fromIso) rq = rq.gte("created_at", fromIso);
    if (toIso) rq = rq.lte("created_at", toIso);
    return rq;
  }
  async function fetchWithoutRead() {
    let rq = supabase.from("responses").select("id, form_id, answers, created_at").order("created_at", { ascending: false }).in("form_id", scopedFormIds);
    if (activeFormId) rq = rq.eq("form_id", activeFormId);
    if (fromIso) rq = rq.gte("created_at", fromIso);
    if (toIso) rq = rq.lte("created_at", toIso);
    return rq;
  }

  let responses: RespData[] = [];
  const primary = await fetchFull();
  if (!primary.error) {
    responses = (primary.data ?? []) as RespData[];
  } else {
    const withRead = await fetchWithRead();
    if (!withRead.error) {
      responses = ((withRead.data ?? []) as RespData[]).map((r) => ({ ...r, status: "new" }));
    } else {
      const bare = await fetchWithoutRead();
      responses = ((bare.data ?? []) as RespData[]).map((r) => ({ ...r, is_read: true, status: "new" }));
    }
  }

  const responseRows = responses.map((r) => ({
    id: r.id,
    formId: r.form_id,
    answers: (r.answers as Record<string, unknown>) ?? {},
    createdAt: r.created_at,
    isRead: Boolean(r.is_read),
    assignedTo: r.assigned_to ?? null,
    status: r.status ?? "new",
    respondent: respondentFrom((r.answers as Record<string, unknown>) ?? {}),
  }));

  const { count: totalCount } = await supabase.from("responses").select("id", { count: "exact", head: true }).in("form_id", scopedFormIds);
  let unreadCount = 0;
  const unreadRes = await supabase
    .from("responses")
    .select("id", { count: "exact", head: true })
    .in("form_id", scopedFormIds)
    .eq("is_read", false);
  if (!unreadRes.error) unreadCount = unreadRes.count ?? 0;

  // Completion rate = answered responses / total. We approximate answered as
  // responses with at least one non-empty answer, computed server-side here.
  const answeredCount = responseRows.filter((r) => {
    const vals = Object.values(r.answers).filter(
      (v) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)
    );
    return vals.length > 0;
  }).length;

  // Team members for the response-assignment picker (organisations only;
  // personal workspaces have just the owner).
  let members: { userId: string; name: string | null; email: string | null }[] = [];
  if (workspace && workspace.kind === "business") {
    const { data: memberRows } = await supabase
      .from("workspace_members")
      .select("user_id, email, status")
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

  // Default form selector uses the URL param, else the first form with
  // responses, else whatever's first. The URL param is only honoured when it
  // names one of THIS workspace's forms (activeFormId above already validated
  // it), otherwise the AI Analysis tab would open on a form it can't read.
  const defaultFormId = activeFormId ?? (formIds.length ? formIds[0] : null);

  return (
    <AppShell
      active="responses"
      title="Responses"
      user={{ email: user.email, fullName: profile?.full_name || (user.user_metadata?.full_name as string) }}
      workspace={{ name: workspace?.name, plan: workspace?.plan }}
    >
      <ResponsesClient
        forms={formRows}
        responses={responseRows}
        activeFormId={defaultFormId}
        members={members}
        orgMode={workspace?.kind === "business"}
        metrics={{
          total: totalCount ?? responseRows.length,
          new: unreadCount,
          completionRate: totalCount ? Math.round((answeredCount / totalCount) * 100) : 0,
        }}
        initialFrom={searchParams.from}
        initialTo={searchParams.to}
        initialOpenId={searchParams.open}
      />
    </AppShell>
  );
}