import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
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

export default async function AnalyticsPage({ searchParams }: { searchParams: { form?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: forms } = await supabase
    .from("forms")
    .select("id, title, schema")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  const activeFormId = searchParams.form ?? forms?.[0]?.id ?? null;

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
    <AppShell active="analytics" title="Analytics" userEmail={user.email}>
      <AnalyticsClient
        forms={forms ?? []}
        activeFormId={activeFormId}
        responses={responses}
        analysis={analysis}
        newerAvailable={newerAvailable}
      />
    </AppShell>
  );
}

