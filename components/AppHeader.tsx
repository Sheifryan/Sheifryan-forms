"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, Menu, Moon, Sun, UserRound } from "lucide-react";
import { NotificationsBell } from "@/components/NotificationsBell";
import { createClient } from "@/lib/supabase/client";
import { applyTheme, type ThemeChoice } from "@/lib/theme";
import { useToast } from "@/components/Toast";
import { firstName, initials } from "@/lib/workspace";

interface Props {
  title: string;
  greeting?: boolean;
  userName?: string | null;
  userEmail?: string | null;
  plan?: string | null;
  /**
   * Kind of the ACTIVE workspace. The "Go to personal workspace" escape hatch is
   * shown only inside an organisation. This is read straight from the workspaces
   * row (not from the membership list), so it still works when the workspace
   * switcher can't enumerate anything.
   */
  workspaceKind?: "personal" | "business" | null;
}

function timeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

export function AppHeader({ title, greeting = false, userName, userEmail, workspaceKind = null }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [switchingWs, setSwitchingWs] = useState(false);
  // Starts light on the server AND on the first client render so the markup
  // matches; the effect below corrects it from the <html> class straight after.
  const [dark, setDark] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // The inline script in app/layout.tsx sets <html class="dark"> before paint,
  // so the document class is the source of truth. Reading it post-mount keeps
  // the server HTML and first client render identical (no hydration mismatch)
  // while still reflecting the user's choice immediately after.
  //
  // Previously this state was seeded with currentResolvedTheme() in a useState
  // initializer — that runs during render, including the server render of this
  // client component, where `window` is undefined and it threw.
  useEffect(() => {
    function sync() {
      setDark(document.documentElement.classList.contains("dark"));
    }
    sync();
    window.addEventListener("nibble:theme-changed", sync);
    return () => window.removeEventListener("nibble:theme-changed", sync);
  }, []);

  function toggleTheme() {
    // Read the current state from the DOM rather than React state — the <html>
    // class is the single source of truth (and the pre-paint inline script is
    // what set it).
    const next: ThemeChoice = document.documentElement.classList.contains("dark") ? "light" : "dark";
    applyTheme(next);
    // applyTheme has already flipped the <html> class; the dispatched event
    // re-syncs this state from it, so there is one source of truth.
    window.dispatchEvent(new Event("nibble:theme-changed"));
  }

  async function handleSignOut() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  /**
   * Escape hatch back to the personal workspace.
   *
   * Clears the `nibble_ws` hint, so resolveActiveWorkspace() falls back to the
   * personal workspace server-side. Deliberately does NOT depend on
   * WorkspaceSwitcher's list — that list is empty whenever `workspace_members`
   * can't be read, which is exactly when you'd most want this.
   *
   * Lands on /dashboard because the current page may be org-only (/members,
   * /activity), which would be odd to render in personal mode.
   */
  async function goToPersonalWorkspace() {
    setSwitchingWs(true);
    try {
      const res = await fetch("/api/workspace/switch", { method: "DELETE" });
      if (!res.ok) throw new Error("switch failed");
      setMenuOpen(false);
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Couldn't switch to your personal workspace");
      setSwitchingWs(false);
    }
  }

  const name = userName?.trim() || "";
  const displayGreeting = greeting ? `${timeGreeting()}${name ? `, ${firstName(name)}` : ""}` : title;

  return (
    <div className="relative z-10 flex items-center justify-between border-b border-line bg-white px-7 py-4 dark:border-lineDark dark:bg-panelDark">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("nibble:open-nav"))}
          aria-label="Open navigation"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-slate-500 transition hover:bg-paper lg:hidden dark:border-lineDark dark:text-mutedDark dark:hover:bg-panelDark"
        >
          <Menu size={15} />
        </button>
        <div>
          <p className="mb-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">
            {greeting ? "NibbleForms" : "Workspace"}
          </p>
          <h1 className="font-display text-xl font-semibold tracking-tight text-ink dark:text-inkDark">{displayGreeting}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-slate-500 transition hover:bg-paper dark:border-lineDark dark:text-mutedDark dark:hover:bg-panelDark"
        >
          {/* CSS picks the icon from the <html class="dark"> the inline script
              set before paint, so there is no icon flash on dark-mode load and
              no browser read during render. */}
          <Sun size={15} className="hidden dark:block" />
          <Moon size={15} className="dark:hidden" />
        </button>

        {/* Real notifications, written by the `notify_team` workflow action.
            This used to be a decorative bell with a permanently-on dot. */}
        <NotificationsBell />

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-2 transition hover:bg-paper dark:border-lineDark dark:bg-panelDark dark:hover:bg-panelDark"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-signal to-accent2 text-[10px] font-bold text-white">
              {initials(name || userEmail)}
            </div>
            <ChevronDown size={14} className="text-slate-400 dark:text-mutedDark" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-white shadow-lg dark:border-lineDark dark:bg-panelDark">
              <div className="border-b border-line px-3.5 py-3 dark:border-lineDark">
                <p className="truncate font-body text-[12px] font-medium text-ink dark:text-inkDark">{name || userEmail || "User"}</p>
                <p className="truncate font-body text-[10.5px] text-slate-400 dark:text-mutedDark">{userEmail ?? ""}</p>
              </div>
              {workspaceKind === "business" && (
                <button
                  type="button"
                  onClick={goToPersonalWorkspace}
                  disabled={switchingWs}
                  className="flex w-full items-center gap-2 border-b border-line px-3.5 py-2.5 text-left font-body text-[12px] font-medium text-slate-500 transition hover:bg-paper hover:text-signal disabled:opacity-50 dark:border-lineDark dark:text-mutedDark dark:hover:bg-panelDark"
                >
                  <UserRound size={14} />
                  {switchingWs ? "Switching…" : "Go to personal workspace"}
                </button>
              )}
              <button
                type="button"
                onClick={handleSignOut}
                disabled={busy}
                className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left font-body text-[12px] font-medium text-slate-500 transition hover:bg-paper hover:text-warn disabled:opacity-50 dark:text-mutedDark dark:hover:bg-panelDark"
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
