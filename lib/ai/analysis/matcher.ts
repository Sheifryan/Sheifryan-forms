// Condition matching: decides whether a stored answer satisfies a normalized
// condition. All comparisons happen against the stored value's domain (option
// ids for choices, booleans for checkboxes, numbers for numeric fields), so
// text the model wrote ("football", "Saturday") maps onto the actual ids first.

import type { FormField } from "@/lib/schema";
import type { NormalizedCondition } from "./types";
import { CHOICE_TYPES, findOptionByLabel, formatCellValue, isAnswered, normText } from "./display";

export function parseBool(raw: unknown): boolean | null {
  const t = normText(raw);
  if (["true", "yes", "checked", "on", "1"].includes(t)) return true;
  if (["false", "no", "unchecked", "off", "0"].includes(t)) return false;
  return null;
}

/** Parse any value into a number; tolerates decorations ("18+", "1,200"). */
export function tryNumeric(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function selectedOptionLabels(field: FormField, value: unknown): string[] {
  if (Array.isArray(value)) {
    return (value as unknown[]).map((id) => field.options?.find((o) => o.id === id)?.label ?? String(id));
  }
  const label = field.options?.find((o) => o.id === value)?.label;
  return label ? [label] : isAnswered(value) ? [String(value)] : [];
}

function storedIds(value: unknown): unknown[] {
  if (Array.isArray(value)) return value as unknown[];
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

/** True when the row's stored answer satisfies the condition for its field. */
export function matchesCondition(field: FormField, cond: NormalizedCondition, stored: unknown): boolean {
  const op = cond.operator;
  if (op === "is_empty") return !isAnswered(stored);
  if (op === "is_not_empty") return isAnswered(stored);

  const choice = CHOICE_TYPES.has(field.type);
  if (choice) return matchChoice(field, cond, stored);

  switch (op) {
    case "equals": {
      const bool = parseBool(cond.value);
      if (field.type === "checkbox" && bool !== null) return Boolean(stored) === bool;
      const sn = tryNumeric(stored);
      const tn = tryNumeric(cond.value);
      if (sn !== null && tn !== null) return sn === tn;
      return normText(stored) === normText(cond.value);
    }
    case "not_equals":
      return !matchesCondition(field, { ...cond, operator: "equals" }, stored);
    case "contains": {
      const text = normText(formatCellValue(field, stored));
      const target = normText(cond.value);
      return target !== "" && text.includes(target);
    }
    case "not_contains":
      return !matchesCondition(field, { ...cond, operator: "contains" }, stored);
    case "one_of": {
      const targets = cond.values ?? [];
      if (field.type === "checkbox") {
        const bool = parseBool(stored);
        return bool !== null && targets.some((t) => parseBool(t) === bool);
      }
      const sn = tryNumeric(stored);
      if (sn !== null) return targets.some((t) => tryNumeric(t) === sn);
      const text = normText(stored);
      return targets.some((t) => normText(t) === text);
    }
    case "greater_than":
    case "less_than":
    case "greater_than_or_equal":
    case "less_than_or_equal":
      return numericRangeCheck(stored, op, tryNumeric(cond.value), tryNumeric(cond.value));
    case "between":
      return numericRangeCheck(stored, "between", tryNumeric(cond.value), tryNumeric(cond.value2 ?? cond.value));
    default:
      return false;
  }
}


function matchChoice(field: FormField, cond: NormalizedCondition, stored: unknown): boolean {
  const labels = selectedOptionLabels(field, stored);
  const ids = storedIds(stored).map((id) => String(id));
  const targetOption = findOptionByLabel(field, cond.value);
  const targetText = normText(cond.value);

  const matchesTarget = (t: unknown): boolean => {
    const opt = findOptionByLabel(field, t);
    if (opt && ids.includes(opt.id)) return true;
    const tt = normText(t);
    if (tt && labels.some((l) => normText(l) === tt)) return true;
    if (tt && ids.includes(tt)) return true;
    return false;
  };

  switch (cond.operator) {
    case "equals":
      return matchesTarget(cond.value);
    case "contains": {
      if (matchesTarget(cond.value)) return true;
      return labels.some((l) => targetText !== "" && normText(l).includes(targetText));
    }
    case "not_equals":
      return !matchesTarget(cond.value);
    case "not_contains": {
      if (targetOption && ids.includes(targetOption.id)) return false;
      return !labels.some((l) => targetText !== "" && normText(l).includes(targetText));
    }
    case "one_of": {
      const targets = cond.values ?? [];
      return targets.some((t) => matchesTarget(t));
    }
    case "greater_than":
    case "less_than":
    case "greater_than_or_equal":
    case "less_than_or_equal":
    case "between": {
      // Rare on choices; compare numeric content when both sides parse.
      const storedNum = labels.map((l) => tryNumeric(l)).find((n): n is number => n !== null);
      if (storedNum === undefined) return false;
      const lo = tryNumeric(cond.value);
      const hi = cond.value2 !== undefined ? tryNumeric(cond.value2) : lo;
      return numericRangeCheck(storedNum, cond.operator, lo, hi);
    }
    default:
      return false;
  }
}

/** Numeric range checks; returns false when bounds aren't numeric. */
function numericRangeCheck(stored: unknown, op: string, lo: number | null, hi: number | null): boolean {
  const n = tryNumeric(stored);
  if (n === null) return false;
  switch (op) {
    case "greater_than":
      return lo !== null && n > lo;
    case "less_than":
      return lo !== null && n < lo;
    case "greater_than_or_equal":
      return lo !== null && n >= lo;
    case "less_than_or_equal":
      return lo !== null && n <= lo;
    case "between":
      return lo !== null && hi !== null && n >= lo && n <= hi;
    default:
      return false;
  }
}
