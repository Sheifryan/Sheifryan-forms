// Server-side query engine for "Ask your data". Scans the owner's responses in
// bounded, ordered chunks (never the browser, never a single giant in-memory
// load) and computes structured answers: counts, filtered tables, grouping,
// aggregation and summaries. Row evaluation happens in TypeScript against the
// stored JSONB answers so numeric/range semantics are exact and safe.

import type { FormField } from "@/lib/schema";
import type {
  ChartAnswer,
  MessageAnswer,
  NormalizedAskQuery,
  NormalizedSort,
  NumberAnswer,
  QueryOutcome,
  ResponseRowLike,
  ResponsesSource,
  StructuredAnswer,
  SummaryAnswer,
  TableAnswer,
} from "./types";
import {
  formatCellValue,
  groupKeyFor,
  isAnswered,
  multiBucketKeysFor,
  shortenText,
} from "./display";
import { matchesCondition, tryNumeric } from "./matcher";
import { PSEUDO_SUBMITTED_ID } from "./normalize";

export const SCAN_CHUNK = 1000;
export const MAX_SCAN_ROWS = 20000;
const MAX_GROUPS = 50;
const MAX_CELL = 200;

export function isPseudoSubmittedId(id: string): boolean {
  return id === PSEUDO_SUBMITTED_ID;
}

/** Current-field lookup; the pseudo "Submitted" column maps to created_at. */
export function fieldById(fields: FormField[], id: string): FormField | null {
  if (isPseudoSubmittedId(id)) {
    return { id: PSEUDO_SUBMITTED_ID, label: "Submitted", type: "date", required: false };
  }
  return fields.find((f) => f.id === id) ?? null;
}

function matchesAll(fields: FormField[], query: NormalizedAskQuery, row: ResponseRowLike): boolean {
  for (const cond of query.conditions) {
    const field = fieldById(fields, cond.fieldId);
    if (!field) return false;
    const stored = isPseudoSubmittedId(cond.fieldId) ? row.created_at : row.answers[cond.fieldId];
    if (!matchesCondition(field, cond, stored)) return false;
  }
  return true;
}

function valueFor(fields: FormField[], row: ResponseRowLike, fieldId: string): unknown {
  if (isPseudoSubmittedId(fieldId)) return row.created_at;
  const raw = row.answers[fieldId];
  const field = fieldById(fields, fieldId);
  if (field && field.type === "file" && Array.isArray(raw)) {
    return raw.length > 0 ? `${raw.length} file(s)` : "";
  }
  return raw;
}

function displayCell(fields: FormField[], row: ResponseRowLike, fieldId: string): string {
  const value = valueFor(fields, row, fieldId);
  if (isPseudoSubmittedId(fieldId)) {
    return value ? new Date(String(value)).toLocaleString() : "—";
  }
  const field = fieldById(fields, fieldId);
  if (!field) return "—";
  const text = formatCellValue(field, value);
  return text.length > MAX_CELL ? `${text.slice(0, MAX_CELL - 1)}…` : text;
}

/** Deterministic comparator over a row's field value (numbers first). */
function compareRows(
  fields: FormField[],
  a: ResponseRowLike,
  b: ResponseRowLike,
  sort: NormalizedSort[]
): number {
  for (const s of sort) {
    const va = valueFor(fields, a, s.fieldId);
    const vb = valueFor(fields, b, s.fieldId);
    let cmp: number;
    const na = tryNumeric(va);
    const nb = tryNumeric(vb);
    if (na !== null && nb !== null) {
      cmp = na - nb;
    } else if (!isAnswered(va) && !isAnswered(vb)) {
      cmp = 0;
    } else if (!isAnswered(va)) {
      cmp = 1; // missing values sort last regardless of direction
    } else if (!isAnswered(vb)) {
      cmp = -1;
    } else {
      cmp =
        String(va).toLowerCase() < String(vb).toLowerCase()
          ? -1
          : String(va).toLowerCase() > String(vb).toLowerCase()
            ? 1
            : 0;
    }
    if (cmp !== 0) return s.direction === "asc" ? cmp : -cmp;
  }
  // Stable tie-breaker: newest first.
  return a.created_at < b.created_at
    ? 1
    : a.created_at > b.created_at
      ? -1
      : a.id < b.id
        ? 1
        : -1;
}

/** Round to 2 decimals, trimming trailing zeros. */
export function prettyNumber(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Answer builders
// ---------------------------------------------------------------------------

function noRowsAnswer(): QueryOutcome {
  const message: MessageAnswer = {
    type: "message",
    kind: "empty",
    title: "No submissions yet",
    message: "This form has no submissions yet — share its public link to start collecting responses.",
  };
  return {
    noSubmissions: true,
    matchedRows: [],
    scanned: 0,
    truncatedScan: false,
    datasetTotal: 0,
    answer: message,
  };
}

function emptyMatchAnswer(): QueryOutcome {
  const message: MessageAnswer = {
    type: "message",
    kind: "empty",
    title: "Nothing matched",
    message: "No submissions match that filter.",
  };
  return {
    noSubmissions: false,
    matchedRows: [],
    scanned: 0,
    truncatedScan: false,
    datasetTotal: 0,
    answer: message,
  };
}

function buildListAnswer(
  fields: FormField[],
  query: NormalizedAskQuery,
  rows: ResponseRowLike[]
): StructuredAnswer {
  const columns: { id: string; label: string }[] = [];
  for (const id of query.select) {
    const field = fieldById(fields, id);
    if (!field) continue;
    if (columns.some((c) => c.label.toLowerCase() === field.label.toLowerCase())) continue;
    columns.push({ id: field.id, label: field.label });
  }
  const colLabels = columns.map((c) => c.label);
  const rendered = rows.slice(0, query.limit).map((r) => columns.map((c) => displayCell(fields, r, c.id)));
  const total = rows.length;
  const returned = rendered.length;
  const truncated = total > returned;

  const answer: TableAnswer = {
    type: "table",
    title: query.conditions.length > 0 ? "Matching submissions" : "Submissions",
    columns: colLabels,
    rows: rendered,
    total,
    returned,
    truncated,
    summary:
      total === 0
        ? "No submissions matched."
        : truncated
          ? `${total} submissions matched — showing the first ${returned}.`
          : `${total} ${total === 1 ? "submission" : "submissions"} matched.`,
  };
  if (truncated) {
    answer.note = "Only the first rows are shown. Use Export to download the full set.";
  }
  return answer;
}

function groupRows(fields: FormField[], groupFieldId: string, rows: ResponseRowLike[]) {
  const field = fieldById(fields, groupFieldId);
  const buckets = new Map<string, number>();
  for (const row of rows) {
    if (!field) {
      buckets.set("Not answered", (buckets.get("Not answered") ?? 0) + 1);
      continue;
    }
    const value = row.answers[field.id];
    for (const key of multiBucketKeysFor(field, value)) {
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  }
  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, MAX_GROUPS);
}


function buildGroupAnswer(
  fields: FormField[],
  title: string,
  fieldId: string,
  rows: ResponseRowLike[]
): StructuredAnswer {
  const field = fieldById(fields, fieldId);
  const grouped = groupRows(fields, fieldId, rows);
  const label = field?.label ?? "Category";
  if (grouped.length === 0) {
    return { type: "message", kind: "empty", title: "Nothing to group", message: "No submissions to group." };
  }
  const counted = grouped.reduce((sum, [, n]) => sum + n, 0);
  const answer: ChartAnswer = {
    type: "chart",
    title,
    summary: `${rows.length} submission${rows.length === 1 ? "" : "s"} across ${grouped.length} ${
      grouped.length === 1 ? "category" : "categories"
    }.`,
    chartType: "bar",
    labels: grouped.map(([k]) => k),
    values: grouped.map(([, n]) => n),
    columns: [label, "Count"],
    rows: grouped.map(([k, n]) => [k, String(n)]),
    total: counted,
  };
  return answer;
}

function buildAggregateAnswer(
  fields: FormField[],
  query: NormalizedAskQuery,
  rows: ResponseRowLike[]
): StructuredAnswer {
  if (query.function === "count") {
    const answer: NumberAnswer = {
      type: "number",
      title: "Count",
      value: rows.length,
      unit: "submissions",
      summary: `${rows.length} submission${rows.length === 1 ? "" : "s"} matched.`,
    };
    return answer;
  }

  const field = query.field ? fieldById(fields, query.field) : null;
  if (!field) {
    return {
      type: "message",
      kind: "info",
      title: "Can't aggregate",
      message: "Pick a numeric field (number or rating) to compute that.",
    };
  }
  const nums = rows
    .map((r) => tryNumeric(r.answers[field.id]))
    .filter((n): n is number => n !== null);
  if (nums.length === 0) {
    return {
      type: "message",
      kind: "info",
      title: `No numbers for “${field.label}”`,
      message: `“${field.label}” doesn't contain numeric values I could aggregate.`,
    };
  }
  const fn = query.function ?? "avg";
  let value = 0;
  if (fn === "sum") value = nums.reduce((a, b) => a + b, 0);
  else if (fn === "min") value = Math.min(...nums);
  else if (fn === "max") value = Math.max(...nums);
  else value = nums.reduce((a, b) => a + b, 0) / nums.length;

  const pretty = prettyNumber(value);
  const verbs: Record<string, string> = {
    avg: "Average",
    sum: "Total",
    min: "Lowest",
    max: "Highest",
  };
  return {
    type: "number",
    title: `${verbs[fn] ?? "Value"} of ${shortenText(field.label, 60)}`,
    value: pretty,
    summary: `${verbs[fn] ?? "Computed"} over ${nums.length} answered submission${nums.length === 1 ? "" : "s"}${rows.length !== nums.length ? ` (${rows.length - nums.length} had no value)` : ""}.`,
  } as NumberAnswer;
}

function buildSummaryAnswer(fields: FormField[], rows: ResponseRowLike[]): StructuredAnswer {
  const total = rows.length;
  const items: { label: string; detail: string }[] = [];

  for (const field of fields) {
    if (field.type === "page_break") continue;
    let answered = 0;
    const values: unknown[] = [];
    for (const r of rows) {
      const v = r.answers[field.id];
      if (isAnswered(v)) {
        answered++;
        values.push(v);
      }
    }
    const pct = total === 0 ? 0 : Math.round((answered / total) * 100);

    if (field.type === "single_select" || field.type === "dropdown") {
      const counts = new Map<string, number>();
      for (const v of values) {
        const key = groupKeyFor(field, v);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      items.push({
        label: field.label,
        detail:
          top.length === 0
            ? "No answers yet."
            : top.map(([k, n]) => `${k} (${n})`).join(", ") + ` · answered by ${answered}/${total} (${pct}%)`,
      });
    } else if (field.type === "multi_select") {
      const counts = new Map<string, number>();
      for (const v of values) {
        if (!Array.isArray(v)) continue;
        for (const id of v) {
          const key = field.options?.find((o) => o.id === id)?.label ?? String(id);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      items.push({
        label: field.label,
        detail:
          top.length === 0
            ? "No answers yet."
            : top.map(([k, n]) => `${k} (${n})`).join(", ") + ` · picked ${answered} time${answered === 1 ? "" : "s"} across ${total}`,
      });
    } else if (field.type === "number" || field.type === "rating") {
      const nums = values.map((v) => tryNumeric(v)).filter((n): n is number => n !== null);
      if (nums.length === 0) {
        items.push({ label: field.label, detail: "No numeric answers yet." });
      } else {
        const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
        items.push({
          label: field.label,
          detail: `Average ${prettyNumber(avg)}, lowest ${Math.min(...nums)}, highest ${Math.max(...nums)} · answered by ${answered}/${total}`,
        });
      }
    } else if (field.type === "file" || field.type === "payment") {
      items.push({ label: field.label, detail: `Present in ${answered} submission${answered === 1 ? "" : "s"}.` });
    } else {
      items.push({
        label: field.label,
        detail: `${answered === total ? "Answered by everyone" : `Answered by ${answered}/${total} (${pct}%)`}.`,
      });
    }
  }

  if (items.length === 0) items.push({ label: "Form", detail: "This form has no questions." });
  return {
    type: "summary",
    title: "Summary of responses",
    items,
    summary: `${total} submission${total === 1 ? "" : "s"} analyzed.`,
  } as SummaryAnswer;
}


// ---------------------------------------------------------------------------
// Scan + dispatch
// ---------------------------------------------------------------------------

/**
 * Run a normalized query against a chunked response source. Returns matched
 * rows (bounded by the scan cap) plus a ready-to-render structured answer.
 */
export async function executeQuery(
  fields: FormField[],
  query: NormalizedAskQuery,
  source: ResponsesSource,
  opts?: { chunk?: number; maxScan?: number }
): Promise<QueryOutcome> {
  const chunk = opts?.chunk ?? SCAN_CHUNK;
  const maxScan = opts?.maxScan ?? MAX_SCAN_ROWS;

  const datasetTotal = await source.count();
  if (datasetTotal <= 0) return noRowsAnswer();

  const matched: ResponseRowLike[] = [];
  let scanned = 0;
  let truncatedScan = false;

  while (scanned < datasetTotal) {
    const end = Math.min(scanned + chunk, datasetTotal);
    const rows = await source.range(scanned, end);
    if (rows.length === 0) break; // defensive: count/range drifted
    for (const row of rows) {
      if (matchesAll(fields, query, row)) matched.push(row);
    }
    scanned += rows.length;
    if (scanned >= maxScan) {
      truncatedScan = scanned < datasetTotal;
      break;
    }
  }

  const base: Omit<QueryOutcome, "answer"> = {
    noSubmissions: false,
    matchedRows: matched,
    scanned,
    truncatedScan,
    datasetTotal,
  };

  // Apply requested sort only for the list view (aggregations don't care).
  let ordered = matched;
  if (query.operation === "list" || query.operation === "aggregate") {
    ordered = [...matched].sort((a, b) => compareRows(fields, a, b, query.sort));
  }

  let answer: StructuredAnswer;
  switch (query.operation) {
    case "count": {
      const hasFilter = query.conditions.length > 0;
      if (matched.length === 0 && !hasFilter) return emptyMatchAnswer();
      const unit = hasFilter ? "matching" : "submissions";
      answer = {
        type: "number",
        title: hasFilter ? "Matching submissions" : "Total submissions",
        value: matched.length,
        unit,
        summary:
          matched.length === 0
            ? "No submissions matched that filter."
            : `${matched.length} submission${matched.length === 1 ? "" : "s"} matched.`,
      } as NumberAnswer;
      break;
    }
    case "list":
      if (ordered.length === 0) return emptyMatchAnswer();
      answer = buildListAnswer(fields, query, ordered);
      break;
    case "group":
    case "compare": {
      const groupFieldId = query.operation === "group" ? query.groupBy : query.compareBy;
      if (!groupFieldId) {
        answer = {
          type: "message",
          kind: "info",
          title: "Grouping needs a field",
          message: "Tell me which field to group by (e.g. “by position”).",
        } as MessageAnswer;
        break;
      }
      if (ordered.length === 0) return emptyMatchAnswer();
      const field = fieldById(fields, groupFieldId);
      answer = buildGroupAnswer(
        fields,
        query.operation === "group" ? `Submissions by ${field?.label ?? "category"}` : `Compare: ${field?.label ?? "categories"}`,
        groupFieldId,
        ordered
      );
      break;
    }
    case "aggregate":
      answer = buildAggregateAnswer(fields, query, ordered);
      break;
    case "summary":
      answer = buildSummaryAnswer(fields, ordered);
      break;
    default:
      answer = {
        type: "message",
        kind: "error",
        title: "Unsupported question",
        message: "That type of question isn't supported yet. Try counting, listing, grouping or summarizing.",
      } as MessageAnswer;
  }

  if (truncatedScan) {
    const patch = (a: StructuredAnswer): StructuredAnswer => {
      if (a.type === "table") {
        return { ...a, note: (a.note ? `${a.note} ` : "") + `Analysis covered the first ${scanned} submissions (older ones were skipped to stay fast).` };
      }
      if (a.type === "number") {
        return { ...a, summary: `${a.summary ?? ""} (based on the first ${scanned} submissions).` };
      }
      return a;
    };
    answer = patch(answer);
  }

  return { ...base, answer };
}

