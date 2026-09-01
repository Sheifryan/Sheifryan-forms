import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCollectionStatus, normalizePaymentStatus, marzpayConfigured } from "@/lib/marzpay";

// Anonymous status polling for the payment "in progress" screen. The client
// sends the UUID references it received from the submit response; those act
// as unguessable capability tokens scoped to a published form. For payments
// still `processing`, we proactively ask MarzPay for the latest status
// (throttled to once per ~15s per payment) so completion shows even if the
// webhook is slow.

const REFRESH_THROTTLE_MS = 15_000;

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const url = new URL(request.url);
  const refsParam = url.searchParams.get("refs") ?? "";
  const refs = refsParam.split(",").map((r) => r.trim()).filter(Boolean);
  if (refs.length === 0) return NextResponse.json({ payments: [] });

  const supabase = createClient();
  const { data: form } = await supabase
    .from("forms")
    .select("id, status")
    .eq("id", params.id)
    .single();

  if (!form || form.status !== "published") {
    return NextResponse.json({ payments: [] }, { status: 200 });
  }

  const service = createServiceClient();
  const { data: rows } = await service
    .from("payments")
    .select("id, reference, status, transaction_id, provider_transaction_id, error, checked_at, updated_at")
    .eq("form_id", params.id)
    .in("reference", refs)
    .limit(50);

  const now = new Date();
  const payments: {
    reference: string;
    status: string;
    transactionId: string | null;
    providerTransactionId: string | null;
    error: string | null;
    updatedAt: string | null;
  }[] = [];

  for (const row of rows ?? []) {
    let status = row.status;
    let providerTransactionId = row.provider_transaction_id;
    let error = row.error;
    let updatedAt = row.updated_at;

    // Proactively refresh still-processing payments straight from MarzPay.
    if (
      (status === "processing" || status === "pending") &&
      row.transaction_id &&
      marzpayConfigured() &&
      (!row.checked_at || now.getTime() - new Date(row.checked_at).getTime() > REFRESH_THROTTLE_MS)
    ) {
      try {
        const fresh = await getCollectionStatus(row.transaction_id);
        const freshStatus = normalizePaymentStatus(
          fresh.status || fresh.event_type?.split(".").pop() || fresh.transaction?.status
        );
        providerTransactionId = fresh.collection?.provider_transaction_id ?? providerTransactionId;
        await service
          .from("payments")
          .update({
            status: freshStatus,
            provider_transaction_id: providerTransactionId ?? undefined,
            checked_at: now.toISOString(),
            error: freshStatus === "failed" || freshStatus === "cancelled" ? (fresh.event_type ?? null) : undefined,
            raw: fresh,
          })
          .eq("id", row.id);
        status = freshStatus;
        updatedAt = now.toISOString();
      } catch (err) {
        console.error(`[marzpay] Status poll failed for ${row.reference}:`, err);
      }
    }

    payments.push({
      reference: row.reference,
      status,
      transactionId: row.transaction_id,
      providerTransactionId,
      error,
      updatedAt,
    });
  }

  return NextResponse.json({ payments });
}