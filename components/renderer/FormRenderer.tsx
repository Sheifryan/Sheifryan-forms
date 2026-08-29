"use client";

import { useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { Star, ArrowLeft, ArrowRight, Paperclip, X, Loader2 } from "lucide-react";
import type { FormField, FormSchema, FormSettings, UploadedFileRef } from "@/lib/schema";
import { isFieldVisible, splitIntoPages, defaultFileConfig, fileMatchesAccept, formatBytes } from "@/lib/schema";

interface SubmitResult {
  ok: boolean;
  fieldErrors?: Record<string, string>;
  confirmationMessage?: string;
  error?: string;
}

interface Props {
  schema: FormSchema;
  onSubmit: (answers: Record<string, unknown>) => Promise<SubmitResult>;
  submitLabel?: string;
  settings?: FormSettings;
  /** Endpoint the file upload field posts to. Omitted in preview mode. */
  uploadUrl?: string;
}

export function FormRenderer({ schema, onSubmit, submitLabel = "Submit", settings, uploadUrl }: Props) {
  const pages = useMemo(() => splitIntoPages(schema.fields), [schema.fields]);
  const [pageIndex, setPageIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [doneMessage, setDoneMessage] = useState<string | undefined>(settings?.confirmationMessage);
  const [topError, setTopError] = useState<string | null>(null);

  const allDataFields = schema.fields.filter((f) => f.type !== "page_break");
  const currentPage = pages[pageIndex];
  const isLastPage = pageIndex === pages.length - 1;

  function setValue(fieldId: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
    setErrors((prev) => {
      if (!prev[fieldId]) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  }

  function validateClientSide(fields: FormField[]): Record<string, string> {
    // Lightweight client-side pass purely for immediate feedback on
    // Next/Submit — the server re-validates everything regardless.
    const next: Record<string, string> = {};
    fields.forEach((f) => {
      if (f.type === "page_break" || !isFieldVisible(f, answers)) return;
      const v = answers[f.id];
      const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
      if (f.required && empty) next[f.id] = "This field is required";
      if (f.type === "email" && answers[f.id] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(answers[f.id])))
        next[f.id] = "Enter a valid email address";
    });
    return next;
  }

  function handleNext() {
    const next = validateClientSide(currentPage.fields);
    if (Object.keys(next).length > 0) return setErrors(next);
    setPageIndex((p) => p + 1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clientErrors = validateClientSide(currentPage.fields);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }
    setStatus("submitting");
    setTopError(null);
    const result = await onSubmit(answers);
    if (result.ok) {
      if (result.confirmationMessage) setDoneMessage(result.confirmationMessage);
      setStatus("done");
    } else {
      setErrors(result.fieldErrors ?? {});
      setTopError(result.error ?? null);
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-lg border border-line bg-panel p-10 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_15%,white)] text-[var(--accent)]">
          ✓
        </div>
        <p className="font-display text-lg text-ink">{doneMessage ?? "Response recorded"}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Honeypot — hidden from real users, catches naive bots */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
        onChange={(e) => setValue("company", e.target.value)}
      />

      {pages.length > 1 && (
        <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-muted">
          Page {pageIndex + 1} of {pages.length}
          {currentPage.title ? ` — ${currentPage.title}` : ""}
        </p>
      )}

      {topError && <p className="rounded-md bg-rose-50 px-3 py-2 font-body text-sm text-warn">{topError}</p>}

      {currentPage.fields.map((field) =>
        isFieldVisible(field, answers) ? (
          <FieldInput
            key={field.id}
            field={field}
            value={answers[field.id]}
            error={errors[field.id]}
            onChange={(v) => setValue(field.id, v)}
            uploadUrl={uploadUrl}
          />
        ) : null
      )}

      <div className="flex items-center gap-2 pt-1">
        {pageIndex > 0 && (
          <button
            type="button"
            onClick={() => setPageIndex((p) => p - 1)}
            className="flex items-center gap-1 rounded-md border border-line px-4 py-2.5 font-body text-sm font-medium text-ink transition hover:bg-paper"
          >
            <ArrowLeft size={14} /> Back
          </button>
        )}
        {isLastPage ? (
          <button
            type="submit"
            disabled={status === "submitting"}
            className="flex-1 rounded bg-[var(--accent)] px-5 py-2.5 font-body text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {status === "submitting" ? "Submitting…" : submitLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            className="flex flex-1 items-center justify-center gap-1 rounded bg-[var(--accent)] px-5 py-2.5 font-body text-sm font-medium text-white transition hover:opacity-90"
          >
            Next <ArrowRight size={14} />
          </button>
        )}
      </div>
    </form>
  );
}

function FieldInput({
  field,
  value,
  error,
  onChange,
  uploadUrl,
}: {
  field: FormField;
  value: unknown;
  error?: string;
  onChange: (v: unknown) => void;
  uploadUrl?: string;
}) {
  const baseInput =
    "w-full rounded border border-line bg-white px-3 py-2 font-body text-sm text-ink outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]";

  return (
    <div>
      <label className="mb-1.5 block font-body text-sm font-medium text-ink">
        {field.label}
        {field.required && <span className="text-warn"> *</span>}
      </label>
      {field.helpText && <p className="mb-1.5 font-body text-xs text-muted">{field.helpText}</p>}

      {field.type === "short_text" && (
        <input
          type="text"
          className={baseInput}
          placeholder={field.placeholder}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.type === "long_text" && (
        <textarea
          rows={4}
          className={baseInput}
          placeholder={field.placeholder}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.type === "email" && (
        <input
          type="email"
          className={baseInput}
          placeholder={field.placeholder ?? "you@example.com"}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.type === "phone" && (
        <input
          type="tel"
          className={baseInput}
          placeholder={field.placeholder ?? "(555) 123-4567"}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.type === "url" && (
        <input
          type="url"
          className={baseInput}
          placeholder={field.placeholder ?? "https://"}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.type === "number" && (
        <input
          type="number"
          className={baseInput}
          placeholder={field.placeholder}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.type === "date" && (
        <input
          type="date"
          className={baseInput}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.type === "time" && (
        <input
          type="time"
          className={baseInput}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.type === "rating" && (
        <div className="flex items-center gap-1 text-[var(--accent)]">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => onChange(n)}>
              <Star size={22} fill={n <= Number(value ?? 0) ? "currentColor" : "none"} strokeWidth={1.5} />
            </button>
          ))}
        </div>
      )}
      {field.type === "checkbox" && (
        <label className="flex items-center gap-2 font-body text-sm text-ink">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-line accent-[var(--accent)]"
          />
          {field.placeholder ?? "Yes"}
        </label>
      )}
      {field.type === "single_select" && (
        <div className="space-y-2">
          {(field.options ?? []).map((opt) => (
            <label key={opt.id} className="flex items-center gap-2 font-body text-sm text-ink">
              <input
                type="radio"
                name={field.id}
                checked={value === opt.id}
                onChange={() => onChange(opt.id)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
      {field.type === "dropdown" && (
        <select className={baseInput} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
      {field.type === "multi_select" && (
        <div className="space-y-2">
          {(field.options ?? []).map((opt) => {
            const arr = Array.isArray(value) ? (value as string[]) : [];
            const checked = arr.includes(opt.id);
            return (
              <label key={opt.id} className="flex items-center gap-2 font-body text-sm text-ink">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    if (e.target.checked) onChange([...arr, opt.id]);
                    else onChange(arr.filter((id) => id !== opt.id));
                  }}
                  className="h-4 w-4 rounded border-line accent-[var(--accent)]"
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      )}
      {field.type === "file" && (
        <FileUploadInput field={field} value={value} error={error} onChange={onChange} uploadUrl={uploadUrl} />
      )}

      {error && field.type !== "file" && <p className="mt-1 font-body text-xs text-warn">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------- File upload */

function FileUploadInput({
  field,
  value,
  error,
  onChange,
  uploadUrl,
}: {
  field: FormField;
  value: unknown;
  error?: string;
  onChange: (v: unknown) => void;
  uploadUrl?: string;
}) {
  const cfg = field.fileConfig ?? defaultFileConfig();
  const refs = Array.isArray(value) ? (value as UploadedFileRef[]) : [];
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sessionRef = useRef(nanoid(12));
  const [uploading, setUploading] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const maxReached = cfg.maxFiles > 0 && refs.length >= cfg.maxFiles;

  async function handleFiles(selected: FileList | null) {
    if (!selected || selected.length === 0) return;
    setUploadError(null);

    const remaining = Math.max(0, cfg.maxFiles - refs.length);
    if (remaining === 0 || cfg.maxFiles === 0) {
      setUploadError(`You can attach at most ${cfg.maxFiles} file${cfg.maxFiles === 1 ? "" : "s"}.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const toUpload = Array.from(selected).slice(0, remaining);
    const maxBytes = cfg.maxSizeMb * 1024 * 1024;

    // Client-side pre-checks (the server re-validates everything anyway).
    for (const f of toUpload) {
      if (!fileMatchesAccept(cfg.accept, f.type, f.name)) {
        setUploadError(`${f.name} isn't an allowed file type on this form.`);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      if (f.size > maxBytes) {
        setUploadError(`${f.name} is larger than the ${cfg.maxSizeMb} MB limit.`);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
    }

    // Preview mode (no upload endpoint wired up) — remember the selection
    // locally so the preview and client-side validation behave like live.
    if (!uploadUrl) {
      const local = toUpload.map((f) => ({
        id: `local-${nanoid(8)}`,
        name: f.name,
        mimeType: f.type || "application/octet-stream",
        sizeBytes: f.size,
      }));
      onChange([...refs, ...local]);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading((prev) => [...prev, ...toUpload.map((f) => f.name)]);
    const added: UploadedFileRef[] = [];
    for (const f of toUpload) {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("fieldId", field.id);
      fd.append("session", sessionRef.current);
      try {
        const res = await fetch(uploadUrl, { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setUploadError(data.error ?? `Couldn't upload ${f.name}.`);
          break;
        }
        added.push(data as UploadedFileRef);
      } catch {
        setUploadError(`Couldn't upload ${f.name}. Check your connection and try again.`);
        break;
      }
    }
    setUploading([]);
    if (added.length > 0) onChange([...refs, ...added]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeRef(ref: UploadedFileRef) {
    onChange(refs.filter((r) => r.id !== ref.id));
    if (!uploadUrl || ref.id.startsWith("local-")) return;
    // Best-effort cleanup of the still-pending stored object.
    fetch(uploadUrl, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ref.id, session: sessionRef.current }),
    }).catch(() => {});
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple={cfg.maxFiles !== 1}
        accept={cfg.accept.filter(Boolean).join(",") || undefined}
        disabled={maxReached}
        onChange={(e) => handleFiles(e.target.files)}
        className="font-body text-sm text-muted file:mr-3 file:rounded file:border-0 file:bg-[var(--accent)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white file:cursor-pointer"
      />

      {uploading.length > 0 && (
        <p className="mt-2 flex items-center gap-1.5 font-body text-xs text-muted">
          <Loader2 size={12} className="animate-spin" /> Uploading {uploading.join(", ")}…
        </p>
      )}

      {refs.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {refs.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-md border border-line bg-paper px-2.5 py-1.5">
              <Paperclip size={12} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate font-body text-xs text-ink">{r.name}</span>
              <span className="shrink-0 font-body text-[10.5px] text-muted">{formatBytes(r.sizeBytes)}</span>
              <button
                type="button"
                onClick={() => removeRef(r)}
                className="shrink-0 rounded p-0.5 text-muted hover:bg-white hover:text-warn"
                aria-label={`Remove ${r.name}`}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {maxReached && (
        <p className="mt-1.5 font-body text-[10.5px] text-muted">
          You&rsquo;ve attached {refs.length} of {cfg.maxFiles} allowed file{cfg.maxFiles === 1 ? "" : "s"}.
        </p>
      )}

      {uploadError && <p className="mt-1 font-body text-xs text-warn">{uploadError}</p>}
      {error && <p className="mt-1 font-body text-xs text-warn">{error}</p>}
    </div>
  );
}
