"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Brain } from "lucide-react";
import type { FormSchema } from "@/lib/schema";
import type { AnalysisResult } from "@/lib/ai/contracts";
import { useToast } from "@/components/Toast";

interface FormRow {
  id: string;
  title: string;
  schema: FormSchema | null;
}
interface ResponseRow {
  id: string;
  answers: Record<string, unknown>;
  created_at: string;
}

interface AiAnalysisView {
  id: string;
  createdAt: string;
  responsesAnalyzed: number;
  to: string | null;
  insight: AnalysisResult;
  model: string | null;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function AnalyticsClient({
  forms,
  activeFormId,
  responses,
  analysis,
  newerAvailable,
}: {
  forms: FormRow[];
  activeFormId: string | null;
  responses: ResponseRow[];
  analysis: AiAnalysisView | null;
  newerAvailable: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [analyzing, setAnalyzing] = useState(false);
  const activeForm = forms.find((f) => f.id === activeFormId) || null;
  const fields = activeForm?.schema?.fields ?? [];
  const total = responses.length;

  const counts = useMemo(() => {
    const c = Array(7).fill(0);
    responses.forEach((r) => {
      const d = (new Date(r.created_at).getDay() + 6) % 7;
      c[d]++;
    });
    return c;
  }, [responses]);
  const max = Math.max(1, ...counts);

  async function runAnalysis() {
    if (!activeFormId) return;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/ai/analyze-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formId: activeFormId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "AI analysis failed — try again.");
      if (data.noResponses) {
        toast.info(data.message ?? "No responses to analyze yet.");
      } else {
        toast.success("AI insights generated");
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI analysis failed — try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="p-7">
      <div className="mb-5 flex items-center gap-2 font-body text-xs text-muted">
        <span className="font-semibold text-ink">Form:</span>
        <select
          value={activeFormId ?? ""}
          onChange={(e) => router.push(`/analytics?form=${e.target.value}`)}
          className="rounded-md border border-line bg-white px-2.5 py-1.5 font-body text-xs font-medium text-ink outline-none focus:border-signal"
        >
          {forms.length === 0 && <option value="">No forms yet</option>}
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </select>
      </div>

      {forms.length === 0 ? (
        <p className="font-body text-xs text-muted">Create a form first from the dashboard.</p>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-4 gap-3.5">
            <Kpi label="Total submissions" val={total} delta={total > 0 ? "live" : "waiting for data"} />
            <Kpi
              label="Fields on form"
              val={fields.length}
              delta={`${fields.filter((f) => f.required).length} required`}
            />
            <Kpi label="Field types used" val={new Set(fields.map((f) => f.type)).size} delta="of 14 available" />
            <Kpi
              label="Conditional fields"
              val={fields.filter((f) => f.showIf && f.showIf.length > 0).length}
              delta="using logic"
            />
          </div>

          <div className="mb-5 overflow-hidden rounded-xl border border-violet-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-gradient-to-r from-violet-50/80 to-white px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-accent2 text-white">
                  <Brain size={15} />
                </span>
                <div>
                  <h3 className="font-display text-[15px] font-semibold text-ink">AI insights</h3>
                  <p className="font-body text-[11px] text-muted">
                    What your submissions are telling you — generated from real responses.
                  </p>
                </div>
              </div>
              <button
                onClick={runAnalysis}
                disabled={analyzing || total === 0}
                className="flex items-center gap-1.5 rounded-full bg-[#6D28D9] px-4 py-2 font-body text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {analyzing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {analyzing
                  ? "Analyzing…"
                  : analysis
                    ? newerAvailable
                      ? "Analyze newer responses"
                      : "Regenerate insights"
                    : "Generate insights"}
              </button>
            </div>

            <div className="p-5">
              {analyzing && !analysis && (
                <p className="font-body text-xs text-muted">
                  Reading the latest {Math.min(total, 300)} responses and summarizing them… this takes a few seconds.
                </p>
              )}

              {total === 0 && !analysis && (
                <p className="font-body text-xs text-muted">
                  No submissions yet — once responses arrive, this card will summarize them automatically.
                </p>
              )}

              {analysis && (
                <>
                  <p className="mb-4 font-display text-[15px] font-semibold leading-snug text-ink">
                    “{analysis.insight.headline}”
                  </p>

                  {analysis.insight.insights.length > 0 && (
                    <div className="mb-4 grid gap-2 sm:grid-cols-2">
                      {analysis.insight.insights.map((ins, i) => (
                        <div key={i} className="rounded-lg border border-line bg-paper px-3.5 py-3">
                          <p className="mb-0.5 font-body text-[11px] font-bold uppercase tracking-wide text-violet-700">
                            {ins.label}
                          </p>
                          <p className="font-body text-[12px] leading-relaxed text-stone-700">{ins.detail}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {analysis.insight.trends.length > 0 && (
                    <div className="mb-4">
                      <p className="mb-1.5 font-body text-[11px] font-bold uppercase tracking-wide text-muted">Trends</p>
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.insight.trends.map((t, i) => (
                          <span key={i} className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-body text-[11px] text-violet-800">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.insight.quotes.length > 0 && (
                    <div className="mb-4">
                      <p className="mb-1.5 font-body text-[11px] font-bold uppercase tracking-wide text-muted">Notable quotes</p>
                      <div className="space-y-1.5">
                        {analysis.insight.quotes.map((q, i) => (
                          <blockquote key={i} className="rounded-lg border border-line bg-white px-3.5 py-2.5">
                            <p className="font-body text-[12.5px] italic text-stone-700">“{q.text}”</p>
                            <p className="mt-0.5 font-body text-[10.5px] font-semibold text-muted">— {q.fieldLabel}</p>
                          </blockquote>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.insight.suggestions.length > 0 && (
                    <div>
                      <p className="mb-1.5 font-body text-[11px] font-bold uppercase tracking-wide text-muted">Suggestions</p>
                      <ul className="space-y-1">
                        {analysis.insight.suggestions.map((s, i) => (
                          <li key={i} className="flex gap-2 font-body text-[12.5px] text-stone-700">
                            <span className="text-violet-600">→</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="mt-4 border-t border-line pt-3 font-body text-[10.5px] text-muted">
                    Analyzed {analysis.responsesAnalyzed} response{analysis.responsesAnalyzed === 1 ? "" : "s"}
                    {analysis.model ? ` · ${analysis.model}` : ""} · {new Date(analysis.createdAt).toLocaleString()}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-[1.4fr_1fr] gap-4">
            <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
              <h3 className="mb-4 font-display text-[15px] font-semibold text-ink">Submissions by day</h3>
              <div className="flex h-40 items-end gap-2.5 px-1.5">
                {counts.map((c, i) => (
                  <div key={i} className="flex-1 text-center">
                    <div
                      className="mx-auto rounded-t-md bg-gradient-to-t from-signal to-violet-500"
                      style={{ height: `${Math.max(6, (c / max) * 130)}px` }}
                    />
                    <span className="mt-1.5 block font-mono text-[10px] text-muted">{DAYS[i]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
              <h3 className="mb-4 font-display text-[15px] font-semibold text-ink">Fields overview</h3>
              {fields.length === 0 ? (
                <p className="font-body text-xs text-muted">No fields yet.</p>
              ) : (
                fields.map((f) => {
                  const answered = responses.filter(
                    (r) => {
                      const v = r.answers[f.id];
                      return v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
                    }
                  ).length;
                  const pct = total ? Math.round((answered / total) * 100) : 0;
                  return (
                    <div key={f.id} className="mb-2.5 flex items-center gap-2.5">
                      <span className="w-24 shrink-0 truncate font-body text-[11.5px] text-stone-600">{f.label}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded bg-paper">
                        <div className="h-full rounded bg-signal" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-9 shrink-0 text-right font-body text-[11px] font-semibold text-stone-700">
                        {pct}%
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, val, delta }: { label: string; val: number; delta: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
      <p className="mb-1.5 font-body text-[11.5px] font-semibold text-stone-500">{label}</p>
      <p className="font-display text-2xl font-bold text-ink">{val}</p>
      <p className="mt-1 font-body text-[11px] font-semibold text-signal">{delta}</p>
    </div>
  );
}
