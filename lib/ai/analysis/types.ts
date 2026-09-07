// Shared types for the "Ask your data" feature. Pure type contracts only —
// keep runtime dependencies out so the modules stay unit-testable with plain
// `tsc` + node (type-only imports from @/lib/schema are erased at runtime).

import type { FormField } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Query contract — what the AI (and the client) may ask the data engine.
// ---------------------------------------------------------------------------

export type AskOperation =
  | "clarify"
  | "count"
  | "list"
  | "group"
  | "aggregate"
  | "compare"
  | "summary";

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "greater_than"
  | "less_than"
  | "greater_than_or_equal"
  | "less_than_or_equal"
  | "between"
  | "one_of"
  | "is_empty"
  | "is_not_empty";

export interface AskCondition {
  /** Field id or label token as the AI wrote it (resolved by the validator). */
  field: string;
  operator: ConditionOperator;
  value?: string | number;
  value2?: string | number;
  values?: (string | number)[];
}

export interface AskSort {
  field: string;
  direction: "asc" | "desc";
}

export type AggregateFunction = "count" | "avg" | "sum" | "min" | "max";

/** The raw interpretation the model returns (still unvalidated against the form). */
export interface AskQuery {
  operation: Exclude<AskOperation, "clarify">;
  /** Fields (id or label) whose values should be displayed. */
  select?: string[];
  conditions?: AskCondition[];
  sort?: AskSort[];
  /** Max rows to return for list operations (1..200). */
  limit?: number;
  /** group: field to bucket by. */
  groupBy?: string;
  /** aggregate: function + (for avg/sum/min/max) the numeric target field. */
  function?: AggregateFunction;
  field?: string;
  /** compare: the field whose categories are compared (e.g. gender). */
  compareBy?: string;
  /** Optional metric for compare, e.g. average age per gender. */
  metric?: { function: AggregateFunction; field?: string };
  /** Used by the summary operation to describe how broadly to summarize. */
  scope?: "all" | "matching";
}

export interface ClarifyQuery {
  operation: "clarify";
  clarification: string;
}

export type AiInterpretation = AskQuery | ClarifyQuery;

// ---------------------------------------------------------------------------
// Normalized / executable form of the query. All field references are ids
// that exist in the current form schema; option values are resolved ids.
// ---------------------------------------------------------------------------

export interface NormalizedCondition {
  fieldId: string;
  operator: ConditionOperator;
  /** Resolved option id when the target was an option of the field. */
  optionId?: string;
  /** Raw value as written by the model (kept for text contains / display). */
  value?: string | number;
  value2?: string | number;
  optionIds?: string[];
  values?: (string | number)[];
}


export interface NormalizedSort {
  fieldId: string;
  direction: "asc" | "desc";
}

export interface NormalizedAskQuery {
  operation: Exclude<AskOperation, "clarify">;
  select: string[];
  conditions: NormalizedCondition[];
  sort: NormalizedSort[];
  /** Effective row cap (set server-side when the model didn't ask). */
  limit: number;
  groupBy?: string;
  function?: AggregateFunction;
  field?: string;
  compareBy?: string;
  metric?: { function: AggregateFunction; field?: string };
  scope?: "all" | "matching";
}

// ---------------------------------------------------------------------------
// Responses source — abstracts Supabase so the engine is testable with arrays.
// ---------------------------------------------------------------------------

export interface ResponseRowLike {
  id: string;
  answers: Record<string, unknown>;
  created_at: string;
}

export interface ResponsesSource {
  /** Total rows belonging to the form (respects RLS when Supabase-backed). */
  count(): Promise<number>;
  /** Newest created_at ("" when no rows). */
  latestCreatedAt(): Promise<string | null>;
  /** Rows [start, end) ordered by created_at asc, id asc. */
  range(start: number, end: number): Promise<ResponseRowLike[]>;
}

// ---------------------------------------------------------------------------
// Structured answers returned to the client.
// ---------------------------------------------------------------------------

export interface NumberAnswer {
  type: "number";
  title: string;
  summary?: string;
  value: number;
  /** e.g. "submissions", "years". */
  unit?: string;
}

export interface TableAnswer {
  type: "table";
  title: string;
  summary?: string;
  columns: string[];
  /** Cell values are pre-formatted display strings. */
  rows: string[][];
  /** Total rows matching the query (before the display cap). */
  total: number;
  returned: number;
  truncated: boolean;
  note?: string;
}

export interface ChartAnswer {
  type: "chart";
  title: string;
  summary?: string;
  chartType: "bar" | "pie";
  labels: string[];
  values: number[];
  /** Table representation of the same data (shown under the chart + exportable). */
  columns: string[];
  rows: string[][];
  total: number;
}

export interface SummaryItem {
  label: string;
  detail: string;
}

export interface SummaryAnswer {
  type: "summary";
  title: string;
  summary?: string;
  items: SummaryItem[];
}

export type MessageKind = "info" | "clarify" | "error" | "empty";

export interface MessageAnswer {
  type: "message";
  kind: MessageKind;
  title: string;
  message: string;
  /** Suggested example questions that could help, when clarifying. */
  suggestions?: string[];
}

export type StructuredAnswer =
  | NumberAnswer
  | TableAnswer
  | ChartAnswer
  | SummaryAnswer
  | MessageAnswer;

/** Everything the engine knows about a run — used to render/narrate/summarize. */
export interface QueryOutcome {
  /** True when zero submissions exist for the form. */
  noSubmissions: boolean;
  /** Rows that matched the query (bounded by scan, not by display limit). */
  matchedRows: ResponseRowLike[];
  /** How many rows were scanned in total (may be < dataset when capped). */
  scanned: number;
  /** True when the scan cap stopped before the whole dataset was read. */
  truncatedScan: boolean;
  /** Total rows in the form at scan time. */
  datasetTotal: number;
  answer: StructuredAnswer;
}

export type { FormField };

