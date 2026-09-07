// Result narration. The AI never receives raw rows — only sanitized aggregates
// (counts, group labels, computed stats) — so a narrative sentence can't leak
// PII or invent row-level detail. Table contents themselves always come from
// the database, not the model.

import { z } from "zod";
import type { StructuredAnswer } from "./types";

export const narrationSchema = z.object({
  explanation: z.string().min(1).max(600),
});

export type NarrationResult = z.infer<typeof narrationSchema>;

export interface NarrationView {
  formTitle: string;
  question: string;
  operation: string;
  /** Column/field labels involved (labels only, never row values). */
  fields: string[];
  /** True numbers only — the model may cite these verbatim. */
  numbers: { label: string; value: number }[];
  /** Category breakdown labels + counts (group/compare). */
  breakdown?: { label: string; count: number }[];
  /** Summary cards already computed server-side. */
  summaryItems?: { label: string; detail: string }[];
}

/** Which answer types benefit from an AI-written narrative sentence. */
export function shouldNarrate(answer: StructuredAnswer): boolean {
  return answer.type === "chart" || answer.type === "summary";
}

export function buildNarrationPrompt(view: NarrationView): { system: string; user: string } {
  const system = `You write ONE short, accurate, human-friendly sentence (max 60 words) that explains the owner's
data-analysis result. The owner asked in plain English about their own form submissions.

HARD RULES
- Only state numbers that were given to you in the "numbers" or "breakdown" lists. Never invent counts,
  percentages or rows.
- Do not mention raw submission contents (names, emails, phones or free text) — you never saw any.
- Do not write lists or markdown. One sentence.
- Reply with JSON: { "explanation": "..." }`;

  const user = JSON.stringify(view, null, 2);
  return { system, user };
}
