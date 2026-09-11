"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { useToast } from "@/components/Toast";

export interface SwitcherWorkspace {
  id: string;
  name: string;
  kind: "personal" | "business";
  plan: string;
  role: string;
  logo_url?: string | null;
}

/**
 * Workspace switcher.
 *
 * Per the product spec this stays quiet for single-workspace users: with one
 * workspace it renders as a plain label. With two or more it becomes a
 * dropdown that switches the active workspace cookie (`nibble_ws`).
 */
export function WorkspaceSwitcher({
  workspaces,
  activeId,
  workspaceName,
  workspaceKind,
}: {
  workspaces: SwitcherWorkspace[];
  activeId?: string | null;
  /** The real active workspace name — used when activeId isn't in the list. */
  workspaceName?: string | null;
  /** The real active workspace kind — same purpose. */
  workspaceKind?: "personal" | "business" | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // The ACTIVE workspace, matched by id — deliberately NO `?? workspaces[0]`
  // fallback. When the active id isn't in the list (e.g. its membership row is
  // missing) claiming workspaces[0] is active did two bad things: the header
  // showed the wrong name, and switchTo() treated that entry as already-active
  // so clicking it was a no-op — leaving the user unable to switch back.
  const active = workspaces.find((w) => w.id === activeId) ?? null;
  if (workspaces.length === 0 && !active) return null;

  // What to render in the header. Prefers the real item, then the authoritative
  // props from the server, and only then the first entry.
  const fallback = workspaces[0];
  const display: SwitcherWorkspace = active ?? {
    id: activeId ?? "",
    name: workspaceName ?? fallback?.name ?? "Workspace",
    kind: workspaceKind ?? fallback?.kind ?? "personal",
    plan: fallback?.plan ?? "free",
    role: fallback?.role ?? "owner",
    logo_url: null,
  };
  const isOrg = display.kind === "business";

  async function switchTo(id: string) {
    // Guard against the SERVER's active id, not the possibly-stale display.
    if (id === activeId) {
      setOpen(false);
      return;
    }
    setSwitching(id);
    try {
      const res = await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: id }),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Couldn't switch workspace", { description: data.error ?? "Try again in a moment." });
      }
    } catch {
      toast.error("Couldn't switch workspace");
    }
    setSwitching(null);
  }

  // Single workspace: a quiet, non-interactive label.
  if (workspaces.length <= 1) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-2.5 py-2 dark:border-lineDark dark:bg-panelDark">
        <WorkspaceAvatar workspace={display} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-body text-[12px] font-semibold text-ink dark:text-inkDark">{display.name}</p>
          <p className="font-body text-[10.5px] text-slate-400 dark:text-mutedDark">{isOrg ? "Organisation" : "Personal"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Switch workspace"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-2 text-left transition hover:border-signal dark:border-lineDark dark:bg-panelDark"
      >
        <WorkspaceAvatar workspace={display} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-body text-[12px] font-semibold text-ink dark:text-inkDark">{display.name}</p>
          <p className="font-body text-[10.5px] text-slate-400 dark:text-mutedDark">{isOrg ? "Organisation" : "Personal"}</p>
        </div>
        <ChevronsUpDown size={14} className="shrink-0 text-slate-400 dark:text-mutedDark" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-40 mt-1.5 overflow-hidden rounded-xl border border-line bg-white shadow-lg dark:border-lineDark dark:bg-panelDark">
          <p className="border-b border-line px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:border-lineDark dark:text-mutedDark">
            Workspaces
          </p>
          <div className="max-h-72 overflow-y-auto py-1">
            {workspaces.map((w) => {
              const isActive = w.id === activeId;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => void switchTo(w.id)}
                  disabled={switching !== null}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition disabled:opacity-60 ${
                    isActive ? "bg-signalSoft/20" : "hover:bg-paper dark:hover:bg-panelDark"
                  }`}
                >
                  <WorkspaceAvatar workspace={w} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-body text-[12.5px] font-medium text-ink dark:text-inkDark">{w.name}</span>
                    <span className="block font-body text-[10.5px] capitalize text-slate-400 dark:text-mutedDark">
                      {w.kind === "business" ? "Organisation" : "Personal"} · {w.role}
                    </span>
                  </span>
                  {switching === w.id ? <Loader2 size={14} className="animate-spin text-signal" /> : isActive ? <Check size={14} className="text-signal" /> : null}
                </button>
              );
            })}
          </div>
          <div className="border-t border-line p-1 dark:border-lineDark">
            <a
              href="/onboarding/organisation"
              className="flex items-center gap-2 rounded-lg px-3 py-2 font-body text-[12px] font-medium text-signal transition hover:bg-signalSoft/15"
            >
              <Plus size={14} /> Create organisation
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkspaceAvatar({ workspace }: { workspace: SwitcherWorkspace }) {
  const isOrg = workspace.kind === "business";
  if (workspace.logo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={workspace.logo_url} alt="" className="h-7 w-7 shrink-0 rounded-lg object-cover" />;
  }
  const initials =
    workspace.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "W";
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10.5px] font-bold text-white ${
        isOrg ? "bg-gradient-to-br from-signal to-accent2" : "bg-slate-400"
      }`}
    >
      {initials}
    </span>
  );
}