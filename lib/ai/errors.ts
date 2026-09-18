// Turns AI-contract failures into something a form owner can act on.
//
// A failed Zod parse used to reach the UI as `err.message` — and for a
// ZodError that IS the JSON-serialised issue array, so the builder's AI tab
// showed a wall of {"code":"too_small",...,"path":["fields",0,"options"]}
// instead of a sentence. Genuine provider faults (bad key, timeout, rate
// limit) are already written for humans, so those pass through untouched.
//
// Companion: lib/schema-errors.ts does the same job for database errors.

import { z } from "zod";

/**
 * A user-facing message for a failed AI call.
 *
 * @param err      whatever the route caught
 * @param fallback used when the failure isn't an Error at all
 */
export function aiErrorMessage(err: unknown, fallback = "The AI request failed. Try again."): string {
  if (err instanceof z.ZodError) {
    const issue = err.issues[0];
    const path = issue?.path.join(".") ?? "";
    if (/options$/.test(path)) {
      return "The AI replied with a choice question that had no options, so the reply couldn't be used. Try again.";
    }
    return `The AI's reply didn't match the expected structure${
      path ? ` (${path})` : ""
    }. Try again — a retry usually fixes it.`;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
