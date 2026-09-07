"use client";

import {
  AlertTriangle,
  BarChart3,
  Copy,
  Download,
  HelpCircle,
  Inbox,
  Info,
  Loader2,
  Sparkles,
  Table as TableIcon,
} from "lucide-react";
import { useState } from "react";
import type { StructuredAnswer } from "@/lib/ai/analysis/types";
import { useToast } from "@/components/Toast";
import {
  copyVisibleRows,
  downloadVisibleCsv,
  exportFull,
  type ExportSource,
} from "./exportUtils";

export const CHART_COLORS = ["#6D28D9", "#C026D3", "#0D9488", "#F59E0B", "#059669", "#E11D48", "#4F46E5", "#0891B2"];

interface AnswerCardProps {
  answer: StructuredAnswer;
  source: ExportSource | null;
}

export function AnswerCard({ answer, source }: AnswerCardProps) {
  switch (answer.type) {
    case "number":
      return <NumberCard answer={answer} />;
    case "table":
      return <TableCard answer={answer} source={source} />;
    case "chart":
      return <ChartCard answer={answer} source={source} />;
    case "summary":
      return <SummaryCard answer={answer} />;
    case "message":
      return <MessageCard answer={answer} />;
    default:
      return null;
  }
}

function CardHeader({ icon, title, summary }: { icon: React.ReactNode; title: string; summary?: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-line bg-paper/60 px-5 py-4">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-signalSoft/40 text-signal">
        {icon}
      </div>
      <div className="min-w-0">
        <h4 className="font-display text-sm font-semibold text-ink">{title}</h4>
        {summary && <p className="mt-1 font-body text-xs leading-relaxed text-muted">{summary}</p>}
      </div>
    </div>
  );
}

function ExportBar({ source }: { source: ExportSource }) {
  const toast = useToast();
  const [busy, setBusy] = useState<"csv" | "xls" | null>(null);
  const canExport = Boolean(source.query);

  async function run(format: "csv" | "xls") {
    if (busy) return;
    setBusy(format);
    if (!canExport) {
      const base = (source.formTitle || "submissions").toLowerCase().replace(/\s+/g, "-");
      await downloadVisibleCsv(`${base}-analysis.${format === "xls" ? "xls" : "csv"}`, source.columns, source.rows);
      toast.success(`${format.toUpperCase()} downloaded`);
      setBusy(null);
      return;
    }
    const res = await exportFull(source, format);
    if (res.ok) toast.success(`${format.toUpperCase()} downloaded`);
    else toast.error(res.reason ?? "Export failed");
    setBusy(null);
  }

  async function copy() {
    const ok = await copyVisibleRows(source.columns, source.rows);
    if (ok) toast.success("Copied to clipboard");
    else toast.error("Couldn't copy — your browser blocked clipboard access.");
  }

  const btn =
    "flex items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1.5 font-body text-[11px] font-semibold text-ink transition hover:border-muted hover:bg-paper disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper/40 px-5 py-2.5">
      <button className={btn} disabled={busy !== null} onClick={() => void run("csv")}>
        {busy === "csv" ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Export CSV
      </button>
      <button className={btn} disabled={busy !== null} onClick={() => void run("xls")}>
        {busy === "xls" ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Export Excel
      </button>
      <button className={btn} onClick={() => void copy()}>
        <Copy size={12} /> Copy results
      </button>
      {source.truncated && (
        <span className="font-body text-[10.5px] text-muted">Exports include every matching row.</span>
      )}
    </div>
  );
}

function NumberCard({ answer }: { answer: Extract<StructuredAnswer, { type: "number" }> }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      <CardHeader icon={<Sparkles size={15} />} title={answer.title} summary={answer.summary} />
      <div className="flex items-baseline gap-2 px-5 py-6">
        <span className="font-display text-4xl font-bold text-signal">{answer.value.toLocaleString("en-US")}</span>
        {answer.unit && (
          <span className="font-body text-xs font-semibold uppercase tracking-wide text-muted">{answer.unit}</span>
        )}
      </div>
    </div>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  if (rows.length === 0 || columns.length === 0) {
    return <p className="px-5 py-6 font-body text-xs text-muted">No rows.</p>;
  }
  return (
    <div className="max-h-[360px] overflow-auto">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 border-b border-line bg-paper">
          <tr>
            {columns.map((c, i) => (
              <th key={i} className="whitespace-nowrap px-5 py-2.5 font-mono text-[10.5px] font-bold uppercase tracking-wide text-muted">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, ri) => (
            <tr key={ri} className="hover:bg-paper/50">
              {r.map((cell, ci) => (
                <td key={ci} className="max-w-[300px] truncate px-5 py-2.5 align-top font-body text-xs text-ink">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableCard({
  answer,
  source,
}: {
  answer: Extract<StructuredAnswer, { type: "table" }>;
  source: ExportSource | null;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      <CardHeader icon={<TableIcon size={15} />} title={answer.title} summary={answer.summary} />
      {source && <ExportBar source={source} />}
      <DataTable columns={answer.columns} rows={answer.rows} />
      {answer.note && <p className="border-t border-line px-5 py-3 font-body text-[11px] text-muted">{answer.note}</p>}
    </div>
  );
}

function ChartCard({
  answer,
  source,
}: {
  answer: Extract<StructuredAnswer, { type: "chart" }>;
  source: ExportSource | null;
}) {
  const max = Math.max(1, ...answer.values);
  const total = answer.values.reduce((a, b) => a + b, 0);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      <CardHeader icon={<BarChart3 size={15} />} title={answer.title} summary={answer.summary} />
      {source && <ExportBar source={source} />}
      <div className="px-5 py-5">
        {answer.chartType === "pie" ? (
          <div className="flex flex-wrap items-center gap-6">
            <Donut values={answer.values} />
            <Legend labels={answer.labels} values={answer.values} total={total} />
          </div>
        ) : (
          <BarChart labels={answer.labels} values={answer.values} max={max} />
        )}
        {total > 0 && (
          <p className="mt-3 font-body text-[11px] text-muted">
            {total.toLocaleString("en-US")} submission{total === 1 ? "" : "s"} in total.
          </p>
        )}
      </div>
    </div>
  );
}

function BarChart({ labels, values, max }: { labels: string[]; values: number[]; max: number }) {
  return (
    <div className="flex h-48 items-end gap-3 px-1">
      {values.map((v, i) => (
        <div key={i} className="flex h-full flex-1 flex-col justify-end text-center">
          <span className="mb-1 font-mono text-[10.5px] font-semibold text-ink">{v}</span>
          <div
            className="w-full rounded-t-md transition-all"
            style={{ height: `${Math.max(4, (v / max) * 120)}px`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
            title={`${labels[i]}: ${v}`}
          />
          <span className="mt-1.5 block truncate font-mono text-[10px] text-muted" title={labels[i]}>
            {labels[i]}
          </span>
        </div>
      ))}
    </div>
  );
}

function Donut({ values }: { values: number[] }) {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return <p className="font-body text-xs text-muted">No data.</p>;
  let acc = 0;
  const stops: string[] = [];
  values.forEach((v, i) => {
    const start = (acc / total) * 360;
    acc += v;
    const end = (acc / total) * 360;
    stops.push(`${CHART_COLORS[i % CHART_COLORS.length]} ${start}deg ${end}deg`);
  });
  return (
    <div
      className="relative h-36 w-36 shrink-0 rounded-full"
      style={{ background: `conic-gradient(${stops.join(", ")})` }}
      aria-label="Chart of counts by category"
    >
      <div className="absolute inset-4 flex items-center justify-center rounded-full bg-white">
        <div className="text-center">
          <p className="font-display text-xl font-bold text-ink">{total}</p>
          <p className="font-mono text-[9px] uppercase tracking-wide text-muted">total</p>
        </div>
      </div>
    </div>
  );
}

function Legend({ labels, values, total }: { labels: string[]; values: number[]; total: number }) {
  return (
    <ul className="min-w-0 flex-1 space-y-1.5">
      {labels.map((label, i) => {
        const pct = total ? Math.round((values[i] / total) * 100) : 0;
        return (
          <li key={i} className="flex items-center gap-2 font-body text-[11.5px] text-stone-700">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <span className="font-mono text-[10.5px] text-muted">{pct}%</span>
          </li>
        );
      })}
    </ul>
  );
}

function SummaryCard({ answer }: { answer: Extract<StructuredAnswer, { type: "summary" }> }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      <CardHeader icon={<Sparkles size={15} />} title={answer.title} summary={answer.summary} />
      <ul className="divide-y divide-line">
        {answer.items.map((item, i) => (
          <li key={i} className="flex items-start gap-4 px-5 py-3">
            <span className="w-44 shrink-0 font-body text-xs font-semibold text-ink">{item.label}</span>
            <span className="flex-1 font-body text-xs leading-relaxed text-stone-600">{item.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MessageCard({ answer }: { answer: Extract<StructuredAnswer, { type: "message" }> }) {
  const Icon =
    answer.kind === "error"
      ? AlertTriangle
      : answer.kind === "clarify"
        ? HelpCircle
        : answer.kind === "empty"
          ? Inbox
          : Info;
  const iconColor = answer.kind === "error" ? "text-warn" : answer.kind === "clarify" ? "text-signal" : "text-muted";
  const leftBorder =
    answer.kind === "error"
      ? "border-l-warn bg-rose-50/50"
      : answer.kind === "clarify"
        ? "border-l-signal bg-violet-50/40"
        : "border-l-stone-300 bg-white";
  return (
    <div className={`flex items-start gap-3 rounded-xl border border-line border-l-4 px-5 py-4 shadow-sm ${leftBorder}`}>
      <Icon size={17} className={`mt-0.5 shrink-0 ${iconColor}`} />
      <div className="min-w-0">
        <p className="font-body text-[13px] font-semibold text-ink">{answer.title}</p>
        <p className="mt-1 whitespace-pre-wrap font-body text-xs leading-relaxed text-stone-600">{answer.message}</p>
        {answer.suggestions && answer.suggestions.length > 0 && (
          <p className="mt-2 font-body text-[11px] text-muted">Try: {answer.suggestions.join(" · ")}</p>
        )}
      </div>
    </div>
  );
}

