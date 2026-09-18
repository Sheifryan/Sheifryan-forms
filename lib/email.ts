// Outbound email for the workflow actions (`email_notification`,
// `confirmation_email`).
//
// Uses Resend's REST API over fetch — no SDK, no new dependency — with the same
// environment variables the `notify-submission` Edge Function already uses, so
// one configuration covers both. An unconfigured deployment gets a clear
// "not configured" result rather than a thrown error: a workflow action must
// never turn a recorded submission into a failure for the respondent.

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

export interface SendEmailResult {
  ok: boolean;
  /** Why it failed, surfaced in the workflow run log. */
  error?: string;
}

const DEFAULT_RESEND_BASE = "https://api.resend.com";

/** Resend's REST endpoint; overridable so tests can point at a local server. */
function resendEndpoint(): string {
  const base = (process.env.RESEND_API_BASE || DEFAULT_RESEND_BASE).replace(/\/+$/, "");
  return `${base}/emails`;
}

/**
 * The From address.
 *
 * Three names are accepted because all three exist in the wild:
 * `NOTIFY_FROM_EMAIL` (this repo's Edge Function convention) first, then
 * `DEFAULT_FROM_EMAIL` / `SERVER_EMAIL` (the names used in .env).
 */
export function fromAddress(): string {
  return (process.env.NOTIFY_FROM_EMAIL || process.env.DEFAULT_FROM_EMAIL || process.env.SERVER_EMAIL || "").trim();
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "email is not configured (set RESEND_API_KEY)" };

  const to = (Array.isArray(input.to) ? input.to : [input.to]).map((v) => v.trim()).filter(Boolean);
  if (to.length === 0) return { ok: false, error: "no recipient address" };

  // Previously this fell back to a placeholder address on an unverified domain,
  // so the run log showed an opaque provider 403 instead of saying what was
  // actually missing.
  const from = fromAddress();
  if (!from) return { ok: false, error: "no sender configured (set DEFAULT_FROM_EMAIL)" };

  try {
    const res = await fetch(resendEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from,
        to,
        subject: input.subject.slice(0, 200),
        text: input.text,
        html: input.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      return { ok: false, error: `email provider returned HTTP ${res.status}${detail ? `: ${detail}` : ""}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "email send failed" };
  }
}

/**
 * The respondent's own address, when the form asked for one.
 *
 * `respondentFrom()` in lib/respondents.ts returns a display label, which is an
 * email only by luck — this looks for an actual address so `confirmation_email`
 * has somewhere to send.
 */
export function emailFromAnswers(answers: Record<string, unknown>): string | null {
  for (const value of Object.values(answers)) {
    if (typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return value.trim();
  }
  return null;
}
