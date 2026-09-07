"use client";

import { useEffect, useRef, useState } from "react";
import { Brain, Loader2, RotateCcw, Send, Sparkles } from "lucide-react";
import type { NormalizedAskQuery, StructuredAnswer } from "@/lib/ai/analysis/types";
import { AnswerCard, MessageCard } from "./AiAnswerCard";
import { useToast } from "@/components/Toast";
import type { ExportSource } from "./exportUtils";

const SUGGESTED_QUESTIONS = [
  "How many people submitted this form?",
  "Show me everyone who plays football.",
  "List all goalkeepers with their phone numbers.",
  "How many people are available on Saturday?",
  "Summarize the responses.",
  "Which applicants meet the requirements?",
  "What are the most common answers?",
  "Show people between 18 and 25.",
];

interface Turn {
  id: string;
  question: string;
  answer?: StructuredAnswer;
  query?: NormalizedAskQuery | null;
  error?: string;
  cached?: boolean;
}

interface AiAnalysisPanelProps {
  formId: string;
  formTitle: string;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `turn-${idCounter}-${Date.now()}`;
}

export function AiAnalysisPanel({ formId, formTitle }: AiAnalysisPanelProps) {
  const toast = useToast();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState<Turn[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread, busy]);

  async function ask(rawQuestion: string) {
    const question = rawQuestion.trim();
    if (!question || busy) return;
    setBusy(true);
    setInput("");
    setThread((t) => [...t, { id: nextId(), question }]);
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formId, question }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "The AI couldn't answer that question. Try again.");
      setThread((t) =>
        t.map((item, i) =>
          i === t.length - 1
            ? { ...item, answer: data.answer as StructuredAnswer, query: (data.query as NormalizedAskQuery) ?? null, cached: Boolean(data.cached) }
            : item
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong — try again.";
      setThread((t) => t.map((item, i) => (i === t.length - 1 ? { ...item, error: message } : item)));
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  function retry(turn: Turn) {
    if (busy) return;
    const q = turn.question;
    setThread((t) => t.filter((x) => x.id !== turn.id));
    void ask(q);
  }

  function exportSourceFor(turn: Turn): ExportSource | null {
    const answer = turn.answer;
    if (!answer) return null;
    if (answer.type === "table") {
      return {
        formId,
        formTitle,
        question: turn.question,
        query: turn.query ?? null,
        columns: answer.columns,
        rows: answer.rows,
        truncated: answer.truncated,
      };
    }
    if (answer.type === "chart") {
      return {
        formId,
        formTitle,
        question: turn.question,
        query: turn.query ?? null,
        columns: answer.columns,
        rows: answer.rows,
        truncated: false,
      };
    }
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl">
      {thread.length === 0 ? (
        <div className="rounded-xl border border-line bg-white px-6 py-8 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white">
            <Brain size={20} />
          </div>
          <h3 className="font-display text-base font-semibold text-ink">Ask your data</h3>
          <p className="mx-auto mt-1.5 max-w-md font-body text-xs leading-relaxed text-muted">
            Ask natural-language questions about the submissions on this form. It reads the real responses
            and answers with counts, tables and charts.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {thread.map((turn) => (
            <div key={turn.id} className="space-y-2">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-signal px-4 py-2.5 font-body text-[13px] font-medium text-white">
                  {turn.question}
                </div>
              </div>
              {turn.error ? (
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <MessageCard
                      answer={{ type: "message", kind: "error", title: "Something went wrong", message: turn.error }}
                    />
                  </div>
                  <button
                    onClick={() => retry(turn)}
                    className="mt-1 flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1.5 font-body text-[11px] font-semibold text-ink transition hover:bg-paper"
                    title="Try again"
                  >
                    <RotateCcw size={12} /> Retry
                  </button>
                </div>
              ) : turn.answer ? (
                <AnswerCard answer={turn.answer} source={exportSourceFor(turn)} />
              ) : null}
              {turn.cached && (
                <p className="px-1 font-mono text-[10px] text-muted">Cached answer — data unchanged since last ask.</p>
              )}
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2.5 rounded-xl border border-line bg-white px-4 py-3 shadow-sm">
              <Loader2 size={15} className="animate-spin text-signal" />
              <span className="font-body text-xs font-medium text-muted">Thinking about your submissions…</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="mt-5">
        <div className="rounded-xl border border-line bg-white p-3 shadow-sm focus-within:border-signal">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(input);
              }
            }}
            rows={2}
            placeholder="Ask about your submissions… e.g. “Show me everyone who plays football with their contact details.”"
            className="w-full resize-none bg-transparent font-body text-sm text-ink outline-none placeholder:text-muted"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="hidden font-mono text-[10px] text-muted sm:block">Enter to ask · Shift+Enter for a new line</span>
            <button
              onClick={() => void ask(input)}
              disabled={busy || input.trim().length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-signal px-4 py-2 font-body text-xs font-semibold text-white transition hover:bg-violet-800 disabled:opacity-40"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {busy ? "Analyzing…" : "Ask"}
            </button>
          </div>
        </div>

        <div className="mt-3.5">
          <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wide text-muted">
            <Sparkles size={11} /> Try asking
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => void ask(q)}
                disabled={busy}
                className="rounded-full border border-line bg-white px-3 py-1.5 font-body text-[11.5px] font-medium text-stone-600 transition hover:border-signalSoft hover:bg-signalSoft/30 hover:text-signal disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
