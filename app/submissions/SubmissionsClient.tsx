"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Download, MoreVertical, Inbox, ArrowLeft } from "lucide-react";
import type { FormField, FormSchema } from "@/lib/schema";

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

function answerDisplay(field: FormField, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (field.type === "single_select" || field.type === "dropdown") {
    return field.options?.find((o) => o.id === value)?.label ?? String(value);
  }
  if (field.type === "multi_select") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return arr.map((id) => field.options?.find((o) => o.id === id)?.label ?? id).join(", ") || "—";
  }
  if (field.type === "checkbox") return value ? "Yes" : "No";
  if (field.type === "rating") return "★".repeat(Number(value)) + "☆".repeat(5 - Number(value));
  return String(value);
}

function toCsv(fields: FormField[], responses: ResponseRow[]): string {
  const header = ["Submitted", ...fields.map((f) => f.label)];
  const rows = responses.map((r) => [
    new Date(r.created_at).toISOString(),
    ...fields.map((f) => answerDisplay(f, r.answers[f.id]).replace(/"/g, '""')),
  ]);
  const escape = (v: string) => `"${v}"`;
  return [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

export function SubmissionsClient({
  forms,
  activeFormId,
  responses,
}: {
  forms: FormRow[];
  activeFormId: string | null;
  responses: ResponseRow[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const activeForm = forms.find((f) => f.id === activeFormId) || null;
  const fields = activeForm?.schema?.fields ?? [];
  const openResponse = responses.find((r) => r.id === openId) || null;

  const filtered = useMemo(() => {
    if (!query) return responses;
    const q = query.toLowerCase();
    return responses.filter((r) => JSON.stringify(r.answers).toLowerCase().includes(q));
  }, [responses, query]);

  function exportCsv() {
    const csv = toCsv(fields, filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(activeForm?.title ?? "responses").replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-7">
      <div className="mb-1 flex items-center justify-end">
        <button
          onClick={exportCsv}
          disabled={!activeForm || filtered.length === 0}
          className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-1.5 font-body text-xs font-semibold text-ink transition hover:bg-paper disabled:opacity-40"
        >
          <Download size={12} /> Export CSV
        </button>
      </div>

      <div className="mb-5 flex items-center gap-2 font-body text-xs text-muted">
        <span className="font-semibold text-ink">Form:</span>
        <select
          value={activeFormId ?? ""}
          onChange={(e) => router.push(`/submissions?form=${e.target.value}`)}
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
        <EmptyState text="Create a form first from the dashboard." />
      ) : (
        <>
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex w-60 items-center gap-2 rounded-md border border-line bg-white px-3 py-2 font-body text-xs text-muted">
              <Search size={13} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search submissions"
                className="flex-1 bg-transparent outline-none placeholder:text-muted"
              />
            </div>
            <span className="rounded-full bg-signal px-3 py-1.5 font-body text-xs font-semibold text-white">
              All · {responses.length}
            </span>
          </div>

          {openResponse ? (
            <div className="rounded-xl border border-line bg-white p-6 shadow-sm">
              <button
                onClick={() => setOpenId(null)}
                className="mb-4 flex items-center gap-1.5 font-body text-xs font-semibold text-muted hover:text-ink"
              >
                <ArrowLeft size={13} /> Back to submissions
              </button>
              <p className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-wide text-muted">
                Submitted {new Date(openResponse.created_at).toLocaleString()}
              </p>
              <div className="divide-y divide-line">
                {fields.map((f) => (
                  <div key={f.id} className="flex items-start justify-between gap-6 py-3">
                    <span className="w-40 shrink-0 font-body text-xs text-muted">{f.label}</span>
                    <span className="flex-1 text-right font-body text-sm text-ink">
                      {answerDisplay(f, openResponse.answers[f.id])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState text="No submissions yet — share the form's public link to start collecting responses." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line bg-paper">
                  <tr>
                    <th className="px-4 py-2.5 font-mono text-[10.5px] font-bold uppercase tracking-wide text-muted">
                      Submitted
                    </th>
                    {fields.slice(0, 4).map((f) => (
                      <th
                        key={f.id}
                        className="px-4 py-2.5 font-mono text-[10.5px] font-bold uppercase tracking-wide text-muted"
                      >
                        {f.label}
                      </th>
                    ))}
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setOpenId(r.id)}
                      className="cursor-pointer border-b border-line last:border-0 hover:bg-paper"
                    >
                      <td className="px-4 py-3 text-muted">{new Date(r.created_at).toLocaleTimeString()}</td>
                      {fields.slice(0, 4).map((f) => (
                        <td key={f.id} className="px-4 py-3 text-ink">
                          {answerDisplay(f, r.answers[f.id])}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-muted">
                        <MoreVertical size={14} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center">
      <Inbox className="mx-auto mb-2 text-stone-300" size={22} />
      <p className="font-body text-xs text-muted">{text}</p>
    </div>
  );
}
