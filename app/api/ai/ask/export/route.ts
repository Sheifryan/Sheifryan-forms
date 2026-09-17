// POST /api/ai/ask/export — server-side export of an already-validated ask
// query. Re-runs the exact query (no AI call — the normalized query came back
// from /api/ai/ask) with a higher row cap and streams CSV or Excel bytes, so
// exporting a truncated on-screen table still downloads the full match set.

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { executeQuery } from "@/lib/ai/analysis/execute";
import { canAnalyseForm } from "@/lib/ai/analysis/access";
import { createSupabaseResponsesSource } from "@/lib/ai/analysis/source";
import type { FormField, FormSchema } from "@/lib/schema";
import type { NormalizedAskQuery } from "@/lib/ai/analysis/types";

export const runtime = "nodejs";

const EXPORT_LIMIT = 5000;

const exportQuerySchema = z
  .object({
    operation: z.enum(["list", "group", "compare", "count", "aggregate"]),
    select: z.array(z.string()).max(8).default([]),
    conditions: z
      .array(
        z.object({
          fieldId: z.string().min(1).max(200),
          operator: z.string().min(1).max(40),
          value: z.union([z.string().max(500), z.number()]).optional(),
          value2: z.union([z.string().max(500), z.number()]).optional(),
          values: z.array(z.union([z.string().max(500), z.number()])).optional(),
        })
      )
      .max(8)
      .default([]),
    sort: z.array(z.object({ fieldId: z.string().max(200), direction: z.enum(["asc", "desc"]) })).max(3).default([]),
    limit: z.number().int().min(1).max(200).default(100),
    groupBy: z.string().max(200).optional(),
    compareBy: z.string().max(200).optional(),
  })
  .passthrough();

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const formId = typeof body?.formId === "string" ? body.formId : "";
  const format = body?.format === "xls" ? "xls" : "csv";
  if (!formId) return NextResponse.json({ error: "Missing form id" }, { status: 400 });

  const parsed = exportQuerySchema.safeParse(body?.query);
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  const rawQuery = parsed.data as NormalizedAskQuery;

  // Ownership gate: exporting re-runs a validated query over the same rows, so
  // it needs the same permission check as /api/ai/ask.
  const { data: form } = await supabase
    .from("forms")
    .select("id, owner_id, workspace_id, title, schema")
    .eq("id", formId)
    .single();
  if (!form || !(await canAnalyseForm(supabase, form, user.id))) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  const fields = ((form.schema as FormSchema | null)?.fields ?? []) as FormField[];

  try {
    const query: NormalizedAskQuery = {
      ...rawQuery,
      limit: EXPORT_LIMIT, // export downloads the full match set
    };
    const outcome = await executeQuery(fields, query, createSupabaseResponsesSource(supabase, formId));
    const answer = outcome.answer;

    let columns: string[];
    let rows: string[][];
    if (answer.type === "table") {
      columns = answer.columns;
      rows = answer.rows;
      if (answer.truncated) {
        // Shouldn't happen at EXPORT_LIMIT unless the dataset is enormous.
        rows = rows.slice(0, EXPORT_LIMIT);
      }
    } else if (answer.type === "chart") {
      columns = answer.columns;
      rows = answer.rows;
    } else if (answer.type === "number") {
      columns = ["Value"];
      rows = [[String(answer.value)]];
    } else {
      return NextResponse.json({ error: "There's nothing tabular to export for that question." }, { status: 400 });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "Nothing to export — no submissions matched." }, { status: 422 });
    }

    const filenameBase = (form.title || "submissions").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "submissions";

    if (format === "xls") {
      const html = toHtmlTable(filenameBase, columns, rows);
      return new NextResponse(html, {
        headers: {
          "Content-Type": "application/vnd.ms-excel; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filenameBase}.xls"`,
        },
      });
    }

    const csv = toCsv(columns, rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}.csv"`,
      },
    });
  } catch (err) {
    console.error("[ai/ask/export]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Export failed — try again." },
      { status: 500 }
    );
  }
}

function escapeCell(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function toCsv(columns: string[], rows: string[][]): string {
  const header = columns.map(escapeCell).join(",");
  const body = rows.map((r) => r.map((c) => escapeCell(c ?? "")).join(",")).join("\r\n");
  // UTF-8 BOM so Excel opens accented text correctly.
  return `\uFEFF${header}\r\n${body}\r\n`;
}

function toHtmlTable(title: string, columns: string[], rows: string[][]): string {
  const esc = (s: string) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const head = `<tr>${columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
  return `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><title>${esc(title)}</title></head><body><table><thead>${head}</thead><tbody>${body}</tbody></table></body></html>`;
}
