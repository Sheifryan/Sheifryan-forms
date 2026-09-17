// Server-only client for any OpenAI-compatible chat API (DeepSeek, OpenRouter,
// Groq, Together, ...). The AI_* values are read from .env and must never be
// prefixed with NEXT_PUBLIC_, or the API key leaks into the browser bundle.

import { z } from "zod";

const DEFAULT_BASE = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";

export function aiConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY && process.env.AI_BASE_URL);
}

/** One part of a multimodal message (OpenAI-compatible shape). */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface JsonMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

/** A base64 image as an OpenAI-compatible `image_url` content part. */
export function imagePart(mimeType: string, base64: string): ContentPart {
  return { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } };
}

/**
 * A concrete hint to send back after a failed validation, so the single retry
 * can actually converge.
 *
 * The old wording ("didn't match the required structure") told the model
 * nothing: it repeated the same mistake — most often `"options": []` on every
 * non-choice field — so attempt two was rejected as well and the route
 * surfaced a raw Zod issue array to the user.
 */
function describeContractFailure(err: unknown): string {
  if (!(err instanceof z.ZodError)) return "";
  const issue = err.issues[0];
  if (!issue) return "";
  const path = issue.path.join(".");
  if (/options$/.test(path)) {
    return (
      `Problem: ${path} — "options" must be a non-empty array of short labels on ` +
      "single_select / multi_select / dropdown, and must be OMITTED entirely on every other type."
    );
  }
  if (/type$/.test(path)) {
    return `Problem: ${path} — "type" is not one of the allowed field types (see the catalogue).`;
  }
  return `Problem: ${path || "(root)"} — ${issue.message}.`;
}

/**
 * Ask the model to reply with a strict JSON object. When a zod `schema` is
 * given the reply is validated against it, and one automatic retry is made if
 * the first attempt is malformed or fails validation.
 */
export async function completeJSON<T, I = unknown>(opts: {
  system: string;
  /**
   * A plain string, or content parts when page images ride along (form import).
   * Only the configured model family accepts images — the text-only ones reject
   * them — so the import route is the only caller that sends parts today.
   */
  user: string | ContentPart[];
  /** Per-call model override (e.g. a pinned vision model). */
  model?: string;
  /** Optional zod schema the parsed reply must satisfy. */
  schema?: z.ZodType<T, z.ZodTypeDef, I>;
  temperature?: number;
  maxTokens?: number;
}): Promise<T> {
  const key = process.env.AI_API_KEY;
  if (!key) {
    throw new Error("AI isn't configured. Add AI_API_KEY to your .env file and restart the dev server.");
  }

  const base = (process.env.AI_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
  const model = process.env.AI_MODEL || DEFAULT_MODEL;
  const temperature = opts.temperature ?? 0.3;
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS) || 60_000;

  const messages: JsonMessage[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];

  const request = async (): Promise<string> => {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: opts.model || model,
        messages,
        temperature,
        max_tokens: opts.maxTokens,
        response_format: { type: "json_object" },
        stream: false,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`AI provider error (HTTP ${res.status})${detail ? `: ${detail}` : ""}`);
    }

    const data: unknown = await res.json().catch(() => null);
    const content: unknown = (data as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]
      ?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("AI provider returned an empty response.");
    }
    return content.trim();
  };

  const parseStrict = (content: string): T => {
    // Tolerate a model that wraps the JSON in markdown fences anyway.
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const parsed: unknown = JSON.parse(cleaned);
    if (opts.schema) return opts.schema.parse(parsed);
    return parsed as T;
  };

  let content = await request();
  try {
    return parseStrict(content);
  } catch (err) {
    messages.push({ role: "assistant", content });
    const hint = describeContractFailure(err);
    messages.push({
      role: "user",
      content:
        "Your previous reply was not valid JSON (or didn't match the required structure). " +
        (hint ? `${hint} ` : "") +
        "Reply again with ONLY a valid JSON object that matches the requested shape exactly, with no markdown.",
    });
    content = await request();
    return parseStrict(content);
  }
}

/**
 * Tiny in-memory per-user throttle for paid AI calls. Resets on deploy and is
 * not shared across instances — fine as a demo-grade guard against runaway
 * retries/abuse.
 */
const aiCallTimestamps = new Map<string, number[]>();
export function aiRateLimited(userId: string, perMinute = 8): boolean {
  const now = Date.now();
  const timestamps = (aiCallTimestamps.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (timestamps.length >= perMinute) return true;
  timestamps.push(now);
  aiCallTimestamps.set(userId, timestamps);
  return false;
}
