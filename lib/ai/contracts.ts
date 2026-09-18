// Zod contracts + normalizers for everything the AI routes hand back and
// forth. Model output is never trusted raw: every reply is validated here,
// and every field/option gets a server-generated nanoid id (same convention
// as lib/templates.ts and the builder).

import { z } from "zod";
import { nanoid } from "nanoid";
import type { FormField } from "@/lib/schema";
import { defaultFileConfig } from "@/lib/schema";

// Field types the AI is allowed to produce. `page_break` and `payment` are
// deliberately excluded — those carry structural/money config that should be
// added by a human in the builder.
export const GENERATED_FIELD_TYPES = [
  "short_text",
  "long_text",
  "email",
  "phone",
  "number",
  "url",
  "single_select",
  "multi_select",
  "dropdown",
  "rating",
  "date",
  "time",
  "checkbox",
  "file",
] as const;

const CHOICE_TYPES = new Set(["single_select", "multi_select", "dropdown"]);

/**
 * Option labels for choice fields.
 *
 * The prompt asks the model to omit `options` on non-choice types, but it
 * usually echoes the key anyway — as `"options": []`. `.optional()` forgives a
 * MISSING key, never an empty array, so every one of those fields produced a
 * `too_small` issue and the whole reply was rejected (both attempts, then a 502
 * that dumped the raw Zod issue array into the builder UI). Normalise here:
 * trim labels, drop blanks, and treat "nothing usable" as absent.
 *
 * Choice fields left without options fall back to the two default labels in
 * `toFormField` below, so nothing is lost.
 */
const optionLabels = z.preprocess((value) => {
  if (!Array.isArray(value)) return value;
  const cleaned = value
    .map((option) => (typeof option === "string" ? option.trim() : option))
    .filter((option) => typeof option !== "string" || option.length > 0);
  return cleaned.length === 0 ? undefined : cleaned;
}, z.array(z.string().min(1).max(120)).min(1).max(12).optional());

/**
 * Common synonyms the model uses when it drifts from the catalogue.
 *
 * The prompts ask for the exact type strings and the model usually complies —
 * but a measured paper-form import came back with `"type":"text"` and
 * `"type":"radio"`, which failed the enum and rejected the whole reply (twice,
 * then a 502). Map the synonyms onto the catalogue first; anything genuinely
 * unknown still fails, so we never silently guess a field's behaviour.
 */
const TYPE_ALIASES: Record<string, (typeof GENERATED_FIELD_TYPES)[number]> = {
  text: "short_text",
  string: "short_text",
  input: "short_text",
  textfield: "short_text",
  line: "short_text",
  name: "short_text",
  paragraph: "long_text",
  textarea: "long_text",
  text_area: "long_text",
  multiline: "long_text",
  free_text: "long_text",
  comment: "long_text",
  email_address: "email",
  mail: "email",
  tel: "phone",
  telephone: "phone",
  mobile: "phone",
  numeric: "number",
  integer: "number",
  amount: "number",
  link: "url",
  website: "url",
  radio: "single_select",
  radios: "single_select",
  radio_group: "single_select",
  radiogroup: "single_select",
  choice: "single_select",
  select: "single_select",
  single_choice: "single_select",
  checkboxes: "multi_select",
  checkbox_group: "multi_select",
  multiple: "multi_select",
  multiple_choice: "multi_select",
  multi: "multi_select",
  multiselect: "multi_select",
  multi_select_group: "multi_select",
  dropdown_list: "dropdown",
  combo: "dropdown",
  combobox: "dropdown",
  star: "rating",
  stars: "rating",
  scale: "rating",
  calendar: "date",
  datepicker: "date",
  date_picker: "date",
  clock: "time",
  timepicker: "time",
  consent: "checkbox",
  boolean: "checkbox",
  yes_no: "checkbox",
  yesno: "checkbox",
  toggle: "checkbox",
  attachment: "file",
  upload: "file",
  file_upload: "file",
  document: "file",
  image: "file",
  photo: "file",
};

const normalizedType = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return TYPE_ALIASES[key] ?? key;
}, z.enum(GENERATED_FIELD_TYPES));

export const fieldOutputSchema = z.object({
  // Optional so the model can echo existing ids back when it's editing a form
  // in place (AI review/improve). Ignored for brand-new generations.
  id: z.string().min(1).max(20).optional(),
  type: normalizedType,
  label: z.string().min(1).max(140),
  required: z.boolean().default(false),
  helpText: z.string().max(400).optional(),
  placeholder: z.string().max(200).optional(),
  // Option labels for choice fields (single_select / multi_select / dropdown).
  options: optionLabels,
});

export type FieldOutput = z.infer<typeof fieldOutputSchema>;

export const formDraftSchema = z.object({
  title: z.string().min(1).max(140),
  description: z.string().max(600).optional(),
  confirmationMessage: z.string().max(400).optional(),
  // 60 rather than 20: a real paper form (or a Word/PDF import) routinely has
  // more questions than a prompt-generated one, and the model returns them in a
  // single reply. The generation prompt still asks for 3-15.
  fields: z.array(fieldOutputSchema).min(1).max(60),
});

export type FormDraftOutput = z.infer<typeof formDraftSchema>;

export interface FormDraft {
  title: string;
  description: string;
  confirmationMessage: string;
  fields: FormField[];
}

/** Cast AI field output into a real FormField (ids + option ids assigned here). */
function toFormField(f: FieldOutput, existingIds: Set<string>): FormField {
  const needsOptions = CHOICE_TYPES.has(f.type);
  const label = f.label.trim();
  const options = needsOptions
    ? ((f.options && f.options.length >= 2 ? f.options : ["Option 1", "Option 2"]).map((o) => ({
        id: nanoid(6),
        label: o,
      })))
    : undefined;

  return {
    // Keep the original id only when the model echoed back one the form
    // already owns (so conditional rules keep pointing at real fields).
    id: f.id && existingIds.has(f.id) ? f.id : nanoid(8),
    type: f.type,
    label,
    required: f.required ?? false,
    helpText: f.helpText?.trim() || undefined,
    // A checkbox renders its placeholder as the consent/statement text, so
    // fall back to the label when the model didn't provide one.
    placeholder:
      f.type === "checkbox"
        ? f.placeholder?.trim() || label
        : f.placeholder?.trim() || undefined,
    options,
    fileConfig: f.type === "file" ? defaultFileConfig() : undefined,
  };
}

export function normalizeGeneratedFields(fields: FieldOutput[], existing?: FormField[]): FormField[] {
  const existingIds = new Set((existing ?? []).map((f) => f.id));
  return fields.map((f) => toFormField(f, existingIds));
}

export function normalizeFormDraft(raw: FormDraftOutput): FormDraft {
  return {
    title: raw.title.trim(),
    description: raw.description?.trim() ?? "",
    confirmationMessage:
      raw.confirmationMessage?.trim() || "Thanks — your response has been recorded.",
    fields: normalizeGeneratedFields(raw.fields),
  };
}

// ---------------------------------------------------------------------------
// Critique (pre-publish review of a form schema)
// ---------------------------------------------------------------------------

export const critiqueSuggestionSchema = z.object({
  // Referenced field id when the issue is about one specific question.
  fieldId: z.string().optional(),
  severity: z.enum(["error", "warning", "info"]),
  message: z.string().min(1).max(700),
  suggestion: z.string().min(1).max(700),
});

export const critiqueSchema = z.object({
  summary: z.string().min(1).max(1500),
  score: z.number().int().min(1).max(10),
  suggestions: z.array(critiqueSuggestionSchema).max(15),
});

export type CritiqueResult = z.infer<typeof critiqueSchema>;

export const improveSchema = z.object({
  summary: z.string().min(1).max(1500),
  fields: z.array(fieldOutputSchema).min(1).max(20),
});

// ---------------------------------------------------------------------------
// Post-publish response analysis
// ---------------------------------------------------------------------------

export const analysisSchema = z.object({
  headline: z.string().min(1).max(500),
  insights: z
    .array(z.object({ label: z.string().min(1).max(160), detail: z.string().min(1).max(900) }))
    .max(12),
  trends: z.array(z.string().min(1).max(500)).max(10),
  quotes: z
    .array(z.object({ fieldLabel: z.string().min(1).max(160), text: z.string().min(1).max(600) }))
    .max(10),
  suggestions: z.array(z.string().min(1).max(600)).max(10),
});

export type AnalysisResult = z.infer<typeof analysisSchema>;
