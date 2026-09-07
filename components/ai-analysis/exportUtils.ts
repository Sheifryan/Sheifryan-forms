"use client";

// Client-side export helpers for AI-analysis tables. CSV / Excel go through the
// server export route (it re-runs the validated query and downloads the FULL
// match set, not just the on-screen rows); "copy" copies the visible rows.

import type { NormalizedAskQuery } from "@/lib/ai/analysis/types";

export interface ExportSource {
  formId: string;
  formTitle: string;
  question: string;
  query: NormalizedAskQuery | null;
  columns: string[];
  rows: string[][];
  /** True when the server limited the result (export route still downloads all). */
  truncated: boolean;
}

function slugify(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "submissions";
}

async function downloadBlob(filename: string, blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Server-side full export: returns { ok, reason? }. */
export async function exportFull(
  source: ExportSource,
  format: "csv" | "xls"
): Promise<{ ok: boolean; reason?: string }> {
  if (!source.query) return { ok: false, reason: "Nothing to export for that answer." };
  try {
    const res = await fetch("/api/ai/ask/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        formId: source.formId,
        question: source.question,
        query: source.query,
        format,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, reason: data.error ?? "Export failed — try again." };
    }
    const blob = await res.blob();
    const ext = format === "xls" ? "xls" : "csv";
    const type = format === "xls" ? "application/vnd.ms-excel" : "text/csv;charset=utf-8";
    await downloadBlob(`${slugify(source.formTitle)}-analysis.${ext}`, new Blob([blob], { type }));
    return { ok: true };
  } catch {
    return { ok: false, reason: "Export failed — check your connection and try again." };
  }
}

function escapeCell(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/** Copy visible rows as tab-separated text so it pastes cleanly into sheets. */
export async function copyVisibleRows(columns: string[], rows: string[][]): Promise<boolean> {
  const text = [columns.join("\t"), ...rows.map((r) => r.map((c) => c ?? "").join("\t"))].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Legacy fallback for non-secure contexts.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Download the visible rows as CSV (used when the answer has no server query). */
export async function downloadVisibleCsv(filename: string, columns: string[], rows: string[][]): Promise<void> {
  const csv = `\uFEFF${[columns, ...rows].map((r) => r.map(escapeCell).join(",")).join("\r\n")}\r\n`;
  await downloadBlob(filename, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}
