// Best-effort DB cache for identical "ask your data" questions. Repeat
// questions on unchanged data are served instantly with zero AI calls.
// Cache is advisory: every failure is swallowed and the fresh result used.

import { createHash } from "crypto";
import type { NormalizedAskQuery, StructuredAnswer } from "./types";

export interface CachePayload {
  v: 1;
  answer: StructuredAnswer;
  query: NormalizedAskQuery | null;
}

export interface CacheRow {
  answer: StructuredAnswer;
  query: NormalizedAskQuery | null;
  model: string;
  question: string;
}

export interface CacheFingerprint {
  schemaVersion: number;
  responseCount: number;
  latestResponseAt: string | null;
}

export function questionHash(question: string): string {
  return createHash("sha256").update(question.trim().toLowerCase().replace(/\s+/g, " ")).digest("hex");
}

/** Normalize a possibly old-shaped cache row into the current payload shape. */
function parsePayload(raw: unknown): { answer: StructuredAnswer; query: NormalizedAskQuery | null } {
  if (raw && typeof raw === "object" && (raw as { v?: number }).v === 1) {
    const p = raw as unknown as CachePayload;
    return { answer: p.answer, query: p.query ?? null };
  }
  return { answer: raw as StructuredAnswer, query: null };
}

/**
 * Read a cached structured answer. `db` is the service client (bypasses RLS —
 * we already verified ownership before calling this).
 */
export async function getCachedAnswer(
  db: { from: (table: string) => any },
  formId: string,
  question: string,
  fp: CacheFingerprint,
  model: string
): Promise<CacheRow | null> {
  try {
    const { data } = await db
      .from("form_ask_cache")
      .select("answer, model, question")
      .eq("form_id", formId)
      .eq("question_hash", questionHash(question))
      .eq("schema_version", fp.schemaVersion)
      .eq("response_count", fp.responseCount)
      .eq("latest_response_at", fp.latestResponseAt ?? "1970-01-01T00:00:00.000Z")
      .maybeSingle();
    if (!data) return null;
    const { answer, query } = parsePayload((data as { answer: unknown }).answer);
    return {
      answer,
      query,
      model: (data as { model: string | null }).model ?? model,
      question: (data as { question: string }).question,
    };
  } catch (err) {
    console.error("[ask] cache read skipped:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function putCachedAnswer(
  db: { from: (table: string) => any },
  formId: string,
  question: string,
  fp: CacheFingerprint,
  model: string,
  payload: CachePayload
): Promise<void> {
  try {
    await db.from("form_ask_cache").upsert(
      {
        form_id: formId,
        question_hash: questionHash(question),
        question: question.slice(0, 500),
        schema_version: fp.schemaVersion,
        response_count: fp.responseCount,
        latest_response_at: fp.latestResponseAt ?? "1970-01-01T00:00:00.000Z",
        model,
        answer: payload,
      },
      { onConflict: "form_id,question_hash", ignoreDuplicates: false }
    );
  } catch (err) {
    console.error("[ask] cache write skipped:", err instanceof Error ? err.message : err);
  }
}
