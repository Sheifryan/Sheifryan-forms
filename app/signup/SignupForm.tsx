"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needConfirmation, setNeedConfirmation] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);

    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      setBusy(false);
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Passwords don't match.");
      setBusy(false);
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setBusy(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    // When the Supabase "Confirm email" toggle is OFF, a session comes back
    // immediately and we can drop the user straight into the app.
    if (data.session) {
      router.push("/dashboard");
      router.refresh();
      return;
    }

    // Otherwise Supabase sent a confirmation email — walk them through it.
    setNeedConfirmation(true);
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
        <h1 className="mb-1 font-display text-xl text-ink">Create an account</h1>
        <p className="mb-6 font-body text-sm text-muted">Start building forms in minutes.</p>

        {errorMsg && (
          <p className="mb-4 rounded-md bg-rose-50 px-3 py-2 font-body text-xs text-warn">
            {errorMsg}
          </p>
        )}

        {needConfirmation ? (
          <div className="space-y-3">
            <p className="font-body text-sm text-signal">
              Check your inbox for a confirmation link. Once you&apos;ve confirmed
              your email you can sign in.
            </p>
            <Link
              href="/login"
              className="block w-full rounded bg-signal px-4 py-2 text-center font-body text-sm font-medium text-white transition hover:opacity-90"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSignup} className="space-y-3">
            <input
              type="text"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="w-full rounded border border-line px-3 py-2 font-body text-sm outline-none focus:border-signal focus:ring-1 focus:ring-signal"
            />
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded border border-line px-3 py-2 font-body text-sm outline-none focus:border-signal focus:ring-1 focus:ring-signal"
            />
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded border border-line px-3 py-2 font-body text-sm outline-none focus:border-signal focus:ring-1 focus:ring-signal"
            />
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm password"
              className="w-full rounded border border-line px-3 py-2 font-body text-sm outline-none focus:border-signal focus:ring-1 focus:ring-signal"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded bg-signal px-4 py-2 font-body text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Creating account…" : "Create account"}
            </button>
          </form>
        )}

        <p className="mt-5 text-center font-body text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-signal hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}