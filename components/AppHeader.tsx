"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  /** Page title shown in the header; when `greeting` is true this is ignored. */
  title: string;
  /** When true (dashboard), show a time-based greeting instead of a static title. */
  greeting?: boolean;
  userEmail?: string | null;
}

function timeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

export function AppHeader({ title, greeting = false, userEmail }: Props) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function handleSignOut() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initials = (userEmail ?? "U").slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center justify-between border-b border-line bg-white px-7 py-4">
      <div>
        <p className="mb-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-muted">
          Workspace
        </p>
        <h1 className="font-display text-xl font-semibold tracking-tight text-ink">
          {greeting ? timeGreeting() : title}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-muted transition hover:bg-paper"
          aria-label="Notifications"
        >
          <Bell size={15} />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-2 transition hover:bg-paper"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-signal to-accent2 text-[10px] font-bold text-white">
              {initials}
            </div>
            <ChevronDown size={14} className="text-muted" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-white shadow-lg">
              <div className="border-b border-line px-3.5 py-3">
                <p className="truncate font-body text-[12px] font-medium text-ink">{userEmail ?? "User"}</p>
                <p className="truncate font-body text-[10.5px] text-muted">{userEmail ?? ""}</p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={busy}
                className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left font-body text-[12px] font-medium text-muted transition hover:bg-paper hover:text-warn disabled:opacity-50"
              >
                <LogOut size={14} />
                {busy ? "Signing out…" : "Sign out"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
