"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, File, Files as FilesIcon, Image as ImageIcon, Paperclip, Search, Trash2, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { formatBytes } from "@/lib/format";
import { useFormat } from "@/components/FormatProvider";
import { usagePercent } from "@/lib/plans";

interface FileRow {
  id: string;
  formId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  storagePath: string;
  uploadedBy: string | null;
}
interface FormRow {
  id: string;
  title: string;
}
interface UploaderOption {
  userId: string;
  name: string | null;
  email: string | null;
}

export function FilesClient({
  files,
  forms,
  activeFormId,
  uploaders = [],
  orgMode = false,
  usage,
  quota,
  credits,
}: {
  files: FileRow[];
  forms: FormRow[];
  activeFormId: string | null;
  uploaders?: UploaderOption[];
  orgMode?: boolean;
  usage: number;
  quota: number;
  credits: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const { formatRelativeDate } = useFormat();
  const [query, setQuery] = useState("");
  const [uploaderFilter, setUploaderFilter] = useState("");
  const [preview, setPreview] = useState<{ url: string; name: string; mime: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileRow | null>(null);

  const formById = useMemo(() => new Map(forms.map((f) => [f.id, f])), [forms]);

  const uploaderName = (id: string | null) => {
    if (!id) return null;
    const u = uploaders.find((x) => x.userId === id);
    return u ? u.name || u.email || "Member" : "Member";
  };

  const filtered = useMemo(() => {
    let list = files;
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((f) => f.name.toLowerCase().includes(q));
    if (uploaderFilter) list = list.filter((f) => f.uploadedBy === uploaderFilter);
    return list;
  }, [files, query, uploaderFilter]);

  async function signedUrl(file: FileRow): Promise<string | null> {
    const res = await fetch("/api/files/signed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [file.id] }),
    });
    const data = await res.json();
    const found = data.files?.find((f: { id: string }) => f.id === file.id);
    return found?.url ?? null;
  }

  async function download(file: FileRow) {
    const url = await signedUrl(file);
    if (!url) {
      toast.error("Couldn't generate a download link");
      return;
    }
    window.open(url, "_blank");
  }

  async function openPreview(file: FileRow) {
    if (!file.mimeType.startsWith("image/")) {
      await download(file);
      return;
    }
    const url = await signedUrl(file);
    if (url) setPreview({ url, name: file.name, mime: file.mimeType });
    else toast.error("Couldn't generate a preview link");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/files?id=${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
    if (res.ok) toast.info("File deleted", { description: deleteTarget.name });
    else toast.error("Couldn't delete the file");
    setDeleteTarget(null);
    router.refresh();
  }

  const percent = usagePercent(usage, quota);

  return (
    <div className="min-h-screen p-7">
      {/* Storage usage card */}
      <div className="rounded-xl border border-line bg-white p-5 shadow-sm dark:border-lineDark dark:bg-panelDark">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-body text-[11.5px] font-semibold text-slate-500 dark:text-mutedDark">Storage</p>
            <p className="font-display text-xl font-bold text-ink dark:text-inkDark">
              {formatBytes(usage)} <span className="font-body text-[13px] text-slate-400 dark:text-mutedDark">of {formatBytes(quota)} used</span>
            </p>
          </div>
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-signalSoft/20 text-signal`}>
            <FilesIcon size={20} />
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper dark:bg-panelDark">
          <div
            className={`h-full rounded-full transition-all ${percent >= 90 ? "bg-warn" : "bg-signal"}`}
            style={{ width: `${Math.max(2, percent)}%` }}
          />
        </div>
        <p className="mt-1.5 font-body text-[11px] text-slate-400 dark:text-mutedDark">
          {percent >= 90 ? "You're almost out of storage — free up space or upgrade." : `${percent}% used`} · Files consume 1 credit per 10 MB stored.
        </p>
      </div>

      {/* Toolbar */}
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <select
          value={activeFormId ?? ""}
          onChange={(e) => {
            const params = new URLSearchParams();
            if (e.target.value) params.set("form", e.target.value);
            router.push(`/files?${params.toString()}`);
          }}
          className="rounded-md border border-line bg-white px-2.5 py-2 font-body text-xs font-medium text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
        >
          <option value="">All forms</option>
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </select>

        {orgMode && uploaders.length > 0 && (
          <select
            value={uploaderFilter}
            onChange={(e) => setUploaderFilter(e.target.value)}
            className="rounded-md border border-line bg-white px-2.5 py-2 font-body text-xs font-medium text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
          >
            <option value="">Anyone</option>
            {uploaders.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.name || u.email || "Member"}
              </option>
            ))}
          </select>
        )}

        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-mutedDark" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files…"
            className="rounded-md border border-line bg-white py-2 pl-8 pr-3 font-body text-xs text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
          />
        </div>

        <span className="rounded-full bg-paper px-2.5 py-1 font-body text-[11px] text-slate-500 dark:bg-panelDark dark:text-mutedDark">
          {filtered.length} file{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border-2 border-dashed border-line bg-white p-12 text-center dark:border-lineDark dark:bg-panelDark">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-signalSoft/20">
            <FilesIcon size={24} className="text-signal" />
          </div>
          <h3 className="font-display text-lg font-semibold text-ink dark:text-inkDark">No files yet</h3>
          <p className="mt-1.5 font-body text-sm text-slate-500 dark:text-mutedDark">
            Files uploaded through your forms with a <b>File upload</b> field appear here.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto overflow-hidden rounded-xl border border-line bg-white shadow-sm dark:border-lineDark dark:bg-panelDark">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-line bg-paper text-left dark:border-lineDark dark:bg-panelDark">
                <th className="px-4 py-2.5 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Name</th>
                <th className="px-4 py-2.5 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Form</th>
                <th className="px-4 py-2.5 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Size</th>
                <th className="px-4 py-2.5 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Uploaded</th>
                {orgMode && <th className="px-4 py-2.5 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Uploaded by</th>}
                <th className="px-4 py-2.5 text-right font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={f.id} className="border-b border-line transition hover:bg-paper last:border-0 dark:border-lineDark dark:hover:bg-panelDark">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                        f.mimeType.startsWith("image/") ? "bg-signalSoft/20 text-signal" : "bg-paper text-slate-400 dark:bg-panelDark dark:text-mutedDark"
                      }`}>
                        {f.mimeType.startsWith("image/") ? <ImageIcon size={14} /> : <File size={14} />}
                      </span>
                      <span className="max-w-[240px] truncate font-body text-[12.5px] text-ink dark:text-inkDark">{f.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-body text-[12.5px] text-slate-600 dark:text-mutedDark">{formById.get(f.formId)?.title ?? "Deleted form"}</td>
                  <td className="px-4 py-2.5 font-body text-[12px] text-slate-500 dark:text-mutedDark">{formatBytes(f.sizeBytes)}</td>
                  <td className="px-4 py-2.5 font-body text-[12px] text-slate-500 dark:text-mutedDark" title={f.createdAt} suppressHydrationWarning>{formatRelativeDate(f.createdAt)}</td>
                  {orgMode && (
                    <td className="px-4 py-2.5 font-body text-[12px] text-slate-600 dark:text-mutedDark">
                      {uploaderName(f.uploadedBy) ?? <span className="text-slate-400 dark:text-mutedDark">—</span>}
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button type="button" onClick={() => void openPreview(f)} title="Preview or download" className="rounded-md p-1.5 text-slate-500 transition hover:bg-paper hover:text-signal dark:text-mutedDark dark:hover:bg-panelDark">
                        <Eye size={14} />
                      </button>
                      <button type="button" onClick={() => void download(f)} title="Download" className="rounded-md p-1.5 text-slate-500 transition hover:bg-paper hover:text-signal dark:text-mutedDark dark:hover:bg-panelDark">
                        <Download size={14} />
                      </button>
                      <button type="button" onClick={() => setDeleteTarget(f)} title="Delete file" className="rounded-md p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-warn dark:text-mutedDark dark:hover:bg-panelDark">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
{/* Image preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-6 backdrop-blur-sm" onClick={() => setPreview(null)}>
          <div className="max-h-[90%] max-w-3xl rounded-xl border border-line bg-white shadow-2xl dark:border-lineDark dark:bg-panelDark" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2.5">
              <p className="truncate font-body text-[12px] text-ink dark:text-inkDark">{preview.name}</p>
              <button type="button" onClick={() => setPreview(null)} className="rounded-md p-1 text-slate-400 hover:bg-paper dark:hover:bg-panelDark">
                <X size={15} />
              </button>
            </div>
            <img src={preview.url} alt={preview.name} className="max-h-[80vh] w-full rounded-b-xl object-contain" />
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-xl border border-line bg-white p-5 shadow-2xl dark:border-lineDark dark:bg-panelDark" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-base font-semibold text-ink dark:text-inkDark">Delete this file?</h3>
            <p className="mt-2 font-body text-[12.5px] leading-snug text-slate-500 dark:text-mutedDark">
              <b>{deleteTarget.name}</b> ({formatBytes(deleteTarget.sizeBytes)}) will be removed from storage and can&apos;t be recovered.
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
    </div>
  );
}