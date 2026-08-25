"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const expiredError = searchParams.get("error") === "auth";

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);

    if (error) {
      // "Email not confirmed" and "Invalid login credentials" are the two
      // common cases — turn them into helpful copy instead of raw messages.
      if (error.message.toLowerCase().includes("not confirmed")) {
        setErrorMsg(
          "Your email isn't confirmed yet. Check your inbox for the confirmation link, then sign in again."
        );
      } else if (error.message.toLowerCase().includes("invalid login")) {
        setErrorMsg("Incorrect email or password. Please try again.");
      } else {
        setErrorMsg(
          error?.message && error.message !== "{}"
            ? error.message
            : `Sign in failed (${error?.status ?? "unknown"}).`
        );
      }
      return;
    }

    router.push("/dashboard");
    router.refresh();
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
        <p className="mb-6 font-body text-sm text-muted">
          Use your EasyForm account to continue.
        </p>

        {expiredError && (
          <p className="mb-4 rounded-md bg-rose-50 px-3 py-2 font-body text-xs text-warn">
            That link expired or was already used. Sign in with your email and
            password below.
          </p>
        )}

        {errorMsg && (
          <p className="mb-4 rounded-md bg-rose-50 px-3 py-2 font-body text-xs text-warn">
            {errorMsg}
          </p>
        )}

        <form onSubmit={signIn} className="space-y-3">
          <div className="space-y-1">
            <label className="font-body text-xs font-medium text-muted">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded border border-line px-3 py-2 font-body text-sm outline-none focus:border-signal focus:ring-1 focus:ring-signal"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="font-body text-xs font-medium text-muted">Password</label>
              <span className="font-body text-xs text-line">Required</span>
            </div>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              className="w-full rounded border border-line px-3 py-2 font-body text-sm outline-none focus:border-signal focus:ring-1 focus:ring-signal"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-signal px-4 py-2 font-body text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-5 text-center font-body text-sm text-muted">
          New to EasyForm?{" "}
          <Link href="/signup" className="font-medium text-signal hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
