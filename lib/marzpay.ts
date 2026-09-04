import { createHmac, timingSafeEqual } from "crypto";
import { computePaymentCharge, type PaymentAnswer, type PaymentCurrency, type PaymentFieldConfig } from "@/lib/schema";

// Server-only MarzPay integration.
// Docs: https://wallet.wearemarz.com/documentation
// Base:  https://wallet.wearemarz.com/api/v1
// Auth:  HTTP Basic base64(api_key:api_secret)

const BASE = process.env.MARZPAY_API_BASE || "https://wallet.wearemarz.com/api/v1";
const TIMEOUT_MS = 10000;

export function marzpayConfigured(): boolean {
  return Boolean(process.env.MARZPAY_API_KEY && process.env.MARZPAY_API_SECRET);
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${process.env.MARZPAY_API_KEY ?? ""}:${process.env.MARZPAY_API_SECRET ?? ""}`).toString(
    "base64"
  )}`;
}

async function marzpayFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  const data = (await res.json().catch(() => ({}))) as {
    status?: string;
    message?: string;
    error_code?: string;
    errors?: Record<string, string[]>;
    data?: T;
  };

  if (!res.ok || data.status === "error") {
    // MarzPay errors carry a short `message`, an `error_code`, and for
    // request-validation failures per-field `errors`. Surface the first
    // concrete field error so generic "Validation failed"-style responses are
    // never mistaken for a credentials problem (UNAUTHORIZED is the bad
    // api key/secret code).
    let message = data.message || data.error_code || `MarzPay HTTP ${res.status}`;
    const details = data.errors
      ? Object.entries(data.errors)
          .slice(0, 3)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v[0] : String(v)}`)
          .join(", ")
      : "";
    if (details) message = `${message} (${data.error_code ?? "VALIDATION_ERROR"} — ${details})`;
    else if (data.error_code && !message.includes(data.error_code)) message = `${message} (${data.error_code})`;

    const err = new Error(message) as Error & {
      statusCode?: number;
      errorCode?: string;
    };
    err.statusCode = res.status;
    err.errorCode = data.error_code;
    throw err;
  }
  return (data.data ?? data) as T;
}

export interface InitiateCollectionOpts {
  amountUgx: number;
  phoneNumber: string;
  reference: string;
  description?: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>[];
}

export interface InitiatedCollection {
  transaction: {
    uuid: string;
    reference: string;
    status: string;
    provider_reference?: string | null;
  };
  collection?: {
    amount?: { formatted?: string; raw?: number; currency?: string };
    provider?: string;
    phone_number?: string;
    mode?: string;
  };
  redirect_url?: string;
  metadata?: Record<string, unknown>;
}

/** Initiate a mobile-money collection with MarzPay. Amount is always UGX. */
export async function initiateCollection(opts: InitiateCollectionOpts): Promise<InitiatedCollection> {
  const body: Record<string, unknown> = {
    amount: Math.round(opts.amountUgx),
    phone_number: opts.phoneNumber,
    reference: opts.reference,
    country: "UG",
    method: "mobile_money",
    description: opts.description || undefined,
    callback_url: opts.callbackUrl || undefined,
  };
  const metadata = opts.metadata ?? [];
  if (metadata.length > 0) body.metadata = metadata;

  return marzpayFetch<InitiatedCollection>("/collect-money", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface CollectionStatus {
  event_type?: string;
  status?: string;
  transaction?: {
    uuid?: string;
    reference?: string;
    status?: string;
    amount?: { formatted?: string; raw?: number; currency?: string };
    provider?: string;
    phone_number?: string;
    description?: string;
  };
  collection?: {
    provider?: string;
    provider_transaction_id?: string | null;
    mode?: string;
    phone_number?: string;
  };
}

/** GET /collect-money/{uuid} — live status for a transaction. */
export async function getCollectionStatus(transactionUuid: string): Promise<CollectionStatus> {
  return marzpayFetch<CollectionStatus>(`/collect-money/${transactionUuid}`);
}

/** Build a PaymentAnswer snapshot from a successful initiation. */
export function buildPaymentAnswer(input: {
  reference: string;
  transactionId: string;
  currency: PaymentCurrency;
  amount: number;
  usdToUgxRate: number | null;
  taxRate: number;
  method: string;
  phoneNumber: string;
  description?: string;
}): PaymentAnswer {
  const charge = computePaymentCharge(input.amount, input.currency, input.usdToUgxRate ?? 1, input.taxRate);
  return {
    provider: "marzpay",
    status: "processing",
    reference: input.reference,
    transactionId: input.transactionId,
    providerTransactionId: null,
    currency: input.currency,
    amount: input.amount,
    amountUgx: charge.amountUgx,
    usdToUgxRate: input.currency === "USD" ? input.usdToUgxRate : null,
    taxRate: input.taxRate,
    taxUgx: charge.taxUgx,
    totalUgx: charge.totalUgx,
    method: input.method,
    phoneNumber: input.phoneNumber,
    description: input.description,
    country: "UG",
    createdAt: new Date().toISOString(),
  };
}

/** Normalize a MarzPay webhook status string into our PaymentStatus. */
export function normalizePaymentStatus(
  s: string | undefined
): "pending" | "processing" | "completed" | "failed" | "cancelled" {
  switch ((s ?? "").toLowerCase()) {
    case "completed":
    case "success":
      return "completed";
    case "failed":
    case "failure":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "pending":
      return "pending";
    default:
      return "processing";
  }
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// Header:  X-MarzPay-Signature: t={ts},v1={hmac_sha256_hex}
// Signed:  "{ts}.{raw_json_body}"
// ---------------------------------------------------------------------------

/** Verify a MarzPay webhook HMAC. `header` is the raw X-MarzPay-Signature value. */
export function verifyMarzpayWebhook(secret: string, rawBody: string, header: string | null): boolean {
  if (!secret || !header) return false;
  const { t, v1 } = parseMarzpaySignatureHeader(header);
  if (!t || !v1) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Split the X-MarzPay-Signature header ("t=..,v1=..") into parts. */
export function parseMarzpaySignatureHeader(header: string | null): { t?: string; v1?: string } {
  if (!header) return {};
  const parts: { t?: string; v1?: string } = {};
  for (const piece of header.split(",")) {
    const eq = piece.indexOf("=");
    if (eq === -1) continue;
    const k = piece.slice(0, eq).trim();
    const v = piece.slice(eq + 1).trim();
    if (k === "t") parts.t = v;
    if (k === "v1") parts.v1 = v;
  }
  return parts;
}

export { computePaymentCharge };
export type { PaymentFieldConfig };
