"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { FormRenderer } from "@/components/renderer/FormRenderer";
import type { FormSchema, FormSettings } from "@/lib/schema";

export function PublicFormClient({
  formId,
  schema,
  settings,
}: {
  formId: string;
  schema: FormSchema;
  settings?: FormSettings;
}) {
  const toast = useToast();
  const [pendingRefs, setPendingRefs] = useState<string[] | null>(null);
  const [paymentDone, setPaymentDone] = useState(false);

  async function handleSubmit(answers: Record<string, unknown>) {
    const res = await fetch(`/api/forms/${formId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return { ok: true };
      }
      if (Array.isArray(data.payments) && data.payments.length > 0) {
        // Keep the renderer on its submitting state while we switch to the
        // payment-processing screen below.

        setPendingRefs(data.payments.map((p: { reference: string }) => p.reference));
        return { ok: false, error: undefined };
      }
      toast.success("Response submitted");
      return { ok: true, confirmationMessage: data.confirmationMessage as string | undefined };
    }

    const data = await res.json().catch(() => ({}));
    return { ok: false, fieldErrors: data.fieldErrors ?? {}, error: data.error as string | undefined };
  }

  if (pendingRefs) {
    if (paymentDone) {
      return (
        <div className="rounded-lg border border-line bg-white p-6 text-center">
          <p className="font-body text-sm font-medium text-ink">
            {settings?.confirmationMessage ?? "Thanks — your response has been recorded."}
          </p>
        </div>
      );
    }
    return (
      <PaymentProcessing formId={formId} refs={pendingRefs} onDone={() => setPaymentDone(true)} />
    );
  }

  return (
    <FormRenderer schema={schema} onSubmit={handleSubmit} settings={settings} uploadUrl={`/api/forms/${formId}/upload`} />
  );
}

interface PaymentRow {
  reference: string;
  status: string;
}

function PaymentProcessing({
  formId,
  refs,
  onDone,
}: {
  formId: string;
  refs: string[];
  onDone: () => void;
}) {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const res = await fetch(
          `/api/forms/${formId}/payments/status?refs=${encodeURIComponent(refs.join(","))}`,
          { cache: "no-store" }
        );
        if (cancelled) return;
        const data = await res.json().catch(() => ({}));
        const paymentRows: PaymentRow[] = Array.isArray(data.payments) ? data.payments : [];
        setRows(paymentRows);

        if (paymentRows.length > 0 && paymentRows.every((r) => ["completed", "failed", "cancelled"].includes(r.status))) {
          if (paymentRows.some((r) => r.status === "failed" || r.status === "cancelled")) {
            setError("One of the payments wasn&rsquo;t completed. Your response is saved, but the payment failed.");
          }
          onDoneRef.current();
          return;
        }
      } catch {
        // Transient error — keep polling.

      }
      timer = setTimeout(poll, 4000);
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [formId, refs]);

  return (
    <div className="rounded-lg border border-line bg-white p-6 text-center">
      <Loader2 size={20} className="mx-auto mb-2 animate-spin text-[var(--accent)]" />
      <p className="mb-1 font-body text-sm font-semibold text-ink">Waiting for payment…</p>
      <p className="mb-4 font-body text-xs text-muted">
        Approve the mobile money prompt on your phone to complete your submission.</p>

      {rows.length > 0 && (
        <div className="mx-auto mb-3 max-w-xs space-y-1">
          {rows.map((r) => (
            <div key={r.reference} className="flex items-center justify-between rounded-md border border-line bg-paper px-2.5 py-1.5 font-body text-[11px] text-ink">
              <span className="truncate">{r.reference.slice(0, 8)}</span>
              <span className="capitalize text-muted">{r.status}</span>
            </div>
          ))}
        </div>
      )}

      {error && <p className="font-body text-xs text-warn">{error}</p>}
    </div>
  );
}
