import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  validateSubmission,
  computePaymentCharge,
  defaultPaymentConfig,
  type FormField,
  type FormSchema,
  type FormSettings,
  type PaymentAnswer,
  type PaymentCurrency,
  type PaymentFieldConfig,
} from "@/lib/schema";
import {
  buildSubmissionPayload,
  deliverWebhook,
  webhooksForEvent,
} from "@/lib/webhooks";
import { buildPaymentAnswer, initiateCollection, marzpayConfigured } from "@/lib/marzpay";

// Extremely simple in-memory rate limit for demo purposes. Swap for
// Upstash Redis (or similar) before shipping — this resets on every deploy
// and doesn't work across multiple server instances.
const submitTimestamps = new Map<string, number[]>();
const RATE_LIMIT = 5; // submissions
const RATE_WINDOW_MS = 60_000; // per minute, per IP+form

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = (submitTimestamps.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  timestamps.push(now);
  submitTimestamps.set(key, timestamps);
  return timestamps.length > RATE_LIMIT;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    return await handleSubmit(request, params.id);
  } catch (err) {
    console.error(`[submit] Unexpected error for form ${params.id}:`, err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal server error" }, { status: 500 });
  }
}

async function handleSubmit(request: Request, id: string) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Honeypot: a hidden field named "company" that real users never fill in.
  // Bots that auto-fill every field trip this silently — we return success
  // without writing a row, so the bot doesn't learn anything.
  if (body.company) {
    return NextResponse.json({ ok: true });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(`${id}:${ip}`)) {
    return NextResponse.json({ error: "Too many submissions. Try again in a minute." }, { status: 429 });
  }

  // Anonymous read here is fine — RLS only allows published forms through.
  const supabase = createClient();
  const { data: form, error: formError } = await supabase
    .from("forms")
    .select("id, title, schema, schema_version, status, settings")
    .eq("id", id)
    .single();

  if (formError || !form) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }
  if (form.status !== "published") {
    return NextResponse.json({ error: "This form is not accepting responses" }, { status: 403 });
  }

  const settings = form.settings as FormSettings;

  // Password-protected forms: require the same cookie the page-level gate
  // sets after a correct password, so this route can't be hit directly to
  // bypass the gate shown on /f/[id]. Embedded widgets can't rely on cookies
  // (SameSite blocks third-party cookies in an iframe), so they forward the
  // same hash value as a body `accessToken` instead — verifying it identically
  // against the DB hash server-side.
  if (settings?.passwordProtected) {
    const cookieValue = cookies().get(`easyform_pw_${id}`)?.value;
    const bodyToken = typeof body.accessToken === "string" ? body.accessToken : "";
    const service = createServiceClient();
    const { data: hashRow } = await service.from("forms").select("password_hash").eq("id", id).single();
    const verified = Boolean(hashRow?.password_hash) &&
      (cookieValue === hashRow.password_hash || bodyToken === hashRow.password_hash);
    if (!verified) {
      return NextResponse.json({ error: "This form requires a password." }, { status: 401 });
    }
  }

  // Enforce a close date, if the form owner set one.
  if (settings?.closeOnDate && settings.closeDate) {
    const closeAt = new Date(settings.closeDate + "T23:59:59");
    if (Date.now() > closeAt.getTime()) {
      return NextResponse.json({ error: "This form is no longer accepting responses." }, { status: 403 });
    }
  }

  // Enforce a maximum response count, if the form owner set one. This does
  // a live count rather than trusting a cached number, since two people
  // could submit concurrently near the limit.
  if (settings?.limitResponses && settings.maxResponses) {
    const { count } = await supabase
      .from("responses")
      .select("id", { count: "exact", head: true })
      .eq("form_id", form.id);
    if ((count ?? 0) >= settings.maxResponses) {
      return NextResponse.json({ error: "This form has reached its response limit." }, { status: 403 });
    }
  }

  const result = validateSubmission(form.schema as FormSchema, body.answers ?? {});
  if (!result.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: result.errors }, { status: 422 });
  }

  const schema = form.schema as FormSchema;
  const paymentsForResponse = await chargePayments(schema, result.data, form.id, form.title);
  if (!paymentsForResponse.ok) {
    return NextResponse.json(
      { error: "Payment failed", fieldErrors: paymentsForResponse.fieldErrors },
      { status: paymentsForResponse.statusCode }
    );
  }

  // Service client bypasses RLS for the insert — safe here because we've
  // already independently confirmed the form is published and the payload
  // is validated against its schema above.
  const service = createServiceClient();
  const { data: inserted, error: insertError } = await service
    .from("responses")
    .insert({
      form_id: form.id,
      schema_version: form.schema_version,
      answers: result.data,
      meta: {
        userAgent: request.headers.get("user-agent") ?? "",
      },
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? "Couldn't record the response" }, { status: 500 });
  }

  // Insert the payments rows we just initiated, scoped to the new response.
  await insertPaymentRows(service, form.id, inserted.id, paymentsForResponse.payments);

  // Link every file referenced by this submission to its response. Files whose
  // refs were uploaded but never submitted stay orphaned (response_id null).
  const fileIds: string[] = [];
  for (const field of (form.schema as FormSchema).fields) {
    if (field.type !== "file") continue;
    const refs = result.data[field.id];
    if (Array.isArray(refs)) {
      for (const ref of refs) if (ref && typeof ref.id === "string") fileIds.push(ref.id);
    }
  }
  if (fileIds.length > 0) {
    const { error: linkError } = await service
      .from("form_files")
      .update({ response_id: inserted.id })
      .eq("form_id", form.id)
      .in("id", fileIds)
      .is("response_id", null);
    if (linkError) console.error(`[submit] Couldn't link files to response ${inserted.id}:`, linkError.message);
  }

  // Fire "submission" webhooks. Failed deliveries must never block (or break)
  // the respondent's experience, so every webhook is awaited inside a
  // settled-promise batch and any failures are only logged.
  const submissionWebhooks = webhooksForEvent(form.settings as FormSettings, "submission");
  if (submissionWebhooks.length > 0) {
    const schema = form.schema as FormSchema;
    const payload = buildSubmissionPayload(
      { id: form.id, title: form.title, schema_version: form.schema_version },
      schema,
      {
        responseId: inserted.id,
        answers: result.data,
        meta: { userAgent: request.headers.get("user-agent") ?? "" },
        createdAt: new Date().toISOString(),
      }
    );
    const results = await Promise.allSettled(
      submissionWebhooks.map((webhook) =>
        deliverWebhook(service, { formId: form.id, webhook, event: "submission", payload })
      )
    );
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(`[submit] Webhook ${submissionWebhooks[i].id} threw:`, r.reason);
      }
    });
  }

  return NextResponse.json({
    ok: true,
    confirmationMessage: settings?.confirmationMessage,
    redirectUrl: settings?.redirectUrl || undefined,
    payments: paymentsForResponse.payments.map((p) => ({
      fieldId: p.fieldId,
      reference: p.answer.reference,
      transactionId: p.answer.transactionId,
    })),
  });
}

// ---------------------------------------------------------------------------
// MarzPay payment initiation
// ---------------------------------------------------------------------------

interface ChargedPayment {
  fieldId: string;
  answer: PaymentAnswer;
  raw: { transaction: { uuid: string } };
}

type PaymentResult =
  | { ok: true; payments: ChargedPayment[] }
  | { ok: false; statusCode: number; fieldErrors: Record<string, string> };

/**
 * For every visible payment field, compute the UGX charge and initiate a
 * mobile-money collection with MarzPay. If any payment can't be initiated
 * (invalid phone, provider error, unconfigured MarzPay, ...) the whole
 * submission fails BEFORE any response row is written, so respondents never
 * get a "success" without payment.
 */
async function chargePayments(
  schema: FormSchema,
  answers: Record<string, unknown>,
  formId: string,
  formTitle: string
): Promise<PaymentResult> {
  const service = createServiceClient();
  const paymentFields = schema.fields.filter((f) => f.type === "payment");
  if (paymentFields.length === 0) return { ok: true, payments: [] };

  if (!marzpayConfigured()) {
    const fieldErrors: Record<string, string> = {};
    for (const f of paymentFields) {
      fieldErrors[f.id] = "Payments aren't configured on this form yet. Please try again later.";
    }
    return { ok: false, statusCode: 503, fieldErrors };
  }

  const callbackUrl = process.env.MARZPAY_CALLBACK_URL;
  const payments: ChargedPayment[] = [];
  const fieldErrors: Record<string, string> = {};

  for (const field of paymentFields) {
    const cfg: PaymentFieldConfig = field.paymentConfig ?? defaultPaymentConfig();
    const draft = (answers[field.id] ?? {}) as {
      amount?: number | string;
      currency?: PaymentCurrency;
      phoneNumber?: string;
    };

    // Resolve amount.
    const amount =
      cfg.amountMode === "fixed" ? cfg.fixedAmount : typeof draft.amount === "number" ? draft.amount : Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      fieldErrors[field.id] = "Enter a valid payment amount";
      continue;
    }
    if (cfg.minAmount && amount < cfg.minAmount) {
      fieldErrors[field.id] = `Minimum amount is ${cfg.minAmount}.`;
      continue;
    }
    if (cfg.maxAmount && amount > cfg.maxAmount) {
      fieldErrors[field.id] = `Maximum amount is ${cfg.maxAmount}.`;
      continue;
    }

    // Resolve phone number: inline draft or a linked phone field's answer.
    let phone = (draft.phoneNumber ?? "").trim();
    if (!phone && cfg.phoneFieldId) {
      phone = String(answers[cfg.phoneFieldId] ?? "").trim();
    }
    if (!phone) {
      fieldErrors[field.id] = "A mobile money number is required for payment.";
      continue;
    }
    if (!/^\+?\d{9,15}$/.test(phone.replace(/[\s-]/g, ""))) {
      fieldErrors[field.id] = "Enter a valid mobile money number (e.g. +2567…).";
      continue;
    }

    const currency: PaymentCurrency = draft.currency === "USD" || cfg.currency === "USD" ? "USD" : "UGX";
    if (cfg.currency === "USD" && !cfg.usdToUgxRate) {
      fieldErrors[field.id] = "This form's USD rate isn't configured.";
      continue;
    }

    const charge = computePaymentCharge(amount, currency, cfg.usdToUgxRate, cfg.taxRate);
    const reference = randomUUID();

    try {
      const initiated = await initiateCollection({
        amountUgx: charge.totalUgx,
        phoneNumber: phone,
        reference,
        description: cfg.description || `Payment for ${formTitle}`,
        callbackUrl,
        metadata: [{ formId }, { fieldId: field.id }],
      });
      if (!initiated?.transaction?.uuid) {
        throw new Error("MarzPay didn't return a transaction uuid");
      }
      const answer = buildPaymentAnswer({
        reference,
        transactionId: initiated.transaction.uuid,
        currency,
        amount,
        usdToUgxRate: currency === "USD" ? cfg.usdToUgxRate : null,
        taxRate: cfg.taxRate,
        method: cfg.method,
        phoneNumber: phone,
        description: cfg.description || undefined,
      });
      // Store the enriched PaymentAnswer as the field's answer.
      answers[field.id] = answer;
      payments.push({ fieldId: field.id, answer, raw: initiated });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment could not be initiated";
      fieldErrors[field.id] = `Payment failed: ${message}`;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, statusCode: 422, fieldErrors };
  }
  return { ok: true, payments };
}

async function insertPaymentRows(
  service: ReturnType<typeof createServiceClient>,
  formId: string,
  responseId: string,
  payments: ChargedPayment[]
) {
  if (payments.length === 0) return;
  const rows = payments.map((p) => ({
    form_id: formId,
    response_id: responseId,
    field_id: p.fieldId,
    reference: p.answer.reference,
    status: p.answer.status,
    transaction_id: p.answer.transactionId,
    currency: p.answer.currency,
    amount: p.answer.amount,
    amount_ugx: p.answer.amountUgx,
    usd_to_ugx_rate: p.answer.usdToUgxRate,
    tax_rate: p.answer.taxRate,
    tax_ugx: p.answer.taxUgx,
    total_ugx: p.answer.totalUgx,
    method: p.answer.method,
    phone_number: p.answer.phoneNumber,
    description: p.answer.description,
    country: p.answer.country,
    raw: p.raw,
  }));
  const { error } = await service.from("payments").insert(rows);
  if (error) {
    console.error(`[submit] Couldn't insert payment rows:`, error.message);
  }
}
