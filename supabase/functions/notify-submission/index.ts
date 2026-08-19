// Supabase Edge Function: notify-submission
//
// Triggered by a Database Webhook (or the optional pg_net trigger in
// migration 0003) on INSERT into `responses`. Looks up the parent form's
// settings.notifyEmail and, if set, sends a short email via Resend.
//
// Deploy: supabase functions deploy notify-submission
// Secrets needed (supabase secrets set ...):
//   RESEND_API_KEY      — from resend.com
//   NOTIFY_FROM_EMAIL    — a verified sender, e.g. notifications@yourdomain.com
//   SUPABASE_URL          — already available by default in Edge Functions
//   SUPABASE_SERVICE_ROLE_KEY — already available by default in Edge Functions

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface WebhookPayload {
  record: {
    id: string;
    form_id: string;
    answers: Record<string, unknown>;
    created_at: string;
  };
}

Deno.serve(async (req: Request) => {
  try {
    const payload: WebhookPayload = await req.json();
    const response = payload.record;
    if (!response?.form_id) {
      return new Response(JSON.stringify({ ok: false, error: "Missing form_id" }), { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: form, error } = await supabase
      .from("forms")
      .select("title, settings")
      .eq("id", response.form_id)
      .single();

    if (error || !form) {
      return new Response(JSON.stringify({ ok: false, error: "Form not found" }), { status: 404 });
    }

    const notifyEmail = form.settings?.notifyEmail as string | undefined;
    if (!notifyEmail) {
      // No notification configured for this form — nothing to do.
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("NOTIFY_FROM_EMAIL");
    if (!resendKey || !fromEmail) {
      return new Response(JSON.stringify({ ok: false, error: "Email sending not configured" }), { status: 500 });
    }

    const answerLines = Object.entries(response.answers ?? {})
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
      .join("\n");

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: notifyEmail,
        subject: `New submission — ${form.title}`,
        text: `You have a new response on "${form.title}".\n\n${answerLines}\n\nSubmitted: ${response.created_at}`,
      }),
    });

    if (!emailResponse.ok) {
      const detail = await emailResponse.text();
      return new Response(JSON.stringify({ ok: false, error: `Resend error: ${detail}` }), { status: 502 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 });
  }
});
