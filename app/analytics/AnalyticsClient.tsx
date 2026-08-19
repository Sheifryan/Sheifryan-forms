"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { FormSchema } from "@/lib/schema";

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

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function AnalyticsClient({
  forms,
  activeFormId,
  responses,
}: {
  forms: FormRow[];
  activeFormId: string | null;
  responses: ResponseRow[];
}) {
  const router = useRouter();
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

  return (
    <div className="p-7">
      <h1 className="mb-1 font-display text-xl font-semibold tracking-tight text-ink">Analytics</h1>
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

          <div className="grid grid-cols-[1.4fr_1fr] gap-4">
            <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
              <h3 className="mb-4 font-display text-[15px] font-semibold text-ink">Submissions by day</h3>
              <div className="flex h-40 items-end gap-2.5 px-1.5">
                {counts.map((c, i) => (
                  <div key={i} className="flex-1 text-center">
                    <div
                      className="mx-auto rounded-t-md bg-gradient-to-t from-signal to-indigo-400"
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
                    (r) => r.answers[f.id] !== undefined && r.answers[f.id] !== ""
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
