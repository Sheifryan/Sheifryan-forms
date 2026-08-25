"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function SignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={busy}
      className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-body text-[12px] font-medium text-muted transition hover:bg-paper hover:text-warn disabled:opacity-50"
    >
      <LogOut size={14} />
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}