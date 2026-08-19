"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

export function PasswordGate({ formId }: { formId: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/forms/${formId}/verify-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (data.ok) {
      window.location.reload();
    } else {
      setError(data.error ?? "Incorrect password.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-line bg-white p-6">
      <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_15%,white)] text-[var(--accent)]">
        <Lock size={16} />
      </div>
      <p className="mb-4 text-center font-body text-sm text-muted">This form is password protected.</p>
      <input
        type="password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Enter password"
        className="mb-3 w-full rounded border border-line bg-white px-3 py-2 font-body text-sm text-ink outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
      />
      {error && <p className="mb-3 font-body text-xs text-warn">{error}</p>}
      <button
        type="submit"
        disabled={busy || !password}
        className="w-full rounded bg-[var(--accent)] px-4 py-2 font-body text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}
