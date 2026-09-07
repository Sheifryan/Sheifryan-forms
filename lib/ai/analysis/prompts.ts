// System/user prompt builders for the "Ask your data" interpreter. The model
// only ever sees the real field catalogue (ids, labels, types, option labels)
// of the current form — never submissions — and is told to reference those
// exact ids, otherwise the validator (normalize.ts) turns the question into a
// clarification instead of letting the model guess.

import type { FormField } from "@/lib/schema";
import { NON_QUERYABLE_TYPES } from "./display";

export interface AskSchemaView {
  title: string;
  description?: string;
  totalResponses: number;
  fields: FormField[];
}

const TYPE_GUIDE: Record<string, string> = {
  short_text: "a short typed answer (e.g. a name)",
  long_text: "a paragraph answer",
  email: "an email address",
  phone: "a phone number",
  number: "a numeric value",
  url: "a link",
  single_select: "one option picked from a list",
  multi_select: "one or more options picked from a list",
  dropdown: "one option picked from a dropdown",
  rating: "a 1–5 rating",
  date: "a calendar date",
  time: "a clock time",
  checkbox: "a yes/no consent-style statement",
};

export function describeAskFields(fields: FormField[]): string {
  return fields
    .filter((f) => f.type !== "page_break")
    .map((f) => {
      const opts = (f.options ?? []).map((o) => o.label).join(" | ");
      const nonQueryable = NON_QUERYABLE_TYPES.has(f.type)
        ? " (can be listed in results, but never used as a filter)"
        : "";
      return (
        `- id: ${f.id}\n  label: ${f.label}\n  type: ${f.type} — ${TYPE_GUIDE[f.type] ?? f.type}` +
        (opts ? `\n  options: ${opts}` : "") +
        nonQueryable
      );
    })
    .join("\n");
}

export function buildAskPrompt(view: AskSchemaView, question: string): { system: string; user: string } {
  const system = `You translate a form owner's plain-English question about their OWN form submissions into one
strict JSON "operation" object. You never see or guess the actual submissions — you only plan a query
against the form's fields.

FORM SCHEMA (fields are the ONLY things you may reference — never invent a field):
${describeAskFields(view.fields)}

RULES
- Reference fields by their exact "id" when you can; otherwise use the exact label text.
- For filter values on a choice field (single_select / multi_select / dropdown), use the option's
  label exactly as listed under "options" — the system will match it to the stored id.
- OPERATIONS and their JSON shapes:

1. COUNT — "How many people registered?"
   { "operation": "count" }
   Add "conditions" when the question asks for a subset.

2. LIST — "Show everyone who plays football", "Who didn't provide a phone number?"
   { "operation": "list", "select": ["<field ids to show as columns>"], "conditions": [...], "sort": [...] }
   - "select" = the fields whose VALUES the user asked to see (name, phone, position...). Max 8.
   - Omit "select" when the question doesn't name columns.
   - "sort": optional, e.g. [{"field":"age","direction":"desc"}].

3. GROUP — "How many people are in each position?"
   { "operation": "group", "groupBy": "<field id>" }
   Counts submissions per category of that field.

4. AGGREGATE — "What is the average age?"
   { "operation": "aggregate", "function": "avg", "field": "<numeric field id>" }
   function is one of avg | sum | min | max | count (count needs no field).

5. COMPARE — "Compare male and female registrations."
   { "operation": "compare", "compareBy": "<field id like gender>" }
   Optional metric: { "operation": "compare", "compareBy": "gender", "metric": { "function": "avg", "field": "age" } }

6. SUMMARY — "Summarize the responses." / "What are the most common answers?"
   { "operation": "summary" }

CONDITIONS use this shape:
   { "field": "<field id or label>", "operator": "equals|not_equals|contains|not_contains|greater_than|less_than|greater_than_or_equal|less_than_or_equal|between|one_of|is_empty|is_not_empty", "value": "...", "value2": "...(for between)", "values": ["..."] }
   - between needs value AND value2 (e.g. age between 18 and 25).
   - is_empty / is_not_empty take no value (e.g. phone number missing).
   - "contains" matches text or a selected option.

CLARIFICATION
- If the question can't be answered from this schema (references a field that doesn't exist, e.g. asking
  about "location" when the form has none, or "qualified" with no qualification field), reply:
  { "operation": "clarify", "clarification": "A short, friendly message telling the owner what the form DOES capture and asking them to rephrase." }
- If a needed word could be several fields, pick the closest one; only clarify when truly impossible.
- Never filter on file-upload or payment fields.

Reply with ONLY the JSON object. No markdown, no commentary.`;

  const user = `Form: ${view.title}${view.description ? `\nDescription: ${view.description}` : ""}
Submissions so far: ${view.totalResponses}

Question: "${question}"

Return the JSON operation.`;
  return { system, user };
}
