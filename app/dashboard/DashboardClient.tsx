"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search, Bell, Plus, ClipboardList, Trash2, Folder } from "lucide-react";
import { THEMES, type ThemeKey, type FormField } from "@/lib/schema";
import { TEMPLATES, type FormTemplate } from "@/lib/templates";
import { TemplateGallery } from "./TemplateGallery";
import { useToast } from "@/components/Toast";

interface FormRow {
  id: string;
  title: string;
  status: string;
  schema: { fields?: { type?: string }[] } | null;
  theme: string | null;
  folder_id: string | null;
  updated_at: string;
}
interface FolderRow {
  id: string;
  name: string;
}

export function DashboardClient({
  forms,
  folders,
  responseCounts,
  activeFolderId,
}: {
  forms: FormRow[];
  folders: FolderRow[];
  responseCounts: Record<string, number>;
  /** "all" | "none" | folder id, derived from /dashboard?folder= by the server. */
  activeFolderId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  async function createForm(title: string, fields: FormField[] = []) {
    setBusy(true);
    const res = await fetch("/api/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, fields }),
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

  async function deleteForm(id: string) {
    const res = await fetch(`/api/forms/${id}`, { method: "DELETE" });
    if (res.ok) toast.info("Form deleted");
    else toast.error("Couldn't delete the form");
    router.refresh();
  }

  // Carries the dragged form's id so the app-sidebar folder rows (a sibling
  // subtree) can read it from dataTransfer on drop.
  function handleFormDragStart(e: React.DragEvent, formId: string) {
    e.dataTransfer.setData("application/x-form", formId);
    e.dataTransfer.effectAllowed = "move";
  }

  const totalResponses = Object.values(responseCounts).reduce((a, b) => a + b, 0);
  const totalFields = forms.reduce(
    (sum, f) => sum + (f.schema?.fields?.filter((x) => x.type !== "page_break").length ?? 0),
    0
  );
  const visibleForms =
    activeFolderId === "all"
      ? forms
      : activeFolderId === "none"
        ? forms.filter((f) => !f.folder_id)
        : forms.filter((f) => f.folder_id === activeFolderId);

  return (
    <div className="min-h-screen">
      {/* top bar */}
      <div className="flex items-center justify-between border-b border-line bg-white px-7 py-4">
        <div>
          <p className="mb-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-muted">Workspace</p>
          <h1 className="font-display text-xl font-semibold tracking-tight text-ink">Good morning</h1>
        </div>
        <div className="flex items-center gap-2">
          <IconBtn icon={Search} />
          <IconBtn icon={Bell} />
          <button
            onClick={() => setGalleryOpen(true)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-full bg-signal px-4 py-2 font-body text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            <Plus size={14} /> New form
          </button>
        </div>
      </div>

      <div className="p-7">
        {/* hero */}
        <div className="relative mb-7 overflow-hidden rounded-2xl bg-gradient-to-br from-signal via-indigo-500 to-accent2 p-8 text-white">
          <h2 className="mb-1.5 font-display text-xl font-semibold">Create your next form</h2>
          <p className="mb-5 max-w-md font-body text-[13px] text-indigo-50">
            Start from a blank form, or pick a template to get going in seconds.
          </p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.filter((t) => t.featured)
              .slice(0, 4)
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => createForm(t.title, t.build())}
                  className="rounded-full border border-white/30 bg-white/10 px-3.5 py-1.5 font-body text-xs font-medium text-white backdrop-blur transition hover:bg-white/20"
                >
                  + {t.title}
                </button>
              ))}
            <button
              onClick={() => setGalleryOpen(true)}
              className="rounded-full border border-white/30 bg-white/10 px-3.5 py-1.5 font-body text-xs font-medium text-white backdrop-blur transition hover:bg-white/20"
            >
              Browse all templates →
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_280px] gap-6">

          {/* Forms grid */}
          <div>
            <div className="mb-3.5 flex items-center justify-between">
              <h3 className="font-display text-[15px] font-semibold text-ink">
                {activeFolderId === "all"
                  ? "Your forms"
                  : activeFolderId === "none"
                    ? "Uncategorized"
                    : folders.find((f) => f.id === activeFolderId)?.name}
              </h3>
              <span className="font-body text-xs font-semibold text-muted">{visibleForms.length} total</span>
            </div>

            {visibleForms.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center">
                <ClipboardList className="mx-auto mb-2 text-stone-300" size={22} />
                <p className="mb-3 font-body text-xs text-muted">
                  {forms.length === 0 ? "You haven't created any forms yet." : "No forms in this folder yet."}
                </p>
                {forms.length === 0 && (
                  <button
                    onClick={() => setGalleryOpen(true)}
                    className="rounded-full bg-signal px-4 py-2 font-body text-xs font-semibold text-white hover:opacity-90"
                  >
                    Create your first form
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3.5">
                {visibleForms.map((f) => (
                  <FormCard
                    key={f.id}
                    form={f}
                    responseCount={responseCounts[f.id] ?? 0}
                    onOpen={() => router.push(`/builder/${f.id}`)}
                    onDelete={() => deleteForm(f.id)}
                    onDragStart={(e) => handleFormDragStart(e, f.id)}
                    folderName={folders.find((fo) => fo.id === f.folder_id)?.name}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
            <h3 className="mb-3 font-display text-[15px] font-semibold text-ink">Overview</h3>
            <div className="space-y-3">
              <StatRow label="Total forms" value={forms.length} />
              <StatRow label="Live forms" value={forms.filter((f) => f.status === "published").length} />
              <StatRow label="Total responses" value={totalResponses} />
              <StatRow label="Total fields built" value={totalFields} />
            </div>
          </div>
        </div>
      </div>

      {galleryOpen && (
        <TemplateGallery
          onClose={() => setGalleryOpen(false)}
          onBlank={() => createForm("Untitled form")}
          onPick={(t: FormTemplate) => createForm(t.title, t.build())}
        />
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-line pb-2.5 last:border-0">
      <span className="font-body text-xs text-muted">{label}</span>
      <span className="font-body text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}

function FormCard({
  form,
  responseCount,
  onOpen,
  onDelete,
  onDragStart,
  folderName,
}: {
  form: FormRow;
  responseCount: number;
  onOpen: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
  folderName?: string;
}) {
  const allFields = form.schema?.fields ?? [];
  const fieldCount = allFields.filter((f) => f.type !== "page_break").length;
  const pageCount = allFields.filter((f) => f.type === "page_break").length + 1;
  const isLive = form.status === "published";
  const themeHex = THEMES[(form.theme as ThemeKey) ?? "indigo"]?.hex ?? THEMES.indigo.hex;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      className="group cursor-pointer rounded-xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing"
    >
      <div className="mb-2.5 flex items-center justify-between">
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 font-body text-[10.5px] font-semibold ${
            isLive ? "bg-emerald-50 text-success" : "bg-stone-100 text-stone-600"
          }`}
        >
          {isLive ? "● Live" : "Draft"}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="rounded p-1 text-stone-300 opacity-0 transition hover:bg-rose-50 hover:text-warn group-hover:opacity-100"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <div className="mb-3 flex h-[68px] flex-col justify-center gap-1.5 rounded-lg bg-paper p-2.5">
        {fieldCount === 0 ? (
          <span className="font-body text-[11px] text-stone-300">No fields yet</span>
        ) : (
          [70, 50, 35].map((w, i) => (
            <div key={i} className="h-1.5 rounded opacity-25" style={{ width: `${w}%`, backgroundColor: themeHex }} />
          ))
        )}
      </div>
      <h4 className="mb-0.5 truncate font-body text-sm font-semibold text-ink">{form.title}</h4>
      <p className="font-body text-[11px] text-muted">
        {fieldCount} field{fieldCount !== 1 ? "s" : ""}
        {pageCount > 1 ? ` · ${pageCount} pages` : ""}
      </p>
      <div className="mt-3 flex items-center gap-4 border-t border-line pt-3">
        <div className="font-body text-[10.5px] text-muted">
          <b className="block font-body text-sm font-semibold text-ink">{responseCount}</b>
          responses
        </div>
        {folderName && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 font-body text-[10px] font-medium text-stone-500">
            <Folder size={10} /> {folderName}
          </span>
        )}
      </div>
    </div>
  );
}

function IconBtn({ icon: Icon }: { icon: typeof Search }) {
  return (
    <button className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-muted transition hover:bg-paper">
      <Icon size={15} />
    </button>
  );
}
