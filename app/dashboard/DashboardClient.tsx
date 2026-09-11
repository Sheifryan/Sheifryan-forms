"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { ClipboardList, Copy, Eye, Folder, Inbox, LayoutTemplate, MoreVertical, Pencil, Plus, Send, Sparkles, Trash2, TrendingUp, Users, Wallet, X } from "lucide-react";
import { THEMES, DEFAULT_THEME, type ThemeKey, type FormField } from "@/lib/schema";
import { TEMPLATES, type FormTemplate } from "@/lib/templates";
import { TemplateGallery } from "./TemplateGallery";
import { AiFormModal } from "./AiFormModal";
import { useToast } from "@/components/Toast";
import { statusMeta } from "@/lib/formStatus";
import { copyShareLink } from "@/lib/format";
import { useFormat } from "@/components/FormatProvider";

interface FormRow {
  id: string;
  title: string;
  status: string;
  schema: { fields?: { type?: string }[] } | null;
  theme: string | null;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
  views?: number | null;
  owner_id?: string | null;
}
interface FolderRow {
  id: string;
  name: string;
}
export interface RecentResponseRow {
  id: string;
  formId: string;
  formTitle: string;
  createdAt: string;
  respondent: string;
}
interface Stats {
  totalForms: number;
  totalResponses: number;
  thisMonthResponses: number;
  credits: number;
  onboarded: boolean;
}

export interface DashboardActivity {
  id: string;
  actor: string;
  action: string;
  resourceLabel: string | null;
  tone: string;
  verb: string;
  createdAt: string;
}

export function DashboardClient({
  forms,
  folders,
  responseCounts,
  recentResponses,
  stats,
  orgMode = false,
  activeMembers = 0,
  activities = [],
  creatorNames = {},
  workspaceLabel,
  initialGalleryOpen = false,
  justOnboarded = false,
}: {
  forms: FormRow[];
  folders: FolderRow[];
  responseCounts: Record<string, number>;
  recentResponses: RecentResponseRow[];
  stats: Stats;
  orgMode?: boolean;
  activeMembers?: number;
  activities?: DashboardActivity[];
  creatorNames?: Record<string, string>;
  workspaceLabel?: string;
  initialGalleryOpen?: boolean;
  justOnboarded?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { formatRelativeDate } = useFormat();
  const [busy, setBusy] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(initialGalleryOpen);
  const [aiOpen, setAiOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FormRow | null>(null);

  async function createForm(title: string, fields: FormField[] = []) {
    setBusy(true);
    const res = await fetch("/api/forms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, fields }) });
    const data = await res.json();
    if (data.id) {
      toast.success("Form created", { description: `"${title}" is ready to build.` });
      router.push(`/builder/${data.id}`);
    } else toast.error("Couldn't create the form");
    setBusy(false);
    setGalleryOpen(false);
  }

  async function duplicate(form: FormRow) {
    const res = await fetch(`/api/forms/${form.id}/duplicate`, { method: "POST" });
    const data = await res.json();
    if (data.id) {
      toast.success("Form duplicated", { description: `"${form.title} (copy)" was created.` });
      router.refresh();
    } else toast.error("Couldn't duplicate the form");
  }

  async function share(form: FormRow) {
    const ok = await copyShareLink(form.id, form.title);
    if (ok) toast.success("Share link copied", { description: "Anyone with the link can view the form." });
    else toast.error("Couldn't copy the link");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/forms/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) toast.info("Form deleted", { description: deleteTarget.title });
    else toast.error("Couldn't delete the form");
    setDeleteTarget(null);
    router.refresh();
  }

  const recent = forms.slice(0, 6);

  return (
    <div className="min-h-screen p-7">
      {justOnboarded && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-signal/30 bg-signalSoft/10 p-4">
          <Sparkles size={18} className="mt-0.5 shrink-0 text-signal" />
          <div className="min-w-0 flex-1">
            <p className="font-body text-sm font-semibold text-ink dark:text-inkDark">You&apos;re all set up 🎉</p>
            <p className="font-body text-[12px] text-slate-500 dark:text-mutedDark">
              Your workspace is ready. Create a form, pick a template, or import your first responses.
            </p>
          </div>
          <button type="button" onClick={() => router.replace("/dashboard")} className="text-slate-400 transition hover:text-ink dark:text-mutedDark">
            <X size={14} />
          </button>
        </div>
      )}

      {!stats.onboarded && !justOnboarded && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-line bg-white p-4 shadow-sm dark:border-lineDark dark:bg-panelDark">
          <ClipboardList size={18} className="mt-0.5 shrink-0 text-signal" />
          <div className="min-w-0 flex-1">
            <p className="font-body text-sm font-semibold text-ink dark:text-inkDark">Finish setting up your workspace</p>
            <p className="font-body text-[12px] text-slate-500 dark:text-mutedDark">
              Tell us what you&apos;ll use NibbleForms for and we&apos;ll point you at the right starting point.
            </p>
          </div>
          <Link href="/onboarding" className="shrink-0 rounded-full bg-signal px-3.5 py-1.5 font-body text-xs font-semibold text-white transition hover:opacity-90">
            Continue setup
          </Link>
        </div>
      )}

      {/* Stat cards */}
      {orgMode && workspaceLabel && (
        <p className="mb-4 font-body text-[13px] text-slate-500 dark:text-mutedDark">
          Here&apos;s what&apos;s happening across <b className="text-ink dark:text-inkDark">{workspaceLabel}</b>.
        </p>
      )}

      <div className={`grid grid-cols-2 gap-4 ${orgMode ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
        <StatCard icon={ClipboardList} tint="bg-signalSoft/20 text-signal" label="Total Forms" value={stats.totalForms} note={`${forms.filter((f) => f.status === "published").length} published`} />
        <StatCard icon={Inbox} tint="bg-sky-100 text-sky-700" label="Total Responses" value={stats.totalResponses} note="across all forms" />
        {orgMode && <StatCard icon={Users} tint="bg-accent2/15 text-accent2" label="Active Members" value={activeMembers} note="teammates in this organisation" />}
        <StatCard icon={TrendingUp} tint="bg-emerald-100 text-emerald-700" label="Responses This Month" value={stats.thisMonthResponses} note="current calendar month" />
        <StatCard icon={Wallet} tint="bg-amber-100 text-amber-700" label="Available Credits" value={stats.credits} note="for submissions, storage & workflows" />
      </div>

      {/* Quick actions */}
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <button onClick={() => setGalleryOpen(true)} disabled={busy} className="flex items-center gap-1.5 rounded-full bg-signal px-4 py-2 font-body text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
          <Plus size={14} /> Create Form
        </button>
        <button onClick={() => setGalleryOpen(true)} className="flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 font-body text-[12.5px] font-medium text-slate-600 transition hover:bg-paper dark:border-lineDark dark:bg-panelDark dark:text-slate-300 dark:hover:bg-panelDark">
          <LayoutTemplate size={14} /> Browse Templates
        </button>
        <button onClick={() => setAiOpen(true)} className="flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 font-body text-[12.5px] font-medium text-slate-600 transition hover:bg-paper dark:border-lineDark dark:bg-panelDark dark:text-slate-300 dark:hover:bg-panelDark">
          <Sparkles size={14} /> Create with AI
        </button>
        <Link href="/responses" className="flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 font-body text-[12.5px] font-medium text-slate-600 transition hover:bg-paper dark:border-lineDark dark:bg-panelDark dark:text-slate-300 dark:hover:bg-panelDark">
          <Inbox size={14} /> View Responses
        </Link>
      </div>
      {/* Organisation activity */}
      {orgMode && (
        <section className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-[15px] font-semibold text-ink dark:text-inkDark">Organisation activity</h2>
            <Link href="/activity" className="font-body text-[12px] font-semibold text-signal hover:underline">
              View all →
            </Link>
          </div>
          {activities.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-line bg-white p-8 text-center dark:border-lineDark dark:bg-panelDark">
              <Users className="mx-auto mb-2 text-slate-300 dark:text-mutedDark" size={22} />
              <p className="font-body text-[13px] font-medium text-slate-700 dark:text-inkDark">No activity yet</p>
              <p className="mt-1 font-body text-xs text-slate-400 dark:text-mutedDark">
                Invite a teammate or publish a form and it&apos;ll show up here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white shadow-sm dark:divide-lineDark dark:border-lineDark dark:bg-panelDark">
              {activities.map((a) => {
                const initials = a.actor.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "M";
                return (
                  <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-signal to-accent2 text-[10px] font-bold text-white">
                      {initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-body text-[12.5px] text-ink dark:text-inkDark">
                        <b className="font-semibold">{a.actor}</b> {a.verb}
                        {a.resourceLabel ? <span className="text-slate-500 dark:text-mutedDark"> · {a.resourceLabel}</span> : null}
                      </p>
                      <p className="mt-0.5 font-body text-[11px] text-slate-400 dark:text-mutedDark" suppressHydrationWarning>{formatRelativeDate(a.createdAt)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 font-body text-[10px] font-semibold ${a.tone}`}>{a.action.split(".")[0]}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* Recent forms */}
      <section className="mt-7">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-[15px] font-semibold text-ink dark:text-inkDark">Recent forms</h2>
          <Link href="/forms" className="font-body text-[12px] font-semibold text-signal hover:underline">
            View all →
          </Link>
        </div>

        {forms.length === 0 ? (
          <FormsEmptyState onCreate={() => setGalleryOpen(true)} onTemplates={() => setGalleryOpen(true)} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recent.map((f) => (
              <DashboardFormCard
                key={f.id}
                form={f}
                responseCount={responseCounts[f.id] ?? 0}
                folderName={folders.find((x) => x.id === f.folder_id)?.name}
                creatorName={orgMode && f.owner_id ? creatorNames[f.owner_id] : undefined}
                onOpen={() => router.push(`/builder/${f.id}`)}
                onPreview={() => window.open(`/f/${f.id}`, "_blank")}
                onResponses={() => router.push(`/responses?form=${f.id}`)}
                onDuplicate={() => void duplicate(f)}
                onShare={() => void share(f)}
                onDelete={() => setDeleteTarget(f)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Recent responses */}
      <section className="mt-7">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-[15px] font-semibold text-ink dark:text-inkDark">Recent responses</h2>
          <Link href="/responses" className="font-body text-[12px] font-semibold text-signal hover:underline">
            View all →
          </Link>
        </div>
        {recentResponses.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-line bg-white p-10 text-center dark:border-lineDark dark:bg-panelDark">
            <Inbox className="mx-auto mb-2 text-slate-300 dark:text-mutedDark" size={26} />
            <p className="font-body text-[13.5px] font-medium text-slate-700 dark:text-inkDark">No responses yet</p>
            <p className="mt-1 font-body text-xs text-slate-400 dark:text-mutedDark">Share your form to start collecting responses.</p>
            {forms.length > 0 && (
              <button onClick={() => void share(forms[0])} className="mt-4 flex items-center gap-1.5 rounded-full bg-signal px-4 py-2 font-body text-xs font-semibold text-white transition hover:opacity-90">
                <Send size={13} /> Copy share link
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm dark:border-lineDark dark:bg-panelDark">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-line bg-paper text-left dark:border-lineDark dark:bg-panelDark">
                  <th className="px-4 py-2.5 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Respondent</th>
                  <th className="px-4 py-2.5 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Form</th>
                  <th className="px-4 py-2.5 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {recentResponses.map((r) => (
                  <tr key={r.id} onClick={() => router.push(`/responses?form=${r.formId}`)} className="cursor-pointer border-b border-line transition hover:bg-paper last:border-0 dark:border-lineDark dark:hover:bg-panelDark">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-signal to-accent2 text-[10px] font-bold text-white">
                          {(r.respondent[0] ?? "A").toUpperCase()}
                        </span>
                        <span className="max-w-[180px] truncate font-body text-[12.5px] text-ink dark:text-inkDark">{r.respondent}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-body text-[12.5px] text-slate-600 dark:text-mutedDark">{r.formTitle}</td>
                    <td className="px-4 py-2.5 font-body text-[12px] text-slate-400 dark:text-mutedDark" suppressHydrationWarning>{formatRelativeDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
{galleryOpen && <TemplateGallery onClose={() => setGalleryOpen(false)} onBlank={() => createForm("Untitled form")} onPick={(t: FormTemplate) => createForm(t.title, t.build())} />}
      {aiOpen && <AiFormModal onClose={() => setAiOpen(false)} />}

      {deleteTarget && (
        <ConfirmModal
          title="Delete this form?"
          body={`"${deleteTarget.title}" and its ${responseCounts[deleteTarget.id] ?? 0} responses will be permanently deleted. This can't be undone.`}
          confirmLabel="Delete form"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, tint, label, value, note }: { icon: typeof Plus; tint: string; label: string; value: number; note: string }) {
  const { formatNumber } = useFormat();
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-sm dark:border-lineDark dark:bg-panelDark">
      <div className="flex items-center justify-between">
        <p className="font-body text-[11.5px] font-semibold text-slate-500 dark:text-mutedDark">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tint}`}>
          <Icon size={15} />
        </span>
      </div>
      <p className="mt-1 font-display text-[26px] font-bold text-ink dark:text-inkDark">{formatNumber(value)}</p>
      <p className="mt-0.5 font-body text-[10.5px] text-slate-400 dark:text-mutedDark">{note}</p>
    </div>
  );
}
function DashboardFormCard({
  form,
  responseCount,
  folderName,
  creatorName,
  onOpen,
  onPreview,
  onResponses,
  onDuplicate,
  onShare,
  onDelete,
}: {
  form: FormRow;
  responseCount: number;
  folderName?: string;
  creatorName?: string;
  onOpen: () => void;
  onPreview: () => void;
  onResponses: () => void;
  onDuplicate: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const { formatRelativeDate, formatNumber } = useFormat();
  const [menuOpen, setMenuOpen] = useState(false);
  const allFields = form.schema?.fields ?? [];
  const fieldCount = allFields.filter((f) => f.type !== "page_break").length;
  const pageCount = allFields.filter((f) => f.type === "page_break").length + 1;
  const sm = statusMeta(form.status);
  const themeHex = THEMES[(form.theme as ThemeKey) ?? DEFAULT_THEME]?.hex ?? THEMES[DEFAULT_THEME].hex;

  const actions: { label: string; icon: typeof Pencil; onClick: () => void }[] = [
    { label: "Edit", icon: Pencil, onClick: onOpen },
    { label: "Preview", icon: Eye, onClick: onPreview },
    { label: "View responses", icon: Inbox, onClick: onResponses },
    { label: "Duplicate", icon: Copy, onClick: onDuplicate },
    { label: "Share", icon: Send, onClick: onShare },
    { label: "Delete", icon: Trash2, onClick: onDelete },
  ];

  return (
    <div className="group flex flex-col rounded-xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-signal hover:shadow-md dark:border-lineDark dark:bg-panelDark dark:hover:border-signal">
      <div className="mb-2.5 flex items-center justify-between">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-body text-[10.5px] font-semibold ${sm.chip}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${sm.dot}`} />
          {sm.label}
        </span>
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            aria-label="Form actions"
            className="rounded-md p-1 text-slate-400 transition hover:bg-paper hover:text-ink dark:text-mutedDark dark:hover:bg-panelDark"
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-20 mt-1.5 w-44 overflow-hidden rounded-lg border border-line bg-white shadow-lg dark:border-lineDark dark:bg-panelDark">
              {actions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    a.onClick();
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left font-body text-[11.5px] transition hover:bg-paper dark:hover:bg-panelDark ${
                    a.label === "Delete" ? "text-warn" : "text-slate-600 dark:text-mutedDark"
                  }`}
                >
                  <a.icon size={13} />
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-3 flex h-[64px] flex-col justify-center gap-1.5 rounded-lg bg-paper px-2.5 dark:bg-panelDark">
        {fieldCount === 0 ? (
          <span className="font-body text-[11px] text-slate-300 dark:text-mutedDark">No fields yet</span>
        ) : (
          [70, 50, 35].map((w, i) => <div key={i} className="h-1.5 rounded opacity-25" style={{ width: `${w}%`, backgroundColor: themeHex }} />)
        )}
      </div>
<h4
        className="mb-0.5 cursor-pointer truncate font-body text-sm font-semibold text-ink transition hover:text-signal dark:text-inkDark"
        onClick={onOpen}
        title="Open in builder"
      >
        {form.title}
      </h4>
      <p className="font-body text-[11px] text-slate-400 dark:text-mutedDark">
        {fieldCount} field{fieldCount !== 1 ? "s" : ""}
        {pageCount > 1 ? ` · ${pageCount} pages` : ""}
        {form.views ? ` · ${formatNumber(form.views)} views` : ""}
      </p>

      <div className="mt-3 flex items-center gap-3 border-t border-line pt-2.5 dark:border-lineDark">
        <button type="button" onClick={onResponses} className="text-left font-body text-[11px] text-slate-400 dark:text-mutedDark">
          <b className="block cursor-pointer font-body text-sm font-semibold text-ink transition hover:text-signal dark:text-inkDark">{responseCount}</b>
          {responseCount === 1 ? "response" : "responses"}
        </button>
        <span className="font-body text-[10.5px] text-slate-400 dark:text-mutedDark" suppressHydrationWarning>Updated {formatRelativeDate(form.updated_at)}</span>
        {creatorName && <span className="max-w-[110px] truncate font-body text-[10.5px] text-slate-400 dark:text-mutedDark">by {creatorName}</span>}
        {folderName && (
          <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-paper px-2 py-0.5 font-body text-[10px] font-medium text-slate-500 dark:bg-panelDark dark:text-mutedDark">
            <Folder size={10} /> {folderName}
          </span>
        )}
      </div>
    </div>
  );
}

function FormsEmptyState({ onCreate, onTemplates }: { onCreate: () => void; onTemplates: () => void }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-line bg-white p-10 text-center dark:border-lineDark dark:bg-panelDark">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-signalSoft/20">
        <ClipboardList size={24} className="text-signal" />
      </div>
      <h3 className="font-display text-lg font-semibold text-ink dark:text-inkDark">Create your first form</h3>
      <p className="mt-1.5 font-body text-sm text-slate-500 dark:text-mutedDark">Start collecting information, feedback, and responses in minutes.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2.5">
        <button onClick={onCreate} className="flex items-center gap-1.5 rounded-full bg-signal px-4 py-2 font-body text-[12.5px] font-semibold text-white transition hover:opacity-90">
          <Plus size={14} /> Create Blank Form
        </button>
        <button onClick={onTemplates} className="flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 font-body text-[12.5px] font-medium text-slate-600 transition hover:bg-paper dark:border-lineDark dark:bg-panelDark dark:text-slate-300">
          <LayoutTemplate size={14} /> Browse Templates
        </button>
      </div>
    </div>
  );
}

export function ConfirmModal({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-5 shadow-2xl dark:border-lineDark dark:bg-panelDark" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-base font-semibold text-ink dark:text-inkDark">{title}</h3>
        <p className="mt-2 font-body text-[12.5px] leading-snug text-slate-500 dark:text-mutedDark">{body}</p>
        <div className="mt-4 flex justify-end gap-2.5">
          <button onClick={onCancel} className="rounded-lg border border-line px-3.5 py-2 font-body text-xs font-medium text-slate-600 transition hover:bg-paper dark:border-lineDark dark:bg-panelDark dark:text-mutedDark">
            Cancel
          </button>
          <button onClick={onConfirm} className="flex items-center gap-1.5 rounded-lg bg-warn px-3.5 py-2 font-body text-xs font-semibold text-white transition hover:opacity-90">
            <Trash2 size={13} /> {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}