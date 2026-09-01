import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { normalizePaymentStatus, verifyMarzpayWebhook } from "@/lib/marzpay";

// MarzPay webhook receiver (`callback_url` on /collect-money, or dashboard
// webhook). Handles collection.completed / collection.failed /
// collection.cancelled. Idempotent: keyed on our UUID reference.

export async function POST(request: Request) {
  const rawBody = await request.text();
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Optional HMAC verification when a webhook secret is configured.
  const secret = process.env.MARZPAY_WEBHOOK_SECRET;
  if (secret && !verifyMarzpayWebhook(secret, rawBody, request.headers.get("X-MarzPay-Signature"))) {
    return NextResponse.json({ ok: false, error: "Signature mismatch" }, { status: 401 });
  }

  // Dashboard-registered webhooks wrap the payload under `data`.
  const payload = body?.data && body.data.transaction ? body.data : body;
  const eventType = (payload?.event_type ?? body?.event_type ?? body?.data?.event_type) as string | undefined;
  const transaction = payload?.transaction ?? {};
  const collection = payload?.collection ?? {};

  const reference = transaction.reference ?? collection.reference ?? null;
  if (!reference) {
    return NextResponse.json({ ok: false, error: "Missing reference" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: payment } = await service
    .from("payments")
    .select("id, reference, response_id, transaction_id, status")
    .eq("reference", reference)
    .maybeSingle();

  if (!payment) {
    // Unknown reference — nothing to reconcile (maybe a test event).
    return NextResponse.json({ ok: true, ignored: true });
  }

  const status = normalizePaymentStatus(eventType?.split(".").pop() || transaction.status);
  const providerTransactionId = collection.provider_transaction_id ?? transaction.provider_reference ?? null;

  const { error: updateError } = await service
    .from("payments")
    .update({
      status,
      provider_transaction_id: providerTransactionId ?? undefined,
      error: status === "failed" || status === "cancelled" ? (payload?.message ?? null) : undefined,
      raw: payload,
    })
    .eq("id", payment.id);

  if (updateError) {
    console.error(`[marzpay] Couldn't update payment ${reference}:`, updateError.message);
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  // Patch the response's JSONB answer so the Submissions view stays in sync.
  if (payment.response_id) {
    await patchResponseAnswer(service, payment.response_id, payment.reference, {
      status,
      providerTransactionId,
      error: status === "failed" || status === "cancelled" ? (payload?.message ?? null) : null,
      updatedAt: new Date().toISOString(),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

async function patchResponseAnswer(
  service: ReturnType<typeof createServiceClient>,
  responseId: string,
  reference: string,
  patch: Record<string, unknown>
) {
  const { data: response } = await service
    .from("responses")
    .select("id, answers")
    .eq("id", responseId)
    .single();
  if (!response) return;

  const answers = (response.answers ?? {}) as Record<string, unknown>;
  for (const [fieldId, value] of Object.entries(answers)) {
    if (value && typeof value === "object" && "reference" in value && (value as any).reference === reference) {
      answers[fieldId] = { ...(value as object), ...patch };
    }
  }
  await service.from("responses").update({ answers }).eq("id", responseId);
}