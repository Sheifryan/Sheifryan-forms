"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, X, Wand2, RotateCcw, ArrowRight, Star, Upload, FileText, Trash2, Image as ImageIcon } from "lucide-react";
import type { FormDraft } from "@/lib/ai/contracts";
import type { FormField } from "@/lib/schema";
import { useToast } from "@/components/Toast";

const EXAMPLES = [
  "Campus hackathon registration — name, email, university, dietary needs and a 'how did you hear' dropdown",
  "Customer feedback for a coffee shop — rating, favourite drink and what we could do better",
  "Job application — name, email, years of experience, portfolio link and a short cover letter",
];

/** Keep in step with MAX_FILES / MAX_IMAGES on the server. */
const MAX_PAGES = 6;
/** Long edge for uploaded photos; enough to read print, far smaller to send. */
const MAX_EDGE = 1600;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

/**
 * Shrink photos in the browser before uploading.
 *
 * A phone photo is several megabytes — slow to send and close to the request
 * limit — while ~1600px on the long edge is still plenty for reading printed
 * text. Drawing through a canvas also re-encodes to JPEG, which converts HEIC
 * and other formats the server would otherwise have to reject, and drops EXIF
 * metadata along the way.
 */
async function prepareForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (typeof bitmap.close === "function") bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") || "page";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  } catch {
    // A browser that can't decode the format (e.g. HEIC outside Safari): let the
    // server decide and explain.
    return file;
  }
}

export function AiFormModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<"idle" | "loading" | "preview">("idle");
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"describe" | "upload">("describe");
  const [files, setFiles] = useState<File[]>([]);
  const [hint, setHint] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    setFiles((current) => (current.length >= MAX_PAGES ? current : [...current, ...incoming].slice(0, MAX_PAGES)));
    setError(null);
  }

  async function importForm() {
    if (files.length === 0) {
      setError("Choose a file to import first — a photo, PDF or Word document.");
      return;
    }
    setError(null);
    setPhase("loading");
    try {
      const body = new FormData();
      for (const file of files) body.append("files", await prepareForUpload(file));
      if (hint.trim()) body.append("hint", hint.trim());

      const res = await fetch("/api/ai/import-form", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "The AI couldn't read that form — try again.");
      setDraft(data as FormDraft);
      setWarnings(Array.isArray(data.warnings) ? (data.warnings as string[]) : []);
      setPhase("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The AI couldn't read that form — try again.");
      setPhase("idle");
    }
  }

  async function generate() {
    const trimmed = prompt.trim();
    if (trimmed.length < 5) {
      setError("Describe the form you want in a sentence or two first.");
      return;
    }
    setError(null);
    setPhase("loading");
    try {
      const res = await fetch("/api/ai/generate-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "The AI couldn't build a form — try again.");
      setDraft(data as FormDraft);
      setPhase("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The AI couldn't build a form — try again.");
      setPhase("idle");
    }
  }

  async function openInBuilder() {
    if (!draft) return;
    setBusy(true);
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          description: draft.description,
          confirmationMessage: draft.confirmationMessage,
          fields: draft.fields,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) throw new Error(data.error ?? "Couldn't create the form.");
      toast.success("Form created", { description: `"${draft.title}" is ready to build.` });
      router.push(`/builder/${data.id}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the form.");
      setBusy(false);
    }
  }

  const canGenerate =
    phase === "loading" || (mode === "upload" ? files.length === 0 : prompt.trim().length < 5);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-accent2 text-white">
              <Sparkles size={15} />
            </span>
            <div>
              <h3 className="font-display text-base font-semibold text-ink">Create a form with AI</h3>
              <p className="font-body text-[11.5px] text-muted">
                Describe a form, or upload a photo, PDF or Word document of one you already have.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted transition hover:bg-paper hover:text-ink"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-6">
          {phase === "loading" && (
            <div className="flex flex-col items-center py-14 text-center">
              <Loader2 size={26} className="mb-3 animate-spin text-violet-600" />
              <p className="mb-1 font-body text-sm font-semibold text-ink">
                {mode === "upload" ? "Reading your form…" : "Designing your form…"}
              </p>
              <p className="max-w-xs font-body text-xs text-muted">
                {mode === "upload"
                  ? "Picking out each question and its printed options so you can edit the result."
                  : "Choosing the right questions and writing clean options for your request."}
              </p>
            </div>
          )}

          {phase === "preview" && draft && (
            <>
              {warnings.length > 0 && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 font-body text-[11.5px] text-amber-900">
                  <p className="font-semibold">Read with a few notes</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              <DraftPreview
                draft={draft}
                busy={busy}
                onBack={() => setPhase("idle")}
                onRegenerate={mode === "upload" ? importForm : generate}
                onUse={openInBuilder}
              />
            </>
          )}

          {phase !== "preview" && (
            <div>
              <div className="mb-4 flex items-center gap-1 rounded-lg bg-paper p-1">
                <button
                  onClick={() => setMode("describe")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-body text-xs font-semibold transition ${
                    mode === "describe" ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
                  }`}
                >
                  <Sparkles size={12} /> Describe it
                </button>
                <button
                  onClick={() => setMode("upload")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-body text-xs font-semibold transition ${
                    mode === "upload" ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
                  }`}
                >
                  <Upload size={12} /> Upload a form
                </button>
              </div>

              {mode === "describe" ? (
                <div>
                  <label className="mb-1.5 block font-body text-xs font-semibold text-ink">
                    What kind of form do you need?
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={4}
                    placeholder="e.g. Event registration collecting name, email, number of guests and dietary needs…"
                    className="w-full resize-none rounded-xl border border-line bg-paper p-3.5 font-body text-sm text-ink outline-none transition focus:border-violet-500"
                  />
              <div className="mt-3 space-y-1.5">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setPrompt(ex)}
                    className="block w-full rounded-lg border border-line bg-white px-3 py-2 text-left font-body text-[11.5px] text-muted transition hover:border-violet-300 hover:text-ink"
                  >
                    {ex}
                  </button>
                ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-1.5 block font-body text-xs font-semibold text-ink">
                    Upload the form you want to recreate
                  </label>
                  <label
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragging(false);
                      addFiles(event.dataTransfer.files);
                    }}
                    className={`flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
                      dragging ? "border-violet-500 bg-violet-50" : "border-line bg-paper hover:border-violet-300"
                    }`}
                  >
                    <Upload size={20} className="mb-2 text-violet-500" />
                    <span className="font-body text-xs font-semibold text-ink">Choose files or drop them here</span>
                    <span className="mt-1 font-body text-[11px] text-muted">
                      Photo or scan (PNG/JPG), PDF or Word (.docx) · up to {MAX_PAGES} files, 6 MB each
                    </span>
                    <input
                      type="file"
                      multiple
                      accept="image/*,application/pdf,.docx,.txt,.csv,.md"
                      className="hidden"
                      onChange={(event) => {
                        addFiles(event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </label>

                  {files.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {files.map((file, index) => (
                        <li
                          key={`${file.name}-${index}`}
                          className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2"
                        >
                          {file.type.startsWith("image/") ? (
                            <ImageIcon size={13} className="shrink-0 text-violet-500" />
                          ) : (
                            <FileText size={13} className="shrink-0 text-violet-500" />
                          )}
                          <span className="min-w-0 flex-1 truncate font-body text-[12px] text-ink">{file.name}</span>
                          <span className="shrink-0 font-mono text-[10px] text-muted">{formatSize(file.size)}</span>
                          <button
                            onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                            className="shrink-0 rounded p-1 text-muted transition hover:text-rose-600"
                            aria-label={`Remove ${file.name}`}
                          >
                            <Trash2 size={12} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <input
                    value={hint}
                    onChange={(event) => setHint(event.target.value)}
                    placeholder="Optional: anything the reader should know (e.g. keep the Ugandan phone format)"
                    className="mt-3 w-full rounded-lg border border-line bg-white px-3 py-2 font-body text-[12px] text-ink outline-none transition focus:border-violet-500"
                  />
                  <p className="mt-2 font-body text-[10.5px] leading-relaxed text-muted">
                    The file is sent to your AI provider to be read, and is never stored on our side.
                  </p>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 font-body text-xs text-rose-700">
              {error}
            </div>
          )}

          {phase !== "preview" && (
            <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
              <button
                onClick={onClose}
                className="rounded-full border border-line bg-white px-4 py-2 font-body text-xs font-semibold text-muted transition hover:text-ink"
              >
                Cancel
              </button>
              <button
                onClick={mode === "upload" ? importForm : generate}
                disabled={canGenerate}
                className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-600 to-accent2 px-5 py-2 font-body text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {phase === "loading" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : mode === "upload" ? (
                  <Upload size={13} />
                ) : (
                  <Wand2 size={13} />
                )}
                {phase === "loading"
                  ? mode === "upload"
                    ? "Reading…"
                    : "Designing…"
                  : mode === "upload"
                    ? "Read the form"
                    : "Generate form"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftPreview({
  draft,
  busy,
  onBack,
  onRegenerate,
  onUse,
}: {
  draft: FormDraft;
  busy: boolean;
  onBack: () => void;
  onRegenerate: () => void;
  onUse: () => void;
}) {
  const realFields = draft.fields.filter((f) => f.type !== "page_break");
  return (
    <div>
      <div className="mb-4">
        <h4 className="font-display text-lg font-semibold text-ink">{draft.title}</h4>
        {draft.description && <p className="mt-0.5 font-body text-xs text-muted">{draft.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-body text-[10.5px] font-semibold text-success">
            {realFields.length} questions
          </span>
          <span className="rounded-full bg-stone-100 px-2.5 py-0.5 font-body text-[10.5px] font-medium text-stone-500">
            Confirmation: {draft.confirmationMessage}
          </span>
        </div>
      </div>

      <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wide text-muted">
        Preview — how respondents will see it
      </p>
      <div className="rounded-xl border border-line bg-paper p-4">
        <div className="space-y-5">
          {draft.fields.map((f) => (
            <QuestionPreview key={f.id} field={f} />
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-2 border-t border-line pt-4">
        <div className="flex gap-2">
          <button
            onClick={onBack}
            disabled={busy}
            className="rounded-full border border-line bg-white px-4 py-2 font-body text-xs font-semibold text-muted transition hover:text-ink disabled:opacity-50"
          >
            ← Edit prompt
          </button>
          <button
            onClick={onRegenerate}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 font-body text-xs font-semibold text-violet-700 transition hover:bg-violet-100 disabled:opacity-50"
          >
            <RotateCcw size={12} /> Try again
          </button>
        </div>
        <button
          onClick={onUse}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-full bg-[var(--accent,#6D28D9)] px-5 py-2 font-body text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
          {busy ? "Creating…" : "Open in builder"}
        </button>
      </div>
    </div>
  );
}

function QuestionPreview({ field }: { field: FormField }) {
  return (
    <div>
      <label className="mb-1 block font-body text-[13px] font-medium text-ink">
        {field.label}
        {field.required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {field.helpText && <p className="mb-1.5 font-body text-[11px] text-muted">{field.helpText}</p>}
      <FieldControl field={field} />
    </div>
  );
}

const PREVIEW_INPUT =
  "w-full rounded-lg border border-line bg-white px-3 py-2 font-body text-[13px] text-stone-500 outline-none";

const PLACEHOLDER_HINTS: Partial<Record<FormField["type"], string>> = {
  short_text: "Your answer",
  email: "name@example.com",
  phone: "e.g. +2567…",
  number: "0",
  url: "https://…",
};

function FieldControl({ field }: { field: FormField }) {
  switch (field.type) {
    case "long_text":
      return (
        <textarea
          disabled
          rows={3}
          placeholder={field.placeholder ?? "Long answer text"}
          className={`${PREVIEW_INPUT} resize-none`}
        />
      );
    case "single_select":
    case "multi_select":
      return (
        <div className="space-y-1.5">
          {(field.options ?? []).map((o) => (
            <label
              key={o.id}
              className="flex items-center gap-2 font-body text-[12.5px] text-stone-600"
            >
              <input
                type={field.type === "multi_select" ? "checkbox" : "radio"}
                disabled
                className="h-3.5 w-3.5 accent-violet-600"
              />
              {o.label}
            </label>
          ))}
        </div>
      );
    case "dropdown":
      return (
        <select disabled defaultValue="" className={`${PREVIEW_INPUT} text-stone-400`}>
          <option value="" disabled>
            Select an option…
          </option>
          {(field.options ?? []).map((o) => (
            <option key={o.id}>{o.label}</option>
          ))}
        </select>
      );
    case "rating":
      return (
        <div className="flex gap-1 text-amber-400">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} size={18} fill="currentColor" strokeWidth={1.2} />
          ))}
        </div>
      );
    case "checkbox":
      return (
        <label className="flex items-start gap-2 font-body text-[12.5px] text-stone-700">
          <input type="checkbox" disabled className="mt-0.5 h-3.5 w-3.5 accent-violet-600" />
          {field.placeholder ?? field.label}
        </label>
      );
    case "date":
      return <input disabled type="date" className={PREVIEW_INPUT} />;
    case "time":
      return <input disabled type="time" className={PREVIEW_INPUT} />;
    case "file":
      return (
        <div className="rounded-lg border border-dashed border-line bg-white px-3 py-4 text-center font-body text-[11px] text-stone-400">
          File upload will appear here
        </div>
      );
    default:
      return (
        <input
          disabled
          type={field.type === "number" ? "number" : "text"}
          placeholder={field.placeholder ?? PLACEHOLDER_HINTS[field.type] ?? "Your answer"}
          className={PREVIEW_INPUT}
        />
      );
  }
}

