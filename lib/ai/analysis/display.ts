// Stored-answer semantics for the ask engine: what "answered" means per field
// type, how option ids become human labels, and how values compare/group.
// Pure helpers with zero runtime imports so the whole engine is unit-testable.

import type { FormField } from "@/lib/schema";

export const CHOICE_TYPES = new Set(["single_select", "dropdown", "multi_select"]);

export const SENSITIVE_TYPES = new Set(["phone", "email", "payment", "file"]);

/** Fields that carry no filterable answer (structural or money/binary content). */
export const NON_QUERYABLE_TYPES = new Set(["page_break", "file", "payment"]);

export function isChoiceType(type: string): boolean {
  return CHOICE_TYPES.has(type);
}

export function isAnswered(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/** Trim + lowercase a token for forgiving comparisons. */
export function normText(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

export function findOptionByLabel(field: FormField, raw: unknown): { id: string; label: string } | null {
  const target = normText(raw);
  if (!target) return null;
  for (const o of field.options ?? []) {
    if (normText(o.id) === target || normText(o.label) === target) return o;
  }
  // Fall back to a containment match so "footbal" ~ "football" works.
  for (const o of field.options ?? []) {
    if (normText(o.label).includes(target) || target.includes(normText(o.label))) return o;
  }
  return null;
}

/**
 * Readable display string for a stored answer cell (mirrors the submissions
 * table's answerDisplay so exports match what the user sees).
 */
export function formatCellValue(field: FormField, value: unknown): string {
  if (!isAnswered(value)) return "—";
  switch (field.type) {
    case "single_select":
    case "dropdown":
      return field.options?.find((o) => o.id === value)?.label ?? String(value);
    case "multi_select": {
      const arr = Array.isArray(value) ? (value as unknown[]) : [];
      return arr
        .map((id) => field.options?.find((o) => o.id === id)?.label ?? String(id))
        .join(", ") || "—";
    }
    case "checkbox":
      return value ? "Yes" : "No";
    case "rating":
      return Number.isFinite(Number(value)) ? `${Number(value)}/5` : String(value);
    case "file": {
      const n = Array.isArray(value) ? value.length : 0;
      return n > 0 ? `${n} file${n === 1 ? "" : "s"}` : "—";
    }
    case "payment": {
      if (typeof value === "object" && value !== null) {
        const v = value as { totalUgx?: unknown; amount?: unknown; status?: unknown; currency?: unknown };
        const parts: string[] = [];
        if (typeof v.totalUgx === "number" && Number.isFinite(v.totalUgx)) {
          parts.push(`UGX ${v.totalUgx.toLocaleString("en-UG")}`);
        } else if (typeof v.amount === "number" && Number.isFinite(v.amount)) {
          parts.push(v.currency === "USD" ? `USD ${v.amount.toLocaleString("en-US")}` : `UGX ${v.amount.toLocaleString("en-UG")}`);
        }
        if (typeof v.status === "string" && v.status) parts.push(String(v.status));
        return parts.join(" · ") || "—";
      }
      return "—";
    }
    default:
      return String(value);
  }
}

/**
 * Shortened free-text values so tables/narratives stay compact (long paragraphs
 * are collapsed; multi-line collapses to a single line).
 */
export function shortenText(raw: string, max = 160): string {
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

/**
 * A stable, readable bucket key for grouping/compare (e.g. option label,
 * "Yes"/"No", "4/5"). Empty answers group under "Not answered".
 */
export function groupKeyFor(field: FormField, value: unknown): string {
  if (!isAnswered(value)) return "Not answered";
  switch (field.type) {
    case "single_select":
    case "dropdown":
      return field.options?.find((o) => o.id === value)?.label ?? shortenText(String(value));
    case "multi_select": {
      // A multi-select answer can belong to several buckets; the caller decides
      // whether to explode it (see multiBucketKeysFor).
      const arr = Array.isArray(value) ? (value as unknown[]) : [];
      return arr
        .map((id) => field.options?.find((o) => o.id === id)?.label ?? String(id))
        .join(", ");
    }
    case "checkbox":
      return value ? "Yes" : "No";
    case "rating":
      return Number.isFinite(Number(value)) ? `${Number(value)}/5` : String(value);
    default:
      return shortenText(String(value), 120);
  }
}

/** Group keys for a value that may belong to several buckets (multi_select). */
export function multiBucketKeysFor(field: FormField, value: unknown): string[] {
  if (field.type === "multi_select" && Array.isArray(value)) {
    const keys = (value as unknown[]).map(
      (id) => field.options?.find((o) => o.id === id)?.label ?? String(id)
    );
    return keys.length > 0 ? keys : ["Not answered"];
  }
  return [groupKeyFor(field, value)];
}
