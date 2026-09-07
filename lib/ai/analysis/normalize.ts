// Query validation: turns the model's raw interpretation into an executable
// query whose every field reference is a real, current field id — or explains,
// deterministically, why the question can't be answered (no guessing).

import type { FormField } from "@/lib/schema";
import type {
  AskQuery,
  MessageAnswer,
  NormalizedAskQuery,
  NormalizedCondition,
  NormalizedSort,
} from "./types";
import { findOptionByLabel, NON_QUERYABLE_TYPES, normText } from "./display";

export const DEFAULT_LIST_LIMIT = 100;
export const MAX_LIST_LIMIT = 200;
export const PSEUDO_SUBMITTED_ID = "__submitted__";

/** Virtual "when it was submitted" field, addressable as submitted/date/created_at. */
const PSEUDO_SUBMITTED = {
  id: PSEUDO_SUBMITTED_ID,
  label: "Submitted",
  type: "date",
  required: false,
} as FormField;

const SUBMITTED_ALIASES = ["submitted", "submission date", "created at", "created_on", "date"];

export type NormalizeOutcome =
  | { ok: true; query: NormalizedAskQuery }
  | { ok: false; message: MessageAnswer };

/** All filterable fields, mirroring the order they appear on the form. */
export function filterableFields(fields: FormField[]): FormField[] {
  return fields.filter((f) => !NON_QUERYABLE_TYPES.has(f.type));
}

export function isPseudoSubmitted(fieldId: string): boolean {
  return fieldId === PSEUDO_SUBMITTED_ID;
}

/**
 * Resolve a model-written token ("age", "What is your age?", field id) to a
 * field. Tries exact id/label first, then forgiving text matching.
 */
export function resolveField(fields: FormField[], ref: string): FormField | null {
  if (!ref) return null;
  const trimmed = ref.trim();
  if (!trimmed) return null;

  const exactId = fields.find((f) => f.id === trimmed);
  if (exactId) return exactId;
  const exactLabel = fields.find((f) => normText(f.label) === normText(trimmed));
  if (exactLabel) return exactLabel;

  const needle = normText(trimmed).replace(/[^a-z0-9]+/g, " ").trim();
  const matches = fields.filter((f) => {
    const hay = normText(f.label).replace(/[^a-z0-9]+/g, " ").trim();
    return needle && (hay === needle || hay.includes(needle) || needle.includes(hay));
  });
  if (matches.length === 1) return matches[0];

  // The virtual "submitted" field is a last resort — never shadow a real field
  // whose id/label actually matches the token.
  const pseudo = SUBMITTED_ALIASES.find((a) => normText(a) === normText(trimmed));
  if (pseudo) return PSEUDO_SUBMITTED;
  return null;
}

function cleanMessage(s: string): string {
  return s.trim().slice(0, 700);
}

export function clarifyMessage(title: string, message: string, suggestions?: string[]): MessageAnswer {
  return { type: "message", kind: "clarify", title, message: cleanMessage(message), suggestions };
}

function unknownFieldMessage(ref: string, fields: FormField[]): MessageAnswer {
  const available = filterableFields(fields)
    .map((f) => f.label)
    .slice(0, 6);
  return clarifyMessage(
    "I couldn't find that field",
    `This form doesn't have a field I can use for “${ref}”. It does have: ${available.join(", ")}. ` +
      `Rephrase using one of those, or describe what should count as a match.`
  );
}

function nonQueryableMessage(label: string): MessageAnswer {
  return clarifyMessage(
    "I can't filter by that field",
    `“${label}” exists, but it stores file uploads or payment details, so I can't filter submissions on it. ` +
      `Pick a text, choice, number or date field instead.`
  );
}

/** Build the conditions of an executable query, resolving fields + options. */
function resolveConditions(
  fields: FormField[],
  raw?: { field: string; operator: NormalizedCondition["operator"]; value?: string | number; value2?: string | number; values?: (string | number)[] }[]
): { ok: true; conditions: NormalizedCondition[] } | { ok: false; message: MessageAnswer } {
  const conditions: NormalizedCondition[] = [];
  for (const c of raw ?? []) {
    const field = resolveField(fields, c.field);
    if (!field) return { ok: false, message: unknownFieldMessage(c.field, fields) };
    if (isPseudoSubmitted(field.id)) {
      return {
        ok: false,
        message: clarifyMessage(
          "I can't filter by submission date like that",
          `You can filter by submission date with concrete dates (e.g. “submitted after 1 January 2024”).`
        ),
      };
    }
    if (NON_QUERYABLE_TYPES.has(field.type)) {
      return { ok: false, message: nonQueryableMessage(field.label) };
    }
    const isChoice =
      field.type === "single_select" || field.type === "dropdown" || field.type === "multi_select";
    const option = isChoice ? findOptionByLabel(field, c.value) : null;
    const optionIds = isChoice
      ? (c.values ?? []).map((v) => findOptionByLabel(field, v)?.id).filter((v): v is string => Boolean(v))
      : undefined;

    const normalized: NormalizedCondition = {
      fieldId: field.id,
      operator: c.operator,
      optionId: option?.id,
      value: c.value,
      value2: c.value2,
      optionIds: optionIds && optionIds.length > 0 ? optionIds : undefined,
      values: c.values,
    };
    if (
      isChoice &&
      c.operator !== "is_empty" &&
      c.operator !== "is_not_empty" &&
      !option &&
      !(optionIds && optionIds.length > 0)
    ) {
      if (c.operator === "equals") {
        return {
          ok: false,
          message: clarifyMessage(
            "That option doesn't exist",
            `“${field.label}” doesn't have an option like “${c.value}”. Its options are: ${
              (field.options ?? []).map((o) => o.label).join(", ") || "none"
            }.`
          ),
        };
      }
    }
    conditions.push(normalized);
  }
  return { ok: true, conditions };
}

/** Choose a sensible default column set when the model didn't name columns. */
function defaultSelect(fields: FormField[]): string[] {
  const usable = fields.filter((f) => !NON_QUERYABLE_TYPES.has(f.type) && f.type !== "long_text");
  const pick = usable.slice(0, 4);
  const nameLike = usable.find((f) => /name/i.test(f.label));
  if (!nameLike) return pick.map((f) => f.id);
  const rest = usable.filter((f) => f.id !== nameLike.id);
  return [nameLike.id, ...rest.slice(0, 3).map((f) => f.id)];
}

/** Convert a validated raw interpretation into an executable query. */
export function normalizeQuery(fields: FormField[], raw: AskQuery): NormalizeOutcome {
  const conds = resolveConditions(fields, raw.conditions);
  if (!conds.ok) return conds;

  const resolveRefs = (
    refs: string[] | undefined,
    _purpose: string
  ): string[] | { ok: false; message: MessageAnswer } => {
    const out: string[] = [];
    for (const ref of refs ?? []) {
      const field = resolveField(fields, ref);
      if (!field) return { ok: false, message: unknownFieldMessage(ref, fields) };
      out.push(field.id);
    }
    return out;
  };

  const select =
    raw.operation === "list" && raw.select && raw.select.length > 0
      ? resolveRefs(raw.select, "select")
      : defaultSelect(fields);
  if (!Array.isArray(select)) return select;
  const selectIds = select.filter(
    (id) => !NON_QUERYABLE_TYPES.has(fields.find((f) => f.id === id)?.type ?? "")
  );

  const sortRes: NormalizedSort[] = [];
  for (const s of raw.sort ?? []) {
    const field = resolveField(fields, s.field);
    if (!field) return { ok: false, message: unknownFieldMessage(s.field, fields) };
    sortRes.push({ fieldId: field.id, direction: s.direction });
  }

  const resolveSingle = (ref: string | undefined): { ok: true; id: string } | { ok: false; message: MessageAnswer } => {
    if (!ref) return { ok: false, message: clarifyMessage("Missing field", "Tell me which field to use here.") };
    const field = resolveField(fields, ref);
    if (!field) return { ok: false, message: unknownFieldMessage(ref, fields) };
    return { ok: true, id: field.id };
  };

  let groupBy: string | undefined;
  if (raw.groupBy) {
    const r = resolveSingle(raw.groupBy);
    if (!r.ok) return r;
    groupBy = r.id;
  }
  let compareBy: string | undefined;
  if (raw.compareBy) {
    const r = resolveSingle(raw.compareBy);
    if (!r.ok) return r;
    compareBy = r.id;
  }
  let aggField: string | undefined;
  if (raw.field) {
    const r = resolveSingle(raw.field);
    if (!r.ok) return r;
    aggField = r.id;
  }
  let metricField: string | undefined;
  if (raw.metric?.field) {
    const r = resolveSingle(raw.metric.field);
    if (!r.ok) return r;
    metricField = r.id;
  }

  const limit = Math.min(Math.max(raw.limit ?? DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);

  const query: NormalizedAskQuery = {
    operation: raw.operation,
    select: selectIds.length > 0 ? selectIds : defaultSelect(fields),
    conditions: conds.ok ? conds.conditions : [],
    sort: sortRes,
    limit: raw.operation === "list" ? limit : DEFAULT_LIST_LIMIT,
    groupBy,
    compareBy,
    function: raw.function,
    field: aggField,
    metric: raw.metric ? { function: raw.metric.function, field: metricField } : undefined,
    scope: raw.scope,
  };
  return { ok: true, query };
}

export type { NormalizedSort };

