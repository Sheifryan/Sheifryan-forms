// Regression cover for the AI field contract.
//
// The model reliably echoes `"options": []` on non-choice fields even when the
// prompt asks it not to. `.optional()` forgives a MISSING key, never an empty
// array, so each of those fields failed `.min(1)` and the whole "Improve form"
// reply was rejected — twice, because the retry nudge said nothing useful — and
// the route surfaced the raw Zod issue array ({"code":"too_small", ...,
// "path":["fields",0,"options"]}) in the builder's AI tab.
//
// These tests pin both halves of the fix: the normalisation that stops the
// rejection, and the sentence users see instead of that JSON.

import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { fieldOutputSchema, improveSchema, normalizeGeneratedFields } from "../../lib/ai/contracts";
import { aiErrorMessage } from "../../lib/ai/errors";

/** A minimal model-shaped field; override whatever the case under test needs. */
function field(overrides: Record<string, unknown> = {}) {
  return { type: "short_text", label: "Full name", required: true, ...overrides };
}

test("options: [] on a non-choice field is treated as absent", () => {
  const parsed = fieldOutputSchema.parse(field({ options: [] }));
  assert.equal(parsed.options, undefined);
});

test("options: [] on a choice field is accepted and falls back to two labels", () => {
  const parsed = fieldOutputSchema.parse(field({ type: "dropdown", label: "Campus", options: [] }));
  assert.equal(parsed.options, undefined);

  const [built] = normalizeGeneratedFields([parsed]);
  assert.equal(built.type, "dropdown");
  assert.equal(built.options?.length, 2);
});

test("real option labels are kept, trimmed, and blanks dropped", () => {
  const parsed = fieldOutputSchema.parse(
    field({ type: "single_select", label: "Faculty", options: ["  Engineering ", "", "   ", "Law"] })
  );
  assert.deepEqual(parsed.options, ["Engineering", "Law"]);
});

test("an options list made only of blanks counts as absent", () => {
  const parsed = fieldOutputSchema.parse(field({ options: ["", "  "] }));
  assert.equal(parsed.options, undefined);
});

test("genuinely broken options are still rejected", () => {
  assert.throws(() => fieldOutputSchema.parse(field({ options: "Yes,No" })));
  assert.throws(() => fieldOutputSchema.parse(field({ options: [1, 2] })));
  const thirteen = Array.from({ length: 13 }, (_, i) => `Option ${i + 1}`);
  assert.throws(() => fieldOutputSchema.parse(field({ options: thirteen })));
});

test("an unknown field type is still rejected", () => {
  assert.throws(() => fieldOutputSchema.parse(field({ type: "bogus" })));
});

test("the model's real reply shape now parses end to end", () => {
  const reply = {
    summary: "Tightened the wording and added Other to the choice questions.",
    fields: [
      field({ id: "f1", label: "Full name", options: [] }),
      field({ id: "f2", type: "email", label: "Email address", options: [] }),
      field({ id: "f3", type: "number", label: "Age", options: [] }),
      field({ id: "f4", type: "dropdown", label: "Campus", options: ["Main", "City"] }),
      field({ id: "f5", type: "rating", label: "Overall satisfaction", options: [] }),
    ],
  };

  const parsed = improveSchema.parse(reply);
  assert.equal(parsed.fields.length, 5);

  const built = normalizeGeneratedFields(parsed.fields);
  assert.equal(built[3].options?.length, 2);
  assert.equal(built[3].options?.[0].label, "Main");
  assert.equal(built[4].options, undefined);
});

test("a Zod failure on options becomes a sentence, never JSON", () => {
  let err: unknown;
  try {
    fieldOutputSchema.parse(field({ options: "Yes,No" }));
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof z.ZodError);

  const message = aiErrorMessage(err, "fallback");
  assert.match(message, /options/);
  assert.doesNotMatch(message, /too_small|invalid_type|\{"code"/);
});

test("other contract failures name the offending path", () => {
  let err: unknown;
  try {
    fieldOutputSchema.parse(field({ type: "bogus" }));
  } catch (e) {
    err = e;
  }
  const message = aiErrorMessage(err, "fallback");
  assert.match(message, /didn't match the expected structure/);
  assert.match(message, /type/);
});

test("provider errors pass through; non-errors use the route fallback", () => {
  assert.equal(
    aiErrorMessage(new Error("AI provider error (HTTP 401)"), "fallback"),
    "AI provider error (HTTP 401)"
  );
  assert.equal(aiErrorMessage(null, "The AI analysis failed. Try again."), "The AI analysis failed. Try again.");
  assert.equal(aiErrorMessage(undefined), "The AI request failed. Try again.");
});
