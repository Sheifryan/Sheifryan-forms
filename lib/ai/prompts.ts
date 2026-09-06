// System/user prompt builders for the three AI modes. The model sees your
// exact field catalogue in every prompt, so its output stays within the
// schema the renderer and builder actually understand.

import type { FormField } from "@/lib/schema";
import type { ResponseDigest } from "./answers";

const CATALOGUE = `FIELD CATALOGUE (use these exact "type" values):
- short_text  : a single-line text answer (names, titles)
- long_text   : a multi-line paragraph answer (descriptions, feedback)
- email       : email address (validated)
- phone       : phone number
- number      : numeric value
- url         : a link
- single_select : radio buttons; provide 2-8 short options
- multi_select : checkboxes; provide 2-8 short options
- dropdown    : a dropdown choice list; provide 2-8 short options
- rating      : 1-5 star rating question
- date        : date picker
- time        : time picker
- checkbox    : a single consent-style statement; put the statement text in "label"
- file        : file upload field

RULES:
- Ask questions a real person would want to answer. Combine "Full name" +
  separate "Email" fields rather than one free-text blob.
- Give choice questions concrete, mutually exclusive, short options.
- Mark "required" only for answers you truly need.
- Never invent types outside the catalogue. Never return page_break or payment.
- Every reply is a JSON object. No markdown, no commentary outside the JSON.`;

export function buildGenerationPrompt(prompt: string): { system: string; user: string } {
  const system = `You are an expert form designer. You turn a user's plain-English request into a clean,
high-converting form.

${CATALOGUE}

Reply with JSON in EXACTLY this shape:
{
  "title": "short form title",
  "description": "one-sentence description shown above the form (optional)",
  "confirmationMessage": "short thank-you message shown after submitting (optional)",
  "fields": [
    {
      "type": "one of the catalogue types",
      "label": "question text",
      "required": true or false,
      "helpText": "tiny helper shown under the question (optional)",
      "placeholder": "example answer shown in the box (optional)",
      "options": ["Option A", "Option B"]  // REQUIRED for choice types
    }
  ]
}
Rules: 3 to 15 fields is ideal (unless the user clearly asked for more); logical ordering;
a title that reads naturally; don't invent payment, file-limits or page-break config.`;

  const user = `Build a form for this request:\n\n"${prompt}"`;
  return { system, user };
}

// ---------------------------------------------------------------------------
// Pre-publish critique / improve
// ---------------------------------------------------------------------------

export interface EditableFormShape {
  title: string;
  description?: string;
  fields: FormField[];
}

/** Compact JSON-safe view of a form for the model (option ids become labels). */
export function describeForm(form: EditableFormShape): unknown {
  return {
    title: form.title,
    description: form.description ?? "",
    fields: form.fields.map((f) => ({
      id: f.id,
      type: f.type,
      label: f.label,
      required: f.required,
      helpText: f.helpText ?? "",
      placeholder: f.placeholder ?? "",
      options: (f.options ?? []).map((o) => o.label),
    })),
  };
}

export function buildCritiquePrompt(form: EditableFormShape): { system: string; user: string } {
  const system = `You are a senior form/UX reviewer. Critique the given form draft for real, actionable
problems: duplicate or ambiguous questions, a registration form missing an email field,
required fields that will frustrate respondents, options that overlap or are missing an
"Other", questions better asked as dropdown/rating, missing logical grouping, wording that
is confusing, unnecessary questions that lower completion rates, etc.

Reply with JSON in EXACTLY this shape:
{
  "summary": "2-4 sentence overall assessment",
  "score": 1-10,
  "suggestions": [
    {
      "fieldId": "exact field id from the form when this concerns one question, otherwise omit",
      "severity": "error" | "warning" | "info",
      "message": "what's wrong",
      "suggestion": "what to change, concretely"
    }
  ]
}
Be concrete and specific. No generic filler. Max ~8 suggestions, ordered by importance.`;

  const user = `Review this form draft and return the JSON review:\n\n${JSON.stringify(
    describeForm(form),
    null,
    2
  )}`;
  return { system, user };
}

export function buildImprovePrompt(
  form: EditableFormShape,
  critiqueSummary: string
): { system: string; user: string } {
  const system = `You are an expert form designer improving a draft based on a reviewer's notes.

${CATALOGUE}

Reply with JSON in EXACTLY this shape:
{
  "summary": "what you changed and why",
  "fields": [
    {
      "id": "KEEP the exact field id when you keep/rework an existing question, or omit it for brand-new questions",
      "type": "one of the catalogue types",
      "label": "question text",
      "required": true or false,
      "helpText": "optional",
      "placeholder": "optional",
      "options": ["Option A", "Option B"]  // REQUIRED for choice types
    }
  ]
}
Keep the field order sensible. You may reorder, edit, merge duplicates and add missing
questions, but don't change the purpose of the form the owner described. Never invent
payment or page_break fields.`;

  const user = `Improve this form draft:\n\n${JSON.stringify(
    describeForm(form),
    null,
    2
  )}\n\nReviewer notes to address:\n${critiqueSummary}\n\nReturn the improved JSON.`;
  return { system, user };
}

// ---------------------------------------------------------------------------
// Post-publish response analysis
// ---------------------------------------------------------------------------

export interface AnalyzableForm {
  title: string;
  description?: string;
  digest: ResponseDigest;
}

export function buildAnalysisPrompt(form: AnalyzableForm): { system: string; user: string } {
  const system = `You are an analyst who turns real form submissions into clear, honest insights for the form
owner. The user data below was already sanitized server-side (emails, phone numbers and file
contents are NOT included).

Reply with JSON in EXACTLY this shape:
{
  "headline": "one sentence capturing the most important takeaway",
  "insights": [
    { "label": "short finding title", "detail": "explanation with real numbers from the data" }
  ],
  "trends": ["notable pattern, e.g. 'Rating dropped from 4.2 to 3.6 over the period'"],
  "quotes": [
    { "fieldLabel": "exact question label the quote came from", "text": "a representative short quote" }
  ],
  "suggestions": ["actionable next steps for the owner"]
}
Only report what the data actually supports. Never fabricate numbers.`;

  const user = `Form: ${form.title}${form.description ? `\nDescription: ${form.description}` : ""}

Sanitized response digest (JSON):
${JSON.stringify(form.digest, null, 2)}

Return the JSON analysis.`;
  return { system, user };
}
