"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Archive,
  ArrowLeft,
  ClipboardList,
  Copy,
  Eye,
  Folder,
  LayoutGrid,
  LayoutTemplate,
  List,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  EyeOff,
  Upload,
} from "lucide-react";
import { THEMES, DEFAULT_THEME, type ThemeKey, type FormField } from "@/lib/schema";
import type { FormTemplate } from "@/lib/templates";
import { TemplateGallery } from "../dashboard/TemplateGallery";
import { ConfirmModal } from "../dashboard/DashboardClient";
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
}
interface FolderRow {
  id: string;
  name: string;
}

type SortMode = "updated" | "created" | "responses" | "alpha";

export function AllFormsClient({
  forms,
  folders,
  responseCounts,
  activeFolderId,
}: {
  forms: FormRow[];
  folders: FolderRow[];
  responseCounts: Record<string, number>;
  /** "all" | "none" | folder id, derived from /forms?folder= by the server. */
  activeFolderId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState<SortMode>("updated");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [deleteTarget, setDeleteTarget] = useState<FormRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<FormRow | null>(null);

  // When viewing a specific folder, new forms are created inside it; otherwise
  // they land in Uncategorized.
  const folderForCreate = activeFolderId !== "all" && activeFolderId !== "none" ? activeFolderId : null;

  async function createForm(title: string, fields: FormField[] = []) {
    setBusy(true);
    const res = await fetch("/api/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, fields, folderId: folderForCreate }),
    });
    const data = await res.json();
    if (data.id) {
      toast.success("Form created", { description: `"${title}" is ready to build.` });
      router.push(`/builder/${data.id}`);
    } else {
      toast.error("Couldn't create the form");
    }
    setBusy(false);
    setGalleryOpen(false);
  }

  async function setStatus(form: FormRow, status: string) {
    const res = await fetch(`/api/forms/${form.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) toast.success(`Form ${status === "published" ? "published" : status === "archived" ? "archived" : status === "closed" ? "closed" : "set to draft"}`);
    else toast.error("Couldn't update the form");
    router.refresh();
  }

  async function deleteForm(id: string) {
    const res = await fetch(`/api/forms/${id}`, { method: "DELETE" });
    if (res.ok) toast.info("Form deleted");
    else toast.error("Couldn't delete the form");
    router.refresh();
  }

  async function duplicate(form: FormRow) {
    const res = await fetch(`/api/forms/${form.id}/duplicate`, { method: "POST" });
    const data = await res.json();
    if (data.id) toast.success("Form duplicated", { description: `"${form.title} (copy)" was created.` });
    else toast.error("Couldn't duplicate the form");
    router.refresh();
  }

  async function share(form: FormRow) {
    const ok = await copyShareLink(form.id, form.title);
    if (ok) toast.success("Share link copied", { description: "Anyone with the link can view the form." });
    else toast.error("Couldn't copy the link");
  }

  // Carries the dragged form's id so the app-sidebar folder rows (a sibling
  // subtree) can read it from dataTransfer on drop.
  function handleFormDragStart(e: React.DragEvent, formId: string) {
    e.dataTransfer.setData("application/x-form", formId);
    e.dataTransfer.effectAllowed = "move";
  }

  const visibleForms =
    activeFolderId === "all"
      ? forms
      : activeFolderId === "none"
        ? forms.filter((f) => !f.folder_id)
        : forms.filter((f) => f.folder_id === activeFolderId);

  const filtered = visibleForms
    .filter((f) => (statusFilter === "all" ? true : f.status === statusFilter))
    .filter((f) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return f.title.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      switch (sort) {
        case "updated":
          return Date.parse(b.updated_at) - Date.parse(a.updated_at);
        case "created":
          return Date.parse(b.created_at) - Date.parse(a.created_at);
        case "responses":
          return (responseCounts[b.id] ?? 0) - (responseCounts[a.id] ?? 0);
        case "alpha":
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

  const heading =
    activeFolderId === "all"
      ? "All forms"
      : activeFolderId === "none"
        ? "Uncategorized"
        : folders.find((f) => f.id === activeFolderId)?.name ?? "Folder";

  return (
    <div className="min-h-screen p-7">
      {activeFolderId !== "all" && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-line bg-white p-4 shadow-sm dark:border-lineDark dark:bg-panelDark">
          <Folder size={18} className="text-signal" />
          <div className="min-w-0 flex-1">
            <p className="font-body text-sm font-semibold text-ink dark:text-inkDark">{heading}</p>
            <p className="font-body text-[11px] text-slate-400 dark:text-mutedDark">
              {visibleForms.length} form{visibleForms.length !== 1 ? "s" : ""} · new forms will be created inside this folder
            </p>
          </div>
          <button onClick={() => router.push("/forms")} className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 font-body text-xs font-semibold text-ink transition hover:bg-paper dark:border-lineDark dark:bg-panelDark dark:text-inkDark">
            <ArrowLeft size={12} /> All forms
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <button onClick={() => setGalleryOpen(true)} disabled={busy} className="flex items-center gap-1.5 rounded-full bg-signal px-4 py-2 font-body text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
          <Plus size={14} /> Create New Form
        </button>

        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-mutedDark" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search forms…" className="rounded-md border border-line bg-white py-2 pl-8 pr-3 font-body text-xs text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark" />
        </div>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border border-line bg-white px-2.5 py-2 font-body text-xs font-medium text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark">
          <option value="all">All statuses</option>
          {(["draft", "published", "closed", "archived"] as const).map((s) => (
            <option key={s} value={s}>
              {statusMeta(s).label}
            </option>
          ))}
        </select>

        <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} className="rounded-md border border-line bg-white px-2.5 py-2 font-body text-xs font-medium text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark">
          <option value="updated">Recently updated</option>
          <option value="created">Recently created</option>
          <option value="responses">Most responses</option>
          <option value="alpha">Alphabetical</option>
        </select>

        <span className="rounded-full bg-paper px-2.5 py-1 font-body text-[11px] text-slate-500 dark:bg-panelDark dark:text-mutedDark">{filtered.length} shown</span>

        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setView("grid")} aria-label="Grid view" className={`flex h-8 w-8 items-center justify-center rounded-md transition ${view === "grid" ? "bg-signalSoft/25 text-signal" : "border border-line text-slate-400 hover:bg-paper dark:border-lineDark dark:text-mutedDark"}`}>
            <LayoutGrid size={14} />
          </button>
          <button type="button" onClick={() => setView("list")} aria-label="List view" className={`flex h-8 w-8 items-center justify-center rounded-md transition ${view === "list" ? "bg-signalSoft/25 text-signal" : "border border-line text-slate-400 hover:bg-paper dark:border-lineDark dark:text-mutedDark"}`}>
            <List size={14} />
          </button>
        </div>
      </div>
{filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-line bg-white p-12 text-center dark:border-lineDark dark:bg-panelDark">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-signalSoft/20">
            <ClipboardList size={24} className="text-signal" />
          </div>
          <h3 className="font-display text-lg font-semibold text-ink dark:text-inkDark">{forms.length === 0 ? "Create your first form" : "No forms match"}</h3>
          <p className="mt-1.5 font-body text-sm text-slate-500 dark:text-mutedDark">
            {forms.length === 0 ? "Start collecting information, feedback, and responses in minutes." : "Try a different search, status, or folder."}
          </p>
          {forms.length === 0 && (
            <div className="mt-5 flex flex-wrap justify-center gap-2.5">
              <button onClick={() => setGalleryOpen(true)} className="flex items-center gap-1.5 rounded-full bg-signal px-4 py-2 font-body text-[12.5px] font-semibold text-white transition hover:opacity-90">
                <Plus size={14} /> Create Blank Form
              </button>
              <button onClick={() => setGalleryOpen(true)} className="flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 font-body text-[12.5px] font-medium text-slate-600 transition hover:bg-paper dark:border-lineDark dark:bg-panelDark dark:text-slate-300">
                <LayoutTemplate size={14} /> Browse Templates
              </button>
            </div>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3">
          {filtered.map((f) => (
            <FormCard
              key={f.id}
              form={f}
              responseCount={responseCounts[f.id] ?? 0}
              onOpen={() => router.push(`/builder/${f.id}`)}
              onPreview={() => window.open(`/f/${f.id}`, "_blank")}
              onStatus={(s) => void setStatus(f, s)}
              onDuplicate={() => void duplicate(f)}
              onShare={() => void share(f)}
              onArchive={() => setArchiveTarget(f)}
              onDelete={() => setDeleteTarget(f)}
              onDragStart={(e) => handleFormDragStart(e, f.id)}
              folderName={folders.find((fo) => fo.id === f.folder_id)?.name}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto overflow-hidden rounded-xl border border-line bg-white shadow-sm dark:border-lineDark dark:bg-panelDark">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-line bg-paper text-left dark:border-lineDark dark:bg-panelDark">
                <th className="px-4 py-2.5 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Form</th>
                <th className="px-4 py-2.5 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Status</th>
                <th className="px-4 py-2.5 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Responses</th>
                <th className="px-4 py-2.5 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Updated</th>
                <th className="px-4 py-2.5 text-right font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <FormListRow
                  key={f.id}
                  form={f}
                  responseCount={responseCounts[f.id] ?? 0}
                  folderName={folders.find((fo) => fo.id === f.folder_id)?.name}
                  onOpen={() => router.push(`/builder/${f.id}`)}
                  onPreview={() => window.open(`/f/${f.id}`, "_blank")}
                  onStatus={(s) => void setStatus(f, s)}
                  onDuplicate={() => void duplicate(f)}
                  onShare={() => void share(f)}
                  onArchive={() => setArchiveTarget(f)}
                  onDelete={() => setDeleteTarget(f)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {folderForCreate && (
        <p className="mt-6 rounded-xl border border-dashed border-line bg-white p-4 text-center font-body text-[11.5px] text-slate-400 dark:border-lineDark dark:bg-panelDark dark:text-mutedDark">
          Tip: hit the “+” next to any folder in the sidebar to create a form inside it, or drag a card onto a folder to move it.
        </p>
      )}

      {galleryOpen && <TemplateGallery onClose={() => setGalleryOpen(false)} onBlank={() => createForm("Untitled form")} onPick={(t: FormTemplate) => createForm(t.title, t.build())} />}

      {deleteTarget && (
        <ConfirmModal
          title="Delete this form?"
          body={`"${deleteTarget.title}" and its ${responseCounts[deleteTarget.id] ?? 0} responses will be permanently deleted. This can't be undone.`}
          confirmLabel="Delete form"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const id = deleteTarget.id;
            setDeleteTarget(null);
            void deleteForm(id);
          }}
        />
      )}

      {archiveTarget && (
        <ConfirmModal
          title="Archive this form?"
          body={`"${archiveTarget.title}" will stop accepting responses and move to the Archived status. You can restore it anytime.`}
          confirmLabel="Archive form"
          onCancel={() => setArchiveTarget(null)}
          onConfirm={() => {
            const f = archiveTarget;
            setArchiveTarget(null);
            void setStatus(f, "archived");
          }}
        />
      )}
    </div>
  );
}
function FormCard({
  form,
  responseCount,
  folderName,
  onOpen,
  onPreview,
  onStatus,
  onDuplicate,
  onShare,
  onArchive,
  onDelete,
  onDragStart,
}: {
  form: FormRow;
  responseCount: number;
  folderName?: string;
  onOpen: () => void;
  onPreview: () => void;
  onStatus: (s: string) => void;
  onDuplicate: () => void;
  onShare: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { formatRelativeDate } = useFormat();
  const allFields = form.schema?.fields ?? [];
  const fieldCount = allFields.filter((f) => f.type !== "page_break").length;
  const pageCount = allFields.filter((f) => f.type === "page_break").length + 1;
  const sm = statusMeta(form.status);
  const themeHex = THEMES[(form.theme as ThemeKey) ?? DEFAULT_THEME]?.hex ?? THEMES[DEFAULT_THEME].hex;

  const actions = [
    { label: "Edit", icon: Pencil, onClick: onOpen },
    { label: "Preview", icon: Eye, onClick: onPreview },
    form.status === "published" ? { label: "EyeOff", icon: EyeOff, onClick: () => onStatus("draft") } : { label: "Publish", icon: Upload, onClick: () => onStatus("published") },
    { label: "Duplicate", icon: Copy, onClick: onDuplicate },
    { label: "Share", icon: Send, onClick: onShare },
    { label: "Archive", icon: Archive, onClick: onArchive },
  ];

  return (
    <div draggable onDragStart={onDragStart} className="group flex flex-col rounded-xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-signal hover:shadow-md dark:border-lineDark dark:bg-panelDark dark:hover:border-signal">
      <div className="mb-2.5 flex items-center justify-between">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-body text-[10.5px] font-semibold ${sm.chip}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${sm.dot}`} /> {sm.label}
        </span>
        <div className="relative flex items-center gap-1.5">
          {form.status !== "archived" && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onStatus(form.status === "published" ? "draft" : "published"); }} title={form.status === "published" ? "EyeOff" : "Publish"} className="rounded-md p-1 text-slate-400 transition hover:bg-paper hover:text-signal dark:text-mutedDark dark:hover:bg-panelDark">
              {form.status === "published" ? <EyeOff size={13} /> : <Upload size={13} />}
            </button>
          )}
          <div>
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
              <div className="absolute right-0 z-20 mt-1.5 w-40 overflow-hidden rounded-lg border border-line bg-white shadow-lg dark:border-lineDark dark:bg-panelDark">
                {actions.map((a) => (
                  <button key={a.label} type="button" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); a.onClick(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left font-body text-[11.5px] text-slate-600 transition hover:bg-paper dark:text-mutedDark dark:hover:bg-panelDark">
                    <a.icon size={13} /> {a.label}
                  </button>
                ))}
                <div className="my-0.5 border-t border-line dark:border-lineDark" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left font-body text-[11.5px] text-warn transition hover:bg-rose-50 dark:hover:bg-panelDark"
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mb-3 flex h-[64px] flex-col justify-center gap-1.5 rounded-lg bg-paper px-2.5 dark:bg-panelDark">
        {fieldCount === 0 ? (
          <span className="font-body text-[11px] text-slate-300 dark:text-mutedDark">No fields yet</span>
        ) : (
          [70, 50, 35].map((w, i) => <div key={i} className="h-1.5 rounded opacity-25" style={{ width: `${w}%`, backgroundColor: themeHex }} />)
        )}
      </div>

      <h4 className="mb-0.5 truncate cursor-pointer font-body text-sm font-semibold text-ink transition hover:text-signal dark:text-inkDark" onClick={onOpen} title="Open in builder">
        {form.title}
      </h4>
      <p className="font-body text-[11px] text-slate-400 dark:text-mutedDark" suppressHydrationWarning>
        {fieldCount} field{fieldCount !== 1 ? "s" : ""}
        {pageCount > 1 ? ` · ${pageCount} pages` : ""} · Updated {formatRelativeDate(form.updated_at)}
      </p>

      <div className="mt-3 flex items-center gap-3 border-t border-line pt-2.5 dark:border-lineDark">
        <button type="button" onClick={onPreview} title="Preview" className="text-left font-body text-[11px] text-slate-400 dark:text-mutedDark">
          <b className="block cursor-pointer font-body text-sm font-semibold text-ink transition hover:text-signal dark:text-inkDark">{responseCount}</b>
          {responseCount === 1 ? "response" : "responses"}
        </button>
        {folderName && (
          <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-paper px-2 py-0.5 font-body text-[10px] font-medium text-slate-500 dark:bg-panelDark dark:text-mutedDark">
            <Folder size={10} /> {folderName}
          </span>
        )}
      </div>
    </div>
  );
}
function FormListRow({
  form,
  responseCount,
  folderName,
  onOpen,
  onPreview,
  onStatus,
  onDuplicate,
  onShare,
  onArchive,
  onDelete,
}: {
  form: FormRow;
  responseCount: number;
  folderName?: string;
  onOpen: () => void;
  onPreview: () => void;
  onStatus: (s: string) => void;
  onDuplicate: () => void;
  onShare: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { formatRelativeDate } = useFormat();
  const sm = statusMeta(form.status);
  const actions = [
    { label: "Edit", icon: Pencil, onClick: onOpen },
    { label: "Preview", icon: Eye, onClick: onPreview },
    form.status === "published" ? { label: "EyeOff", icon: EyeOff, onClick: () => onStatus("draft") } : { label: "Publish", icon: Upload, onClick: () => onStatus("published") },
    { label: "Duplicate", icon: Copy, onClick: onDuplicate },
    { label: "Share", icon: Send, onClick: onShare },
    { label: "Archive", icon: Archive, onClick: onArchive },
  ];

  return (
    <tr className="border-b border-line transition hover:bg-paper last:border-0 dark:border-lineDark dark:hover:bg-panelDark">
      <td className="px-4 py-2.5">
        <button type="button" onClick={onOpen} className="max-w-[280px] truncate font-body text-[13px] font-medium text-ink transition hover:text-signal dark:text-inkDark">
          {form.title}
        </button>
        {folderName && (
          <span className="ml-2 flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 font-body text-[10px] text-slate-500 dark:bg-panelDark dark:text-mutedDark">
            <Folder size={9} /> {folderName}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-body text-[10.5px] font-semibold ${sm.chip}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${sm.dot}`} /> {sm.label}
        </span>
      </td>
      <td className="px-4 py-2.5 font-body text-[12.5px] text-ink dark:text-inkDark">{responseCount}</td>
      <td className="px-4 py-2.5 font-body text-[12px] text-slate-500 dark:text-mutedDark" suppressHydrationWarning>{formatRelativeDate(form.updated_at)}</td>
      <td className="px-4 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          {form.status !== "archived" && (
            <button type="button" onClick={() => onStatus(form.status === "published" ? "draft" : "published")} title={form.status === "published" ? "EyeOff" : "Publish"} className="rounded-md p-1.5 text-slate-400 transition hover:bg-paper hover:text-signal dark:text-mutedDark dark:hover:bg-panelDark">
              {form.status === "published" ? <EyeOff size={14} /> : <Upload size={14} />}
            </button>
          )}
          <div className="relative">
            <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="Form actions" className="rounded-md p-1.5 text-slate-400 transition hover:bg-paper hover:text-ink dark:text-mutedDark dark:hover:bg-panelDark">
              <MoreVertical size={14} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-20 mt-1.5 w-40 overflow-hidden rounded-lg border border-line bg-white shadow-lg dark:border-lineDark dark:bg-panelDark">
                {actions.map((a) => (
                  <button key={a.label} type="button" onClick={() => { setMenuOpen(false); a.onClick(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left font-body text-[11.5px] text-slate-600 transition hover:bg-paper dark:text-mutedDark dark:hover:bg-panelDark">
                    <a.icon size={13} /> {a.label}
                  </button>
                ))}
                <div className="my-0.5 border-t border-line dark:border-lineDark" />
                <button type="button" onClick={() => { setMenuOpen(false); onDelete(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left font-body text-[11.5px] text-warn transition hover:bg-rose-50 dark:hover:bg-panelDark">
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}