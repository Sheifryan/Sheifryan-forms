import { createHmac, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type FormField,
  type FormSchema,
  type FormSettings,
  type UploadedFileRef,
  type WebhookConfig,
  type WebhookDelivery,
  type WebhookEvent,
} from "@/lib/schema";

// Server-only webhook delivery engine. Used by:
//  - the submit route  (fires "submission" webhooks per record)
//  - the cron route    (fires "deadline" webhooks once, idempotently)
//  - the test endpoint (fires a "test" webhook so owners can verify endpoints)

const DELIVERY_TIMEOUT_MS = 8000;

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------

/** Turn a stored answer into something human-readable for the payload. */
function resolveAnswerValue(field: FormField, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (field.type === "single_select" || field.type === "dropdown") {
    return field.options?.find((o) => o.id === value)?.label ?? value;
  }
  if (field.type === "multi_select") {
    const ids = Array.isArray(value) ? (value as string[]) : [];
    return ids.map((id) => field.options?.find((o) => o.id === id)?.label ?? id);
  }
  if (field.type === "file") {
    const refs = Array.isArray(value) ? (value as UploadedFileRef[]) : [];
    return refs.map((r) => r.name);
  }
  if (field.type === "checkbox") return Boolean(value);
  return value;
}

interface SubmissionContext {
  responseId: string;
  answers: Record<string, unknown>;
  meta?: Record<string, unknown>;
  createdAt?: string;
}

/** Resolve answers keyed by field id into readable {id, label, value} entries. */
function resolveAnswers(schema: FormSchema, answers: Record<string, unknown>) {
  return schema.fields
    .filter((f) => f.type !== "page_break")
    .map((f) => ({
      id: f.id,
      label: f.label,
      value: resolveAnswerValue(f, answers[f.id]),
    }));
}
export function buildSubmissionPayload(
  form: { id: string; title: string; schema_version?: number },
  schema: FormSchema,
  ctx: SubmissionContext
) {
  return {
    event: "submission",
    form: {
      id: form.id,
      title: form.title,
      schemaVersion: form.schema_version ?? 1,
    },
    response: {
      id: ctx.responseId,
      createdAt: ctx.createdAt ?? new Date().toISOString(),
      answers: ctx.answers,
    },
    fields: resolveAnswers(schema, ctx.answers),
    meta: ctx.meta ?? {},
  };
}

export function buildDeadlinePayload(
  form: { id: string; title: string; closeDate?: string },
  responseCount: number
) {
  return {
    event: "deadline",
    form: {
      id: form.id,
      title: form.title,
      closeDate: form.closeDate ?? null,
    },
    responseCount,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Signature
// ---------------------------------------------------------------------------

export function signWebhookPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Verify an incoming signed payload (for integrators; listed in the docs). */
export function verifyWebhookSignature(secret: string, body: string, signature: string): boolean {
  const expected = signWebhookPayload(secret, body);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

export interface WebhookDeliveryResult {
  ok: boolean;
  statusCode: number | null;
  durationMs: number;
  error?: string;
}

/**
 * Deliver one webhook and record the attempt in webhook_deliveries.
 * Never throws — returns a result object instead, so callers can fire multiple
 * webhooks without one failure dragging down the rest.
 */
export async function deliverWebhook(
  service: SupabaseClient,
  opts: {
    formId: string;
    webhook: WebhookConfig;
    event: WebhookEvent | "test";
    payload: unknown;
  }
): Promise<WebhookDeliveryResult> {
  const { formId, webhook, event, payload } = opts;
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "EasyForm-Webhook/1.0",
    "X-FormCraft-Event": event,
    "X-FormCraft-Webhook-Id": webhook.id,
  };
  if (webhook.secret) {
    headers["X-FormCraft-Signature"] = `sha256=${signWebhookPayload(webhook.secret, body)}`;
  }

  const startedAt = Date.now();
  let result: WebhookDeliveryResult;
  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      cache: "no-store",
    });
    const ok = res.status >= 200 && res.status < 300;
    result = {
      ok,
      statusCode: res.status,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result = {
      ok: false,
      statusCode: null,
      durationMs: Date.now() - startedAt,
      error: message,
    };
  }

  // Record the attempt. Failures to log are non-fatal.
  try {
    await service.from("webhook_deliveries").insert({
      form_id: formId,
      webhook_id: webhook.id,
      event,
      url: webhook.url,
      success: result.ok,
      status_code: result.statusCode,
      duration_ms: result.durationMs,
      error: result.error ?? null,
      payload,
    });
  } catch (e) {
    console.error(`[webhooks] Couldn't log delivery for ${webhook.id}:`, e);
  }

  return result;
}

// Convenience: group configured webhooks by which events fire them.
export function webhooksForEvent(
  settings: FormSettings | null | undefined,
  event: WebhookEvent
): WebhookConfig[] {
  return (settings?.webhooks ?? []).filter((w) => w.enabled && w.events.includes(event));
}

/** Type-guard for parsing a raw settings.webhooks value (from DB JSONB). */
export function parseWebhooks(raw: unknown): WebhookConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (w): w is WebhookConfig =>
      !!w &&
      typeof w === "object" &&
      typeof (w as WebhookConfig).id === "string" &&
      typeof (w as WebhookConfig).url === "string" &&
      Array.isArray((w as WebhookConfig).events)
  );
}

export type { WebhookDelivery };