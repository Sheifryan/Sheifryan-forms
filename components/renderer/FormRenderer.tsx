"use client";

import { useMemo, useState } from "react";
import { Star, ArrowLeft, ArrowRight } from "lucide-react";
import type { FormField, FormSchema, FormSettings } from "@/lib/schema";
import { isFieldVisible, splitIntoPages } from "@/lib/schema";

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
}

export function FormRenderer({ schema, onSubmit, submitLabel = "Submit", settings }: Props) {
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
      if (f.required && (answers[f.id] === undefined || answers[f.id] === "")) next[f.id] = "This field is required";
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
}: {
  field: FormField;
  value: unknown;
  error?: string;
  onChange: (v: unknown) => void;
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
        <input
          type="file"
          className="font-body text-sm text-muted"
          onChange={(e) => onChange(e.target.files?.[0]?.name ?? "")}
        />
      )}

      {error && <p className="mt-1 font-body text-xs text-warn">{error}</p>}
    </div>
  );
}
