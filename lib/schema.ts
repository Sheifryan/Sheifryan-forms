import { z } from "zod";

// ---- Field type catalogue -------------------------------------------------
// Every field the builder can place, and every field the renderer knows how
// to draw, comes from this list. Adding a new field type means adding one
// entry here + one case in FormRenderer + one case in FieldEditor.

export const FIELD_TYPES = [
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
  "page_break",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

// page_break is structural (splits the form into pages) — it carries no
// answer value, so it's excluded from validation everywhere below.
export const STRUCTURAL_TYPES: FieldType[] = ["page_break"];

export const FIELD_LABELS: Record<FieldType, string> = {
  short_text: "Text",
  long_text: "Paragraph",
  email: "Email",
  phone: "Phone",
  number: "Number",
  url: "URL",
  single_select: "Radio buttons",
  multi_select: "Checkboxes",
  dropdown: "Dropdown",
  rating: "Rating",
  date: "Date",
  time: "Time",
  checkbox: "Checkbox",
  file: "File upload",
  page_break: "Page Break",
};

// Grouping used purely for organizing the field palette in the builder UI.
export const FIELD_GROUPS: { label: string; types: FieldType[] }[] = [
  { label: "Basic", types: ["short_text", "long_text", "email", "phone", "number", "url"] },
  { label: "Choice", types: ["single_select", "multi_select", "dropdown", "rating"] },
  { label: "Date & media", types: ["date", "time", "file"] },
  { label: "Other", types: ["checkbox"] },
  { label: "Layout", types: ["page_break"] },
];

export interface ConditionRule {
  fieldId: string;
  operator: "equals" | "not_equals" | "contains";
  value: string;
}

export interface FieldOption {
  id: string;
  label: string;
}

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  helpText?: string;
  placeholder?: string;
  required: boolean;
  options?: FieldOption[]; // single_select / multi_select
  showIf?: ConditionRule[]; // ALL rules must pass (AND) to show this field
  fileConfig?: FileFieldConfig; // file upload field limits
}

export interface FormSchema {
  fields: FormField[];
}

export interface FormSettings {
  confirmationMessage: string;
  redirectUrl?: string;
  notifyEmail?: string;
  allowMultiple: boolean;
  limitResponses: boolean;
  maxResponses: number;
  closeOnDate: boolean;
  closeDate?: string;
  passwordProtected: boolean;
}

export const defaultSettings: FormSettings = {
  confirmationMessage: "Thanks — your response has been recorded.",
  redirectUrl: "",
  notifyEmail: "",
  allowMultiple: true,
  limitResponses: false,
  maxResponses: 100,
  closeOnDate: false,
  closeDate: "",
  passwordProtected: false,
};

// ---- File upload field configuration --------------------------------------
// Lives on the field itself (FormField.fileConfig) so each upload field can
// have its own allowed types / per-file size / count limits.

export interface FileFieldConfig {
  /** Allowed MIME types and/or extensions ("image/*", ".pdf"); empty = any. */
  accept: string[];
  /** Per-file maximum size in megabytes. */
  maxSizeMb: number;
  /** Maximum number of files a respondent can attach to this field. */
  maxFiles: number;
}

export const defaultFileConfig = (): FileFieldConfig => ({
  accept: [],
  maxSizeMb: 10,
  maxFiles: 1,
});

/** A reference to an uploaded file, stored as the field's answer value. */
export interface UploadedFileRef {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

// Case-insensitive accept-rule matcher shared by the renderer (client-side
// checks) and the upload API (the authoritative check). Supports wildcard
// mime types ("image/*") and extension rules (".pdf"). A missing/empty accept
// list means "any file".
export function fileMatchesAccept(accept: string[] | undefined, mimeType: string, fileName: string): boolean {
  const rules = (accept ?? []).filter((a) => a && a.trim().length > 0);
  if (rules.length === 0) return true;
  const ext = "." + (fileName.split(".").pop() ?? "").toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  return rules.some((rule) => {
    const r = rule.trim().toLowerCase();
    if (r === "*" || r === "*/*") return true;
    if (r.endsWith("/*")) return lowerMime.startsWith(r.slice(0, -1));
    if (r.startsWith(".")) return ext === r;
    return lowerMime === r;
  });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 || val >= 10 ? 0 : 1)} ${units[i]}`;
}

// Accent theme presets. Applied via a CSS custom property (--accent) rather
// than pre-baked Tailwind class strings, so any component can opt in with
// e.g. className="bg-[var(--accent)]" regardless of which theme is active.
export const THEMES = {
  plum: { label: "Plum", hex: "#6D28D9" },
  indigo: { label: "Indigo", hex: "#4F46E5" },
  teal: { label: "Teal", hex: "#0D9488" },
  rose: { label: "Rose", hex: "#E11D48" },
  amber: { label: "Amber", hex: "#F59E0B" },
} as const;
export type ThemeKey = keyof typeof THEMES;
export const DEFAULT_THEME: ThemeKey = "plum";

// Split a flat field list into pages at each page_break marker. The first
// page has no explicit title (falls back to the form title in the UI).
export function splitIntoPages(fields: FormField[]): { title: string | null; fields: FormField[] }[] {
  const pages: { title: string | null; fields: FormField[] }[] = [{ title: null, fields: [] }];
  for (const f of fields) {
    if (f.type === "page_break") {
      pages.push({ title: f.label, fields: [] });
    } else {
      pages[pages.length - 1].fields.push(f);
    }
  }
  return pages;
}

// ---- Dynamic Zod schema generation -----------------------------------------
// One place that turns a FormField[] into a validator. Used both client-side
// (instant feedback) and server-side (the only copy that's actually trusted).

export function zodSchemaForField(field: FormField): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  switch (field.type) {
    case "page_break":
      // structural marker, not a real input — always passes
      return z.any().optional();
    case "email":
      schema = z.string().email("Enter a valid email address");
      break;
    case "url":
      schema = z.string().url("Enter a valid URL");
      break;
    case "phone":
      schema = z.string().min(7, "Enter a valid phone number");
      break;
    case "number":
      schema = z.coerce.number({ invalid_type_error: "Enter a number" });
      break;
    case "rating":
      schema = z.coerce.number().min(1).max(5, "Rating must be between 1 and 5");
      break;
    case "checkbox":
      schema = z.boolean();
      break;
    case "multi_select":
      schema = z.array(z.string());
      break;
    case "date":
      schema = z.string().refine((v) => !isNaN(Date.parse(v)), "Enter a valid date");
      break;
    case "time":
      schema = z.string().regex(/^\d{2}:\d{2}$/, "Enter a valid time");
      break;
    case "file": {
      const cfg = field.fileConfig ?? defaultFileConfig();
      schema = z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            mimeType: z.string(),
            sizeBytes: z.number(),
          })
        )
        .max(cfg.maxFiles, `You can attach at most ${cfg.maxFiles} file${cfg.maxFiles === 1 ? "" : "s"}.`);
      break;
    }
    case "single_select":
    case "dropdown":
    case "short_text":
    case "long_text":
    default:
      schema = z.string();
      break;
  }

  if (!field.required) {
    schema = schema.optional().or(z.literal(""));
  } else if (field.type !== "checkbox" && field.type !== "multi_select") {
    schema =
      (schema as z.ZodString).refine?.(
        (v) => v !== undefined && v !== null && String(v).length > 0,
        "This field is required"
      ) ?? schema;
  }

  return schema;
}

export function zodSchemaForForm(schema: FormSchema) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of schema.fields) {
    shape[field.id] = zodSchemaForField(field);
  }
  return z.object(shape);
}

// Evaluate conditional visibility rules against current answers.
export function isFieldVisible(field: FormField, answers: Record<string, unknown>): boolean {
  if (!field.showIf || field.showIf.length === 0) return true;
  return field.showIf.every((rule) => {
    const actual = answers[rule.fieldId];
    const actualStr = Array.isArray(actual) ? actual.join(",") : String(actual ?? "");
    switch (rule.operator) {
      case "equals":
        return actualStr === rule.value;
      case "not_equals":
        return actualStr !== rule.value;
      case "contains":
        return actualStr.includes(rule.value);
      default:
        return true;
    }
  });
}

// Server-side: re-validate a submission against the schema, respecting
// conditional visibility (a hidden required field should not block submit).
export function validateSubmission(
  schema: FormSchema,
  answers: Record<string, unknown>
): { success: true; data: Record<string, unknown> } | { success: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const data: Record<string, unknown> = {};

  for (const field of schema.fields) {
    if (field.type === "page_break") continue;
    const visible = isFieldVisible(field, answers);
    if (!visible) continue;

    const validator = zodSchemaForField(field);
    const result = validator.safeParse(answers[field.id]);
    if (!result.success) {
      errors[field.id] = result.error.errors[0]?.message ?? "Invalid value";
    } else {
      data[field.id] = result.data;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }
  return { success: true, data };
}
