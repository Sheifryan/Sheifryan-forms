"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Download, Eye, Inbox, MessageSquare, Paperclip, Search, Sparkles, Trash2 } from "lucide-react";
import { AiAnalysisPanel } from "@/components/ai-analysis/AiAnalysisPanel";
import { useToast } from "@/components/Toast";
import { formatBytes } from "@/lib/format";
import { useFormat } from "@/components/FormatProvider";
import type { FormField, FormSchema, UploadedFileRef } from "@/lib/schema";
import { paymentAnswerSummary } from "@/lib/schema";

interface FormRow {
  id: string;
  title: string;
  schema: FormSchema | null;
}
export interface ResponseRow {
  id: string;
  formId: string;
  answers: Record<string, unknown>;
  createdAt: string;
  isRead: boolean;
  assignedTo: string | null;
  status: string;
  respondent: string;
}
interface Metrics {
  total: number;
  new: number;
  completionRate: number;
}
export interface MemberOption {
  userId: string;
  name: string | null;
  email: string | null;
}

/** Response workflow statuses (mirrors the DB check constraint from 0013). */
export const RESPONSE_STATUS_META: Record<string, { label: string; chip: string }> = {
  new: { label: "New", chip: "bg-sky-100 text-sky-700" },
  in_progress: { label: "In Progress", chip: "bg-amber-100 text-amber-700" },
  completed: { label: "Completed", chip: "bg-emerald-100 text-emerald-700" },
  archived: { label: "Archived", chip: "bg-paper text-slate-500 dark:bg-panelDark dark:text-mutedDark" },
};
export const RESPONSE_STATUSES = ["new", "in_progress", "completed", "archived"];

function answerDisplay(field: FormField, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (field.type === "single_select" || field.type === "dropdown") return field.options?.find((o) => o.id === value)?.label ?? String(value);
  if (field.type === "multi_select") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return arr.map((id) => field.options?.find((o) => o.id === id)?.label ?? id).join(", ") || "—";
  }
  if (field.type === "checkbox") return value ? "Yes" : "No";
  if (field.type === "rating") return "★".repeat(Number(value)) + "☆".repeat(5 - Number(value));
  if (field.type === "file") {
    const arr = Array.isArray(value) ? (value as UploadedFileRef[]) : [];
    return arr.length === 0 ? "—" : `${arr.length} file${arr.length !== 1 ? "s" : ""}`;
  }
  if (field.type === "payment") {
    const summary = paymentAnswerSummary(value);
    return summary ?? (value ? JSON.stringify(value) : "—");
  }
  return String(value);
}

function toCsv(fields: FormField[], rows: ResponseRow[]): string {
  const header = ["Submitted", ...fields.map((f) => f.label)];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const data = rows.map((r) => [new Date(r.createdAt).toISOString(), ...fields.map((f) => answerDisplay(f, r.answers[f.id]))].map(escape).join(","));
  return [header.map(escape).join(","), ...data].join("\n");
}

export function ResponsesClient({
  forms,
  responses,
  activeFormId,
  metrics,
  members = [],
  orgMode = false,
  initialFrom,
  initialTo,
  initialOpenId,
}: {
  forms: FormRow[];
  responses: ResponseRow[];
  activeFormId: string | null;
  metrics: Metrics;
  members?: MemberOption[];
  orgMode?: boolean;
  initialFrom?: string | null;
  initialTo?: string | null;
  initialOpenId?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const { formatDateTime } = useFormat();
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState(initialFrom ?? "");
  const [to, setTo] = useState(initialTo ?? "");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<ResponseRow | null>(null);
  // The raw response table, or the "Ask your data" AI panel for one form.
  const [view, setView] = useState<"responses" | "ai">("responses");

  const activeForm = forms.find((f) => f.id === activeFormId) || null;
  const fields = useMemo(() => activeForm?.schema?.fields ?? [], [activeForm]);

  useEffect(() => {
    if (!openId) {
      setSignedUrls({});
      return;
    }
    const open = responses.find((r) => r.id === openId);
    const refs: string[] = [];
    Object.values(open?.answers ?? {}).forEach((v) => {
      if (Array.isArray(v)) (v as UploadedFileRef[]).forEach((r) => r.id && refs.push(r.id));
    });
    if (refs.length === 0) return;
    fetch(`/api/forms/files/signed?ids=${refs.join(",")}`)
      .then((r) => r.json())
      .then((data) => data.urls && setSignedUrls(data.urls))
      .catch(() => {});
  }, [openId, responses]);

  function applyUrlFilters() {
    const params = new URLSearchParams();
    if (activeFormId) params.set("form", activeFormId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    router.push(`/responses?${params.toString()}`);
  }

  async function markRead(id: string) {
    await fetch(`/api/responses/${id}/read`, { method: "POST" }).catch(() => {});
  }

  // Assignment / status changes go through the PATCH route, which verifies the
  // response belongs to the active workspace and checks `responses.update`.
  async function patchResponse(id: string, patch: Record<string, unknown>, successMsg: string) {
    const res = await fetch(`/api/responses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(successMsg);
      router.refresh();
    } else {
      toast.error("Couldn't update the response", { description: data.error });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/responses/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.info("Response deleted");
      if (openId === deleteTarget.id) setOpenId(null);
    } else toast.error("Couldn't delete the response");
    setDeleteTarget(null);
    router.refresh();
  }

  const filtered = useMemo(() => {
    let list = responses;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const text = [r.respondent, Object.values(r.answers).map((v) => (Array.isArray(v) ? v.join(" ") : String(v ?? ""))).join(" ")].join(" ").toLowerCase();
        return text.includes(q);
      });
    }
    list = [...list].sort((a, b) => {
      const dir = sort === "newest" ? -1 : 1;
      return (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * dir;
    });
    return list;
  }, [responses, query, sort]);

  const openResponse = responses.find((r) => r.id === openId) || null;

  return (
    <div className="min-h-screen p-7">
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Total responses" value={metrics.total} tint="text-signal" />
        <MetricCard label="New responses" value={metrics.new} tint="text-success" pulse={metrics.new > 0} />
        <MetricCard label="Completion rate" value={`${metrics.completionRate}%`} tint="text-slate-600 dark:text-inkDark" note="responses with answers vs. total" />
      </div>

      {/* Responses vs. AI Analysis. The AI panel answers questions about ONE
          form at a time, so it reuses the same (workspace-scoped) selector. */}
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1 rounded-lg bg-white p-1 shadow-sm ring-1 ring-line dark:bg-panelDark dark:ring-lineDark">
          <button
            onClick={() => setView("responses")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-body text-xs font-semibold transition ${
              view === "responses" ? "bg-signal text-white" : "text-slate-500 hover:text-ink dark:text-mutedDark dark:hover:text-inkDark"
            }`}
          >
            <Inbox size={12} /> Responses
          </button>
          <button
            onClick={() => setView("ai")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-body text-xs font-semibold transition ${
              view === "ai" ? "bg-signal text-white" : "text-slate-500 hover:text-ink dark:text-mutedDark dark:hover:text-inkDark"
            }`}
          >
            <Sparkles size={12} /> AI Analysis
          </button>
        </div>

        <select
          value={activeFormId ?? ""}
          onChange={(e) => {
            const params = new URLSearchParams();
            if (from) params.set("from", from);
            if (to) params.set("to", to);
            if (e.target.value) params.set("form", e.target.value);
            router.push(`/responses?${params.toString()}`);
          }}
          title="Form"
          className="rounded-md border border-line bg-white px-2.5 py-2 font-body text-xs font-medium text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
        >
          <option value="">All forms</option>
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </select>
      </div>

      {view === "ai" ? (
        activeForm ? (
          <div className="mt-5">
            <AiAnalysisPanel key={activeForm.id} formId={activeForm.id} formTitle={activeForm.title} />
          </div>
        ) : (
          <AiAnalysisEmptyState hasForms={forms.length > 0} />
        )
      ) : (
        <>
      {/* Toolbar */}
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-mutedDark" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search responses…"
            className="rounded-md border border-line bg-white py-2 pl-8 pr-3 font-body text-xs text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Calendar size={13} className="text-slate-400 dark:text-mutedDark" />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-line bg-white px-2 py-1.5 font-body text-xs text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark" />
          <span className="font-body text-[11px] text-slate-500 dark:text-mutedDark">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-line bg-white px-2 py-1.5 font-body text-xs text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark" />
          <button onClick={applyUrlFilters} className="rounded-md bg-signal px-3 py-1.5 font-body text-[11px] font-semibold text-white transition hover:opacity-90">
            Apply
          </button>
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as "newest" | "oldest")}
          className="rounded-md border border-line bg-white px-2.5 py-2 font-body text-xs font-medium text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>

        <button
          onClick={() => {
            if (filtered.length === 0) return;
            const blob = new Blob([toCsv(fields, filtered)], { type: "text/csv" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${(activeForm?.title ?? "responses").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-responses.csv`;
            a.click();
            URL.revokeObjectURL(a.href);
            toast.success("Export ready", { description: `${filtered.length} response${filtered.length !== 1 ? "s" : ""} exported.` });
          }}
          className="flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-2 font-body text-[11.5px] font-medium text-slate-600 transition hover:bg-paper dark:border-lineDark dark:bg-panelDark dark:text-slate-300"
        >
          <Download size={13} /> Export
        </button>
      </div>
{openResponse ? (
        <ResponseDetail
          response={openResponse}
          fields={fields}
          formTitle={activeForm?.title ?? "Unknown form"}
          signedUrls={signedUrls}
          members={members}
          orgMode={orgMode}
          onBack={() => setOpenId(null)}
          onDelete={() => setDeleteTarget(openResponse)}
          onMarkRead={() => void markRead(openResponse.id)}
          onPatch={(patch, msg) => void patchResponse(openResponse.id, patch, msg)}
        />
      ) : filtered.length === 0 ? (
        <ResponsesEmptyState hasForms={forms.length > 0} onClear={() => router.push("/responses")} />
      ) : (
        <ResponsesTable
          rows={filtered}
          formsById={new Map(forms.map((f) => [f.id, f]))}
          members={members}
          orgMode={orgMode}
          onOpen={(id) => {
            setOpenId(id);
            void markRead(id);
          }}
          onDelete={setDeleteTarget}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-xl border border-line bg-white p-5 shadow-2xl dark:border-lineDark dark:bg-panelDark" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-base font-semibold text-ink dark:text-inkDark">Delete this response?</h3>
            <p className="mt-2 font-body text-[12.5px] leading-snug text-slate-500 dark:text-mutedDark">
              The response from <b>{deleteTarget.respondent}</b> ({formatDateTime(deleteTarget.createdAt)}) will be permanently removed. This can&apos;t be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2.5">
              <button onClick={() => setDeleteTarget(null)} className="rounded-lg border border-line px-3.5 py-2 font-body text-xs font-medium text-slate-600 transition hover:bg-paper dark:border-lineDark dark:bg-panelDark dark:text-mutedDark">
                Cancel
              </button>
              <button onClick={() => void confirmDelete()} className="flex items-center gap-1.5 rounded-lg bg-warn px-3.5 py-2 font-body text-xs font-semibold text-white transition hover:opacity-90">
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, tint, note, pulse }: { label: string; value: number | string; tint: string; note?: string; pulse?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-sm dark:border-lineDark dark:bg-panelDark">
      <div className="flex items-center justify-between">
        <p className="font-body text-[11.5px] font-semibold text-slate-500 dark:text-mutedDark">{label}</p>
        {pulse && <span className="h-2 w-2 rounded-full bg-success nibble-pulse" />}
      </div>
      <p className={`mt-1 font-display text-[26px] font-bold ${tint}`}>{value}</p>
      <p className="mt-0.5 font-body text-[10.5px] text-slate-400 dark:text-mutedDark">{note ?? " "}</p>
    </div>
  );
}
function ResponsesTable({
  rows,
  formsById,
  members = [],
  orgMode = false,
  onOpen,
  onDelete,
}: {
  rows: ResponseRow[];
  formsById: Map<string, { title: string }>;
  members?: MemberOption[];
  orgMode?: boolean;
  onOpen: (id: string) => void;
  onDelete: (r: ResponseRow) => void;
}) {
  const memberName = (id: string | null) => {
    if (!id) return null;
    const m = members.find((x) => x.userId === id);
    return m ? m.name || m.email || "Member" : "Member";
  };
  const { formatDateTime, formatRelativeDate } = useFormat();

  return (
    <div className="mt-5 overflow-x-auto overflow-hidden rounded-xl border border-line bg-white shadow-sm dark:border-lineDark dark:bg-panelDark">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-line bg-paper text-left dark:border-lineDark dark:bg-panelDark">
            <th className="px-4 py-2.5 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Respondent</th>
            <th className="px-4 py-2.5 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Form</th>
            <th className="px-4 py-2.5 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Submitted</th>
            <th className="px-4 py-2.5 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Status</th>
            {orgMode && <th className="px-4 py-2.5 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Assigned</th>}
            <th className="px-4 py-2.5 text-right font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const initial = (r.respondent[0] ?? "A").toUpperCase();
            return (
              <tr key={r.id} className="cursor-pointer border-b border-line last:border-0 transition hover:bg-paper dark:border-lineDark dark:hover:bg-panelDark" onClick={() => onOpen(r.id)}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${r.isRead ? "bg-paper text-slate-400" : "bg-gradient-to-br from-signal to-accent2"}`}>
                      {r.isRead ? "" : initial}
                    </span>
                    <span className="max-w-[200px] truncate font-body text-[12.5px] text-ink dark:text-inkDark">{r.respondent}</span>
                    {!r.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success nibble-pulse" />}
                  </div>
                </td>
                <td className="px-4 py-2.5 font-body text-[12.5px] text-slate-600 dark:text-mutedDark">{formsById.get(r.formId)?.title ?? "Deleted form"}</td>
                <td className="px-4 py-2.5 font-body text-[12px] text-slate-500 dark:text-mutedDark" title={formatDateTime(r.createdAt)} suppressHydrationWarning>
                  {formatRelativeDate(r.createdAt)}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 font-body text-[10px] font-semibold ${r.isRead ? "bg-paper text-slate-500 dark:bg-panelDark dark:text-mutedDark" : "bg-emerald-50 text-success"}`}>
                    {r.isRead ? "Read" : "New"}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-semibold ${(RESPONSE_STATUS_META[r.status] ?? RESPONSE_STATUS_META.new).chip}`}>
                    {(RESPONSE_STATUS_META[r.status] ?? RESPONSE_STATUS_META.new).label}
                  </span>
                </td>
                {orgMode && (
                  <td className="px-4 py-2.5 font-body text-[12px] text-slate-600 dark:text-mutedDark">
                    {memberName(r.assignedTo) ?? <span className="text-slate-400 dark:text-mutedDark">Unassigned</span>}
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(r.id);
                      }}
                      title="View response"
                      className="rounded-md p-1.5 text-slate-500 transition hover:bg-paper hover:text-signal dark:text-mutedDark dark:hover:bg-panelDark"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(r);
                      }}
                      title="Delete response"
                      className="rounded-md p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-warn dark:text-mutedDark dark:hover:bg-panelDark"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function ResponseDetail({
  response,
  fields,
  formTitle,
  signedUrls,
  members = [],
  orgMode = false,
  onBack,
  onDelete,
  onMarkRead,
  onPatch,
}: {
  response: ResponseRow;
  fields: FormField[];
  formTitle: string;
  signedUrls: Record<string, string>;
  members?: MemberOption[];
  orgMode?: boolean;
  onBack: () => void;
  onDelete: () => void;
  onMarkRead: () => void;
  onPatch: (patch: Record<string, unknown>, successMsg: string) => void;
}) {
  const { formatDateTime } = useFormat();
  return (
    <div className="mt-5">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <button onClick={onBack} className="flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-2 font-body text-[11.5px] font-medium text-slate-600 transition hover:bg-paper dark:border-lineDark dark:bg-panelDark dark:text-slate-300">
          ← Back to responses
        </button>
        <span className="rounded-full bg-paper px-2.5 py-1 font-body text-[10.5px] text-slate-500 dark:bg-panelDark dark:text-mutedDark">{formTitle}</span>
        <span className="rounded-full bg-paper px-2.5 py-1 font-body text-[10.5px] text-slate-500 dark:bg-panelDark dark:text-mutedDark">{formatDateTime(response.createdAt)}</span>
        {!response.isRead && (
          <button onClick={onMarkRead} className="rounded-full bg-signalSoft/20 px-2.5 py-1 font-body text-[10.5px] font-medium text-signal transition hover:bg-signalSoft/30">
            Mark as read
          </button>
        )}
        <button onClick={onDelete} className="flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-2 font-body text-[11.5px] font-medium text-warn transition hover:bg-rose-50 dark:border-lineDark dark:bg-panelDark">
          <Trash2 size={12} /> Delete
        </button>
      </div>

      {orgMode && (
        <div className="mb-3 flex flex-wrap items-center gap-4 rounded-xl border border-line bg-white px-4 py-3 shadow-sm dark:border-lineDark dark:bg-panelDark">
          <label className="flex items-center gap-2 font-body text-[11.5px] text-slate-600 dark:text-mutedDark">
            Status
            <select
              value={response.status}
              onChange={(e) => onPatch({ status: e.target.value }, "Status updated")}
              className="rounded-md border border-line bg-white px-2 py-1.5 font-body text-[11.5px] font-medium text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
            >
              {RESPONSE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {RESPONSE_STATUS_META[s].label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 font-body text-[11.5px] text-slate-600 dark:text-mutedDark">
            Assigned to
            <select
              value={response.assignedTo ?? ""}
              onChange={(e) => onPatch({ assignedTo: e.target.value || null }, "Assignment updated")}
              className="rounded-md border border-line bg-white px-2 py-1.5 font-body text-[11.5px] font-medium text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name || m.email || "Member"}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="rounded-xl border border-line bg-white p-5 shadow-sm dark:border-lineDark dark:bg-panelDark">
        <div className="mb-5 flex items-center gap-3 border-b border-line pb-4 dark:border-lineDark">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-signal to-accent2 text-sm font-bold text-white">
            {(response.respondent[0] ?? "A").toUpperCase()}
          </span>
          <div>
            <p className="font-body text-sm font-semibold text-ink dark:text-inkDark">{response.respondent}</p>
            <p className="font-body text-[11.5px] text-slate-400 dark:text-mutedDark">{response.id.slice(0, 8)}</p>
          </div>
        </div>

        {fields.length === 0 ? (
          <p className="font-body text-xs text-slate-400 dark:text-mutedDark">This form has no fields.</p>
        ) : (
          <dl className="space-y-3">
            {fields.map((f) => {
              const value = response.answers[f.id];
              const display = answerDisplay(f, value);
              return (
                <div key={f.id} className="rounded-lg border border-line bg-paper p-3 dark:border-lineDark dark:bg-panelDark">
                  <dt className="font-body text-[11px] font-semibold text-slate-500 dark:text-mutedDark">
                    {f.label}
                    {f.required && <span className="text-warn"> *</span>}
                  </dt>
                  <dd className="mt-1 font-body text-[13px] text-ink dark:text-inkDark">
                    {f.type === "file" ? <FileAnswerDisplay value={value} urls={signedUrls} /> : <span>{display}</span>}
                    {Number.isNaN(Number(value)) ? null : <span className="ml-2 font-mono text-[10px] text-slate-300 dark:text-mutedDark">id {f.id.slice(0, 6)}</span>}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}

        {orgMode && <ResponseNotes responseId={response.id} />}
      </div>
    </div>
  );
}

/** Internal team notes — never visible to the respondent. */
function ResponseNotes({ responseId }: { responseId: string }) {
  const { formatRelativeDate } = useFormat();
  const [notes, setNotes] = useState<{ id: string; body: string; author: string; createdAt: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/responses/${responseId}/notes`);
    if (res.ok) {
      const data = await res.json().catch(() => ({ notes: [] }));
      setNotes(data.notes ?? []);
    }
    setLoading(false);
  }, [responseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    const res = await fetch(`/api/responses/${responseId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setSaving(false);
    if (res.ok) {
      setDraft("");
      void load();
    }
  }

  return (
    <div className="mt-6 border-t border-line pt-5 dark:border-lineDark">
      <h3 className="mb-3 flex items-center gap-1.5 font-body text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">
        <MessageSquare size={13} /> Internal notes
      </h3>

      <div className="flex flex-col gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Add a note for your team…"
          className="w-full resize-y rounded-lg border border-line bg-paper px-3 py-2 font-body text-[12.5px] text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !draft.trim()}
            className="rounded-md bg-signal px-3 py-1.5 font-body text-[11.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add note"}
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {loading ? (
          <p className="font-body text-[11.5px] text-slate-400 dark:text-mutedDark">Loading notes…</p>
        ) : notes.length === 0 ? (
          <p className="font-body text-[11.5px] text-slate-400 dark:text-mutedDark">No notes yet.</p>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="rounded-lg border border-line bg-paper px-3 py-2 dark:border-lineDark dark:bg-panelDark">
              <div className="flex items-center justify-between gap-2">
                <span className="font-body text-[11px] font-semibold text-ink dark:text-inkDark">{n.author}</span>
                <span className="font-body text-[10px] text-slate-400 dark:text-mutedDark" suppressHydrationWarning>{formatRelativeDate(n.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap font-body text-[12.5px] text-slate-600 dark:text-slate-300">{n.body}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function FileAnswerDisplay({ value, urls }: { value: unknown; urls: Record<string, string> }) {
  const refs = Array.isArray(value) ? (value as UploadedFileRef[]) : [];
  const missing = refs.filter((r) => !urls[r.id]).length;
  return (
    <div className="flex flex-col gap-1.5">
      {refs.map((r) => (
        <a key={r.id} href={urls[r.id] ?? "#"} target="_blank" rel="noreferrer" onClick={(e) => !urls[r.id] && e.preventDefault()} className="flex max-w-full items-center gap-1.5 rounded-md border border-line bg-paper px-2.5 py-1.5 font-body text-xs text-ink transition hover:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark">
          <Paperclip size={12} className="shrink-0 text-slate-400 dark:text-mutedDark" />
          <span className="min-w-0 truncate">{r.name}</span>
          <span className="shrink-0 text-[10.5px] text-slate-400 dark:text-mutedDark">{formatBytes(r.sizeBytes ?? 0)}</span>
        </a>
      ))}
      {missing > 0 && <p className="font-body text-[10px] text-slate-400 dark:text-mutedDark">Some links are still loading — refresh to re-generate them.</p>}
    </div>
  );
}

function ResponsesEmptyState({ hasForms, onClear }: { hasForms: boolean; onClear: () => void }) {
  return (
    <div className="mt-5 rounded-xl border-2 border-dashed border-line bg-white p-12 text-center dark:border-lineDark dark:bg-panelDark">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-signalSoft/20">
        <Inbox size={24} className="text-signal" />
      </div>
      <h3 className="font-display text-lg font-semibold text-ink dark:text-inkDark">No responses yet</h3>
      <p className="mt-1.5 font-body text-sm text-slate-500 dark:text-mutedDark">Share your form to start collecting responses.</p>
      {hasForms && (
        <button onClick={onClear} className="mt-5 rounded-full border border-line bg-white px-4 py-2 font-body text-xs font-medium text-slate-600 transition hover:bg-paper dark:border-lineDark dark:bg-panelDark dark:text-slate-300">
          Clear filters
        </button>
      )}
    </div>
  );
}

/** Shown in the AI Analysis tab when no single form is selected (or none exist). */
function AiAnalysisEmptyState({ hasForms }: { hasForms: boolean }) {
  return (
    <div className="mt-5 rounded-xl border-2 border-dashed border-line bg-white p-12 text-center dark:border-lineDark dark:bg-panelDark">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-signalSoft/20">
        <Sparkles size={24} className="text-signal" />
      </div>
      <h3 className="font-display text-lg font-semibold text-ink dark:text-inkDark">
        {hasForms ? "Pick a form to analyse" : "No forms yet"}
      </h3>
      <p className="mx-auto mt-1.5 max-w-md font-body text-sm text-slate-500 dark:text-mutedDark">
        {hasForms
          ? "Choose a form above, then ask questions about its submissions — the AI answers with counts, tables and charts."
          : "Create a form and collect responses first, then ask questions about them here."}
      </p>
    </div>
  );
}