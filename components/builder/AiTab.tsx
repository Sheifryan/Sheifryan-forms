"use client";

import { useState } from "react";
import {
  Sparkles,
  Loader2,
  Wand2,
  AlertTriangle,
  Check,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import type { CritiqueResult } from "@/lib/ai/contracts";
import { FIELD_LABELS, type FormField } from "@/lib/schema";
import { useToast } from "@/components/Toast";

interface AiTabProps {
  formId: string;
  title: string;
  description: string;
  fields: FormField[];
  status: "draft" | "published" | "closed";
  /** Select + jump to a field in the Fields tab. */
  onJumpToField: (id: string) => void;
  /** Replace the canvas fields (autosave then persists). */
  onApplyFields: (fields: FormField[]) => void;
}

type Busy = "review" | "improve" | null;

const SEVERITY_STYLES: Record<string, { chip: string; text: string }> = {
  error: { chip: "bg-rose-50 text-rose-600", text: "text-rose-700" },
  warning: { chip: "bg-amber-50 text-amber-700", text: "text-amber-800" },
  info: { chip: "bg-sky-50 text-sky-700", text: "text-sky-800" },
};

export function AiTab({
  formId,
  title,
  description,
  fields,
  status,
  onJumpToField,
  onApplyFields,
}: AiTabProps) {
  const toast = useToast();
  const [busy, setBusy] = useState<Busy>(null);
  const [critique, setCritique] = useState<CritiqueResult | null>(null);
  const [improved, setImproved] = useState<{ summary: string; fields: FormField[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runCritique() {
    setBusy("review");
    setError(null);
    try {
      const res = await fetch("/api/ai/critique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formId, title, description, schema: { fields } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "The AI review failed — try again.");
      setCritique(data.critique as CritiqueResult);
      setImproved(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The AI review failed — try again.");
    } finally {
      setBusy(null);
    }
  }

  async function runImprove() {
    setBusy("improve");
    setError(null);
    try {
      const res = await fetch("/api/ai/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formId, title, description, schema: { fields } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "The AI couldn't improve the form — try again.");
      setImproved({ summary: data.summary, fields: data.fields as FormField[] });
      setCritique(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The AI couldn't improve the form — try again.");
    } finally {
      setBusy(null);
    }
  }

  function applyImproved() {
    if (!improved) return;
    onApplyFields(improved.fields);
    toast.success("AI version applied", {
      description: "Questions were replaced — review them on the Fields tab before publishing.",
    });
    setImproved(null);
  }

  return (
    <div className="flex-1 overflow-y-auto bg-paper p-8">
      <div className="mx-auto max-w-2xl space-y-4">
        {/* Intro / actions */}
        <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-accent2 text-white">
              <Sparkles size={16} />
            </span>
            <div>
              <h3 className="font-display text-[15px] font-semibold text-ink">AI assistant</h3>
              <p className="font-body text-[11.5px] text-muted">
                Get a UX review of this form, or let AI rewrite it before you publish.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={runCritique}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 font-body text-xs font-semibold text-violet-700 transition hover:bg-violet-100 disabled:opacity-50"
            >
              {busy === "review" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {busy === "review" ? "Reviewing…" : critique ? "Review again" : "Review my form"}
            </button>
            <button
              onClick={runImprove}
              disabled={busy !== null || status === "published"}
              title={
                status === "published"
                  ? "Unpublish the form to let AI rewrite its questions"
                  : "Rewrites the questions based on an AI review (only before submissions exist)"
              }
              className="flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 font-body text-xs font-semibold text-ink transition hover:border-violet-300 disabled:opacity-50"
            >
              {busy === "improve" ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
              {busy === "improve" ? "Improving…" : "Improve my form"}
            </button>
          </div>
          {status === "published" && (
            <p className="mt-3 font-body text-[11.5px] text-muted">
              AI can&rsquo;t rewrite questions while the form is live. Unpublish first (Improve is
              also blocked once submissions exist, to protect your data).
            </p>
          )}
        </div>

        {busy && !critique && !improved && (
          <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50/60 px-5 py-4">
            <Loader2 size={18} className="shrink-0 animate-spin text-violet-600" />
            <div>
              <p className="font-body text-[13px] font-semibold text-violet-800">
                {busy === "improve" ? "Improving your form…" : "Reviewing your form…"}
              </p>
              <p className="font-body text-[11.5px] text-violet-600">
                This usually takes a few seconds — questions stay on this page until you apply changes.
              </p>
            </div>
          </div>
        )}

        {critique && (
          <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="font-display text-[15px] font-semibold text-ink">AI review</h4>
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full font-display text-sm font-bold ${
                  critique.score >= 7
                    ? "bg-emerald-50 text-emerald-600"
                    : critique.score >= 5
                      ? "bg-amber-50 text-amber-700"
                      : "bg-rose-50 text-rose-600"
                }`}
                title={`Score ${critique.score}/10`}
              >
                {critique.score}
              </span>
            </div>
            <p className="mb-4 font-body text-[12.5px] leading-relaxed text-muted">{critique.summary}</p>

            <div className="space-y-2.5">
              {critique.suggestions.map((s, i) => {
                const style = SEVERITY_STYLES[s.severity] ?? SEVERITY_STYLES.info;
                const field = fields.find((f) => f.id === s.fieldId);
                return (
                  <div
                    key={i}
                    className={`rounded-xl border p-3.5 ${
                      s.fieldId ? "cursor-pointer border-line transition hover:border-violet-300 hover:bg-violet-50/40" : "border-line"
                    }`}
                    onClick={() => {
                      if (s.fieldId && fields.some((f) => f.id === s.fieldId)) onJumpToField(s.fieldId);
                    }}
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${style.chip}`}>
                        {s.severity}
                      </span>
                      {field && (
                        <span className="flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 font-body text-[10px] font-medium text-stone-600">
                          {field.label}
                          <ChevronRight size={10} />
                        </span>
                      )}
                    </div>
                    <p className={`font-body text-[12.5px] font-medium ${style.text}`}>{s.message}</p>
                    <p className="mt-1 font-body text-[12px] text-muted">{s.suggestion}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {improved && (
          <div className="rounded-xl border border-violet-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-accent2 text-white">
                  <Wand2 size={13} />
                </span>
                <h4 className="font-display text-[15px] font-semibold text-ink">Improved draft</h4>
              </div>
              <button
                onClick={() => setImproved(null)}
                className="rounded-full border border-line bg-white px-3 py-1.5 font-body text-xs font-semibold text-muted transition hover:text-ink"
              >
                Discard
              </button>
            </div>
            <p className="mb-4 font-body text-[12.5px] leading-relaxed text-muted">{improved.summary}</p>

            <div className="mb-4 space-y-1.5">
              {improved.fields.map((f, i) => (
                <div key={f.id} className="flex items-center gap-3 rounded-lg border border-line bg-paper px-3 py-2">
                  <span className="font-mono text-[10.5px] font-bold text-stone-300">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-body text-[12.5px] font-medium text-ink">
                    {f.label}
                    {f.required && <span className="text-rose-500"> *</span>}
                  </span>
                  {f.options && f.options.length > 0 && (
                    <span className="hidden rounded-full bg-white px-2 py-0.5 font-body text-[10px] text-stone-500 ring-1 ring-line sm:inline">
                      {f.options.length} options
                    </span>
                  )}
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 font-body text-[10px] font-semibold text-stone-400 ring-1 ring-line">
                    {FIELD_LABELS[f.type]}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={applyImproved}
              className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2.5 font-body text-xs font-semibold text-white transition hover:opacity-90"
            >
              <Check size={14} /> Use this version in my form
            </button>
            <p className="mt-2 text-center font-body text-[10.5px] text-muted">
              Applied to the canvas (autosaved). Existing conditional rules may need a quick recheck.
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 font-body text-xs text-rose-700">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              {error}
              {busy === null && (
                <button
                  onClick={() => setError(null)}
                  className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 font-semibold text-rose-700 ring-1 ring-rose-200 transition hover:bg-white"
                >
                  <RotateCcw size={10} /> Dismiss
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
