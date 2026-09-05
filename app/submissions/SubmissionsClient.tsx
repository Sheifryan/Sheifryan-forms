"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Download, MoreVertical, Inbox, ArrowLeft, Paperclip } from "lucide-react";
import type { FormField, FormSchema, UploadedFileRef } from "@/lib/schema";
import { formatBytes } from "@/lib/schema";

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
  if (field.type === "file") {
    const arr = Array.isArray(value) ? (value as UploadedFileRef[]) : [];
    if (arr.length === 0) return "—";
    return arr.map((r) => r.name || String(r)).join(", ");
  }
  return String(value);
}

function toCsv(fields: FormField[], responses: ResponseRow[]): string {
  const header = ["Submitted", ...fields.map((f) => f.label), "Additional information"];
  const rows = responses.map((r) => {
    const extra = typeof r.answers.additionalInfo === "string" ? r.answers.additionalInfo : "";
    return [
      new Date(r.created_at).toISOString(),
      ...fields.map((f) => answerDisplay(f, r.answers[f.id]).replace(/"/g, '""')),
      extra.replace(/"/g, '""'),
    ];
  });
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
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const activeForm = forms.find((f) => f.id === activeFormId) || null;
  const fields = useMemo(() => activeForm?.schema?.fields ?? [], [activeForm]);
  const openResponse = responses.find((r) => r.id === openId) || null;

  // Fetch short-lived signed download URLs for every file in the response that
  // is currently open. The bucket is private, so this is the only way to read
  // the objects, and the route is owner-only.
  useEffect(() => {
    if (!openResponse || !activeFormId) {
      setSignedUrls({});
      return;
    }
    const ids: string[] = [];
    for (const f of fields) {
      if (f.type !== "file") continue;
      const v = openResponse.answers[f.id];
      if (Array.isArray(v)) {
        for (const ref of v as UploadedFileRef[]) if (typeof ref?.id === "string") ids.push(ref.id);
      }
    }
    if (ids.length === 0) {
      setSignedUrls({});
      return;
    }
    let cancelled = false;
    setSignedUrls({});
    fetch(`/api/forms/${activeFormId}/files/signed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
      .then((res) => res.json().catch(() => ({})))
      .then((data: { files?: { id: string; url: string }[] }) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const file of data.files ?? []) map[file.id] = file.url;
        setSignedUrls(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [openResponse, activeFormId, fields]);

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
                      {f.type === "file" ? (
                        <FileAnswerDisplay value={openResponse.answers[f.id]} urls={signedUrls} />
                      ) : (
                        answerDisplay(f, openResponse.answers[f.id])
                      )}
                    </span>
                  </div>
                ))}
                {typeof openResponse.answers.additionalInfo === "string" &&
                  openResponse.answers.additionalInfo.trim().length > 0 && (
                    <div className="flex items-start justify-between gap-6 py-3">
                      <span className="w-40 shrink-0 font-body text-xs text-muted">Additional information</span>
                      <span className="flex-1 whitespace-pre-wrap text-right font-body text-sm text-ink">
                        {openResponse.answers.additionalInfo}
                      </span>
                    </div>
                  )}
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

function FileAnswerDisplay({ value, urls }: { value: unknown; urls: Record<string, string> }) {
  const refs = Array.isArray(value) ? (value as UploadedFileRef[]) : [];
  if (refs.length === 0) return <>—</>;
  const missing = refs.filter((r) => !urls[r.id]).length;
  return (
    <div className="flex flex-col items-end gap-1.5">
      {refs.map((r) => (
        <a
          key={r.id}
          href={urls[r.id]}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => !urls[r.id] && e.preventDefault()}
          className="flex max-w-full items-center gap-1.5 rounded-md border border-line bg-paper px-2.5 py-1.5 font-body text-xs text-ink transition hover:border-muted"
        >
          <Paperclip size={12} className="shrink-0 text-muted" />
          <span className="min-w-0 truncate">{r.name}</span>
          <span className="shrink-0 text-[10.5px] text-muted">{formatBytes(r.sizeBytes)}</span>
        </a>
      ))}
      {missing > 0 && (
        <p className="font-body text-[10px] text-muted">Some links are still loading — refresh to re-generate them.</p>
      )}
    </div>
  );
}
