"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const expiredError = searchParams.get("error") === "auth";

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="w-full max-w-sm rounded-lg border border-line bg-white p-8">
        <div className="mb-5 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-signal font-display text-xs font-bold text-white">
            E
          </div>
          <span className="font-display text-[15px] font-bold text-ink">
            Easy<span className="text-signal">Form</span>
          </span>
        </div>
        <h1 className="mb-1 font-display text-xl text-ink">Sign in</h1>
        <p className="mb-6 font-body text-sm text-muted">We&apos;ll email you a magic link.</p>

        {expiredError && !sent && (
          <p className="mb-4 rounded-md bg-rose-50 px-3 py-2 font-body text-xs text-warn">
            That link expired or was already used. Request a new one below.
          </p>
        )}

        {errorMsg && <p className="mb-4 rounded-md bg-rose-50 px-3 py-2 font-body text-xs text-warn">{errorMsg}</p>}

        {sent ? (
          <p className="font-body text-sm text-signal">Check your inbox for a sign-in link.</p>
        ) : (
          <form onSubmit={sendLink} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded border border-line px-3 py-2 font-body text-sm outline-none focus:border-signal focus:ring-1 focus:ring-signal"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded bg-signal px-4 py-2 font-body text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
