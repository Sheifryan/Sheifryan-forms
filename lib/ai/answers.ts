// Renders stored response answers into human labels for the AI, and builds a
// compact "digest" of submissions. Personal data (emails, phone numbers, file
// contents) is deliberately withheld before anything leaves the server.

import type { FormField } from "@/lib/schema";

function isAnswered(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** One answer value as a readable label (option ids resolved). */
export function answerToLabel(field: FormField, value: unknown): string {
  if (!isAnswered(value)) return "";
  switch (field.type) {
    case "single_select":
    case "dropdown":
      return field.options?.find((o) => o.id === value)?.label ?? String(value);
    case "multi_select": {
      const arr = Array.isArray(value) ? value : [];
      return arr
        .map((id) => field.options?.find((o) => o.id === id)?.label ?? String(id))
        .join(", ");
    }
    case "checkbox":
      return value ? "Yes" : "No";
    case "rating":
      return Number.isFinite(Number(value)) ? `${Number(value)}/5` : String(value);
    case "file": {
      const n = Array.isArray(value) ? value.length : 0;
      return n > 0 ? `${n} file(s) attached` : "";
    }
    case "email":
      return "[email withheld]";
    case "phone":
      return "[phone withheld]";
    case "payment":
      return "[payment details withheld]";
    default:
      return String(value);
  }
}

export interface FieldDigest {
  label: string;
  type: string;
  answered: number;
  note?: string;
  distribution?: { label: string; count: number }[];
  min?: number;
  max?: number;
  avg?: number;
  /** Recent paragraph answers (truncated), useful for quoting. */
  samples?: string[];
}

export interface ResponseDigest {
  total: number;
  from?: string;
  to?: string;
  fields: FieldDigest[];
}

const CHOICE_TYPES = new Set(["single_select", "multi_select", "dropdown"]);
const SAMPLE_LIMIT = 30;
const SAMPLE_CHARS = 240;

interface RawResponse {
  answers: Record<string, unknown>;
  created_at: string;
}

/**
 * Aggregate a set of responses (newest-first) into a compact, PII-free digest
 * the analysis prompt can work with.
 */
export function buildResponseDigest(fields: FormField[], responses: RawResponse[]): ResponseDigest {
  const total = responses.length;
  const digest: ResponseDigest = {
    total,
    fields: [],
    from: responses.length ? responses[responses.length - 1]?.created_at : undefined,
    to: responses.length ? responses[0]?.created_at : undefined,
  };

  for (const field of fields) {
    if (field.type === "page_break") continue;

    const entry: FieldDigest = { label: field.label, type: field.type, answered: 0 };

    if (field.type === "email" || field.type === "phone") {
      entry.note = `values withheld for privacy; ${
        field.type === "email" ? "email" : "phone"
      } answers only counted`;
      for (const r of responses) if (isAnswered(r.answers[field.id])) entry.answered++;
      digest.fields.push(entry);
      continue;
    }
    if (field.type === "file") {
      let fileTotal = 0;
      for (const r of responses) {
        const v = r.answers[field.id];
        if (Array.isArray(v)) {
          if (v.length > 0) entry.answered++;
          fileTotal += v.length;
        }
      }
      entry.note = `${fileTotal} file(s) across ${entry.answered} response(s) — filenames withheld`;
      digest.fields.push(entry);
      continue;
    }
    if (field.type === "payment") {
      for (const r of responses) if (isAnswered(r.answers[field.id])) entry.answered++;
      entry.note = "payment answers withheld";
      digest.fields.push(entry);
      continue;
    }

    const answeredValues: unknown[] = [];
    for (const r of responses) {
      const v = r.answers[field.id];
      if (isAnswered(v)) {
        answeredValues.push(v);
        entry.answered++;
      }
    }

    if (CHOICE_TYPES.has(field.type) || field.type === "rating") {
      const counts = new Map<string, number>();
      for (const v of answeredValues) {
        if (Array.isArray(v)) {
          for (const id of v) {
            const label = field.options?.find((o) => o.id === id)?.label ?? String(id);
            counts.set(label, (counts.get(label) ?? 0) + 1);
          }
        } else {
          const label =
            field.type === "rating"
              ? `${Number(v)}/5`
              : field.options?.find((o) => o.id === v)?.label ?? String(v);
          counts.set(label, (counts.get(label) ?? 0) + 1);
        }
      }
      entry.distribution = [...counts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
    } else if (field.type === "number") {
      const nums = answeredValues.map((v) => Number(v)).filter((n) => Number.isFinite(n));
      if (nums.length > 0) {
        entry.min = Math.min(...nums);
        entry.max = Math.max(...nums);
        entry.avg = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
      }
    } else if (field.type === "long_text" || field.type === "short_text") {
      const samples: string[] = [];
      for (const v of answeredValues) {
        const text = String(v).trim();
        if (!text) continue;
        samples.push(text.length > SAMPLE_CHARS ? `${text.slice(0, SAMPLE_CHARS)}…` : text);
        if (samples.length >= SAMPLE_LIMIT) break;
      }
      if (samples.length > 0) entry.samples = samples;
    }

    digest.fields.push(entry);
  }

  return digest;
}
