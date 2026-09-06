// Server-only client for any OpenAI-compatible chat API (DeepSeek, OpenRouter,
// Groq, Together, ...). The AI_* values are read from .env and must never be
// prefixed with NEXT_PUBLIC_, or the API key leaks into the browser bundle.

import { z } from "zod";

const DEFAULT_BASE = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";

export function aiConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY && process.env.AI_BASE_URL);
}

interface JsonMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Ask the model to reply with a strict JSON object. When a zod `schema` is
 * given the reply is validated against it, and one automatic retry is made if
 * the first attempt is malformed or fails validation.
 */
export async function completeJSON<T, I = unknown>(opts: {
  system: string;
  user: string;
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
        model,
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
  } catch {
    messages.push({ role: "assistant", content });
    messages.push({
      role: "user",
      content:
        "Your previous reply was not valid JSON (or didn't match the required structure). " +
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
