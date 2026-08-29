import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { type FormSettings } from "@/lib/schema";
import { buildDeadlinePayload, deliverWebhook, webhooksForEvent } from "@/lib/webhooks";

// Deadline webhook delivery — called by Vercel Cron (see vercel.json).
// For every form whose close date has passed, it:
//   1. flips the form to "closed" (if it isn't already), and
//   2. fires each enabled "deadline" webhook exactly once.
//
// Idempotency: before firing, we check webhook_deliveries for an existing
// successful delivery for that webhook_id + event. That makes the hourly cron
// a natural retry loop for failed deliveries — a failed attempt is logged but
// NOT considered "delivered", so the next run retries it, and a successful one
// is never repeated.

export async function GET(request: Request) {
  // Vercel Cron sends a bearer token we set ourselves. Any other caller
  // (including a curious browser) gets a 401 before touching the DB.
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  // Forms with a configured close date on or before today. ISO date strings
  // (YYYY-MM-DD sort lexicographically) make the comparison trivial.
  const today = new Date().toISOString().slice(0, 10);

  const { data: forms, error } = await service
    .from("forms")
    .select("id, title, status, schema, schema_version, settings")
    .gt("settings->>closeDate", "") // has a closeDate value
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[cron/webhooks] Failed to load forms:", error.message);
    return NextResponse.json({ error: "Failed to load forms" }, { status: 500 });
  }

  let checked = 0;
  let fired = 0;
  let closed = 0;

  for (const form of forms ?? []) {
    const settings = form.settings as FormSettings;
    if (!settings?.closeOnDate || !settings.closeDate) continue;
    if (settings.closeDate > today) continue; // not due yet
    checked += 1;

    // Close the form if it's still open.
    if (form.status === "published") {
      await service
        .from("forms")
        .update({ status: "closed" })
        .eq("id", form.id)
        .then(() => undefined)
        .catch((e: unknown) => console.error(`[cron/webhooks] Couldn't close form ${form.id}:`, e));
      closed += 1;
    }

    const targets = webhooksForEvent(settings, "deadline");
    if (targets.length === 0) continue;

    const { count } = await service
      .from("responses")
      .select("id", { count: "exact", head: true })
      .eq("form_id", form.id);
    const payload = buildDeadlinePayload(
      { id: form.id, title: form.title, closeDate: settings.closeDate },
      count ?? 0
    );

    for (const webhook of targets) {
      const deliveredAlready = await alreadyDelivered(service, webhook.id);
      if (deliveredAlready) continue;

      await deliverWebhook(service, {
        formId: form.id,
        webhook,
        event: "deadline",
        payload,
      });
      fired += 1;
    }
  }

  return NextResponse.json({ ok: true, checked, closed, fired });
}

/** True if a successful 'deadline' delivery already exists for this webhook. */
async function alreadyDelivered(
  service: ReturnType<typeof createServiceClient>,
  webhookId: string
): Promise<boolean> {
  const { data } = await service
    .from("webhook_deliveries")
    .select("id")
    .eq("webhook_id", webhookId)
    .eq("event", "deadline")
    .eq("success", true)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}