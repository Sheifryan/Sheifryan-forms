import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { type FormSchema, type FormSettings, type WebhookConfig } from "@/lib/schema";
import { buildSubmissionPayload, deliverWebhook } from "@/lib/webhooks";

// Owner-only: send a sample "test" webhook so integrators can verify their
// endpoint + signature handling before relying on real data. Uses the latest
// actual response as the sample payload when one exists, otherwise a mock.

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: form, error: formError } = await supabase
    .from("forms")
    .select("id, title, schema, schema_version, settings")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .single();

  if (formError || !form) return NextResponse.json({ error: "Form not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const webhookId = typeof body.webhookId === "string" ? body.webhookId : "";
  const settings = (form.settings ?? {}) as FormSettings;
  const webhook = (settings.webhooks ?? []).find((w: WebhookConfig) => w.id === webhookId);
  if (!webhook) return NextResponse.json({ error: "Webhook not found" }, { status: 404 });

  const service = createServiceClient();

  // Prefer the most recent real response as the sample payload.
  const { data: latest } = await service
    .from("responses")
    .select("id, answers, meta, created_at")
    .eq("form_id", form.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = buildSubmissionPayload(
    { id: form.id, title: form.title, schema_version: form.schema_version },
    form.schema as FormSchema,
    latest
      ? {
          responseId: latest.id,
          answers: (latest.answers as Record<string, unknown>) ?? {},
          meta: (latest.meta as Record<string, unknown>) ?? {},
          createdAt: latest.created_at,
        }
      : {
          responseId: "00000000-0000-0000-0000-000000000000",
          answers: sampleAnswers(form.schema as FormSchema),
          createdAt: new Date().toISOString(),
        }
  );

  const result = await deliverWebhook(service, {
    formId: form.id,
    webhook,
    event: "test",
    payload,
  });

  return NextResponse.json({ ...result });
}

function sampleAnswers(schema: FormSchema): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const f of schema.fields) {
    if (f.type === "page_break") continue;
    switch (f.type) {
      case "email":
        answers[f.id] = "respondent@example.com";
        break;
      case "phone":
        answers[f.id] = "+1 555-0100";
        break;
      case "number":
      case "rating":
        answers[f.id] = 5;
        break;
      case "url":
        answers[f.id] = "https://example.com";
        break;
      case "date":
        answers[f.id] = new Date().toISOString().slice(0, 10);
        break;
      case "time":
        answers[f.id] = "14:30";
        break;
      case "checkbox":
        answers[f.id] = true;
        break;
      case "single_select":
      case "dropdown":
        answers[f.id] = f.options?.[0]?.label ?? "Option 1";
        break;
      case "multi_select":
        answers[f.id] = (f.options ?? []).slice(0, 2).map((o) => o.label);
        break;
      case "file":
        answers[f.id] = [{ id: "sample", name: "example.pdf", mimeType: "application/pdf", sizeBytes: 1024 }];
        break;
      default:
        answers[f.id] = "Sample answer";
    }
  }
  return answers;
}