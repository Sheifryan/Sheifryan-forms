"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  ClipboardList,
  Files,
  History,
  Inbox,
  LayoutDashboard,
  Plus,
  Settings,
  Users,
  Wallet,
  Workflow,
  X,
  Sparkles,
} from "lucide-react";
import { FoldersSidebar } from "./FoldersSidebar";
import { WorkspaceSwitcher, type SwitcherWorkspace } from "./WorkspaceSwitcher";
import { initials } from "@/lib/workspace";

export interface SidebarNavItem {
  id: string;
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
}

export const SIDEBAR_NAV: SidebarNavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { id: "forms", label: "Forms", href: "/forms", icon: ClipboardList },
  { id: "responses", label: "Responses", href: "/responses", icon: Inbox },
  { id: "analytics", label: "Analytics", href: "/analytics", icon: BarChart3 },
  { id: "files", label: "Files", href: "/files", icon: Files },
  { id: "workflows", label: "Workflows", href: "/workflows", icon: Workflow },
  { id: "wallet", label: "Wallet", href: "/wallet", icon: Wallet },
  { id: "settings", label: "Settings", href: "/settings", icon: Settings },
];

/** Extra navigation that only makes sense inside an organisation workspace. */
export const ORG_NAV: SidebarNavItem[] = [
  { id: "members", label: "Members", href: "/members", icon: Users },
  { id: "activity", label: "Activity", href: "/activity", icon: History },
];

interface Props {
  active: string;
  folders: { id: string; name: string }[];
  activeFolderId?: string;
  counts?: { all: number; none: number; [folderId: string]: number };
  userName?: string | null;
  userEmail?: string | null;
  plan?: string | null;
  workspaceName?: string | null;
  workspaces?: SwitcherWorkspace[];
  activeWorkspaceId?: string | null;
  isOrganisation?: boolean;
  /**
   * False when migration 0012+ isn't applied. The switcher degrades to a plain
   * label in that case, which looks like "nothing works" with no explanation —
   * so we say why.
   */
  orgSchemaReady?: boolean;
}

export function AppSidebar({
  active,
  folders,
  activeFolderId = "all",
  counts,
  userName,
  userEmail,
  plan,
  workspaceName,
  workspaces,
  activeWorkspaceId,
  isOrganisation = false,
  orgSchemaReady = true,
}: Props) {
  const [open, setOpen] = useState(false);

  // Organisation workspaces get Members + Activity in the main nav.
  const nav: SidebarNavItem[] = isOrganisation
    ? [...SIDEBAR_NAV.slice(0, 3), ...ORG_NAV, ...SIDEBAR_NAV.slice(3)]
    : SIDEBAR_NAV;

  // AppHeader dispatches this event when the mobile hamburger is tapped.
  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("nibble:open-nav", onOpen);
    return () => window.removeEventListener("nibble:open-nav", onOpen);
  }, []);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function close() {
    setOpen(false);
  }

  const inner = (
    <>
      <SidebarHeader
        workspaceName={workspaceName}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        orgSchemaReady={orgSchemaReady}
        workspaceKind={isOrganisation ? "business" : "personal"}
      />
      {!orgSchemaReady && (
        <div className="mx-2 mb-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-700/60 dark:bg-amber-900/20">
          <p className="font-body text-[10.5px] font-semibold text-amber-800 dark:text-amber-300">Organisation features aren&apos;t installed</p>
          <p className="mt-0.5 font-body text-[10px] leading-relaxed text-amber-700 dark:text-amber-400">
            Run <span className="font-mono">supabase/preflight.sql</span>, apply the missing migrations in order, then reload the API schema cache.
          </p>
        </div>
      )}
      <nav className="mt-1 space-y-0.5">
        {nav.map((n) => (
          <Link
            key={n.id}
            href={n.href}
            onClick={close}
            className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left font-body text-[13px] font-medium transition ${
              active === n.id
                ? "bg-signalSoft/25 font-semibold text-signal"
                : "text-slate-500 hover:bg-paper hover:text-ink dark:text-mutedDark dark:hover:bg-panelDark dark:hover:text-inkDark"
            }`}
          >
            <n.icon size={15} className={active === n.id ? "text-signal" : "text-slate-400 dark:text-mutedDark"} />
            <span className="flex-1">{n.label}</span>
            {n.id === "forms" && counts?.all !== undefined && (
              <span className="rounded-full bg-paper px-1.5 font-mono text-[10px] text-slate-500 dark:bg-panelDark dark:text-mutedDark">{counts.all}</span>
            )}
          </Link>
        ))}
      </nav>

      <div className="mt-3 border-t border-line pt-2 pb-1 dark:border-lineDark">
        <p className="px-2.5 pb-1 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Organize</p>
        <FoldersSidebar folders={folders} activeFolderId={activeFolderId} counts={counts} />
      </div>

      <SidebarFooter userName={userName} userEmail={userEmail} plan={plan} />
    </>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-white px-3 py-4 lg:flex dark:border-lineDark dark:bg-panelDark">
        <div className="min-h-0 flex-1 overflow-y-auto">{inner}</div>
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 transform border-r border-line bg-white transition-transform duration-200 lg:hidden dark:border-lineDark dark:bg-panelDark ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close navigation"
          className="absolute right-2.5 top-2.5 rounded-md p-1 text-slate-400 hover:bg-paper dark:text-mutedDark dark:hover:bg-panelDark"
        >
          <X size={15} />
        </button>
        <div className="max-h-none min-h-0 flex-1 overflow-y-auto">{inner}</div>
      </div>
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={close}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
        />
      )}
    </>
  );
}

function SidebarHeader({
  workspaceName,
  workspaces,
  activeWorkspaceId,
  orgSchemaReady = true,
  workspaceKind = null,
}: {
  workspaceName?: string | null;
  workspaces?: SwitcherWorkspace[];
  activeWorkspaceId?: string | null;
  orgSchemaReady?: boolean;
  workspaceKind?: "personal" | "business" | null;
}) {
  return (
    <div className="mb-2 px-2">
      <Link href="/dashboard" className="mb-2.5 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-signal to-accent2 text-white">
          <Sparkles size={14} />
        </div>
        <span className="font-display text-[15px] font-bold text-ink dark:text-inkDark">
          Nibble<span className="text-signal">Forms</span>
        </span>
      </Link>

      {workspaces && workspaces.length > 0 ? (
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeId={activeWorkspaceId}
          workspaceName={workspaceName}
          workspaceKind={workspaceKind}
        />
      ) : (
        workspaceName && (
          <span className="mt-1 flex items-center gap-1.5 truncate rounded-full bg-paper px-2 py-0.5 font-body text-[10.5px] font-medium text-slate-500 dark:bg-panelDark dark:text-mutedDark">
            <span className="h-1.5 w-1.5 rounded-full bg-signal" />
            {workspaceName}
          </span>
        )
      )}

      {/*
        The only other link to /onboarding/organisation lives inside the
        WorkspaceSwitcher dropdown, which renders only when the user already has
        two or more workspaces — so before the first organisation there was no
        way to reach the flow at all. This one sits OUTSIDE the ternary above, so
        it shows with zero workspaces (switcher renders null), one (quiet label)
        and many (dropdown).

        It stays enabled even when the schema is missing: the click leads to the
        wizard, which now reports which migration file is outstanding. The amber
        notice below explains the same thing up front.
      */}
      <a
        href="/onboarding/organisation"
        className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-body text-[11px] font-medium text-signal transition hover:bg-signalSoft/15"
      >
        <Plus size={12} /> Create organisation
      </a>
    </div>
  );
}

function SidebarFooter({ userName, userEmail, plan }: { userName?: string | null; userEmail?: string | null; plan?: string | null }) {
  return (
    <div className="border-t border-line pt-3 pb-2 dark:border-lineDark">
      <Link
        href="/settings"
        className="flex items-center gap-2.5 rounded-lg border border-line bg-white px-2.5 py-2 transition hover:border-signal hover:shadow-sm dark:border-lineDark dark:bg-panelDark"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-signal to-accent2 text-[11px] font-bold text-white">
          {initials(userName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-body text-[12px] font-semibold text-ink dark:text-inkDark">{userName || userEmail || "Account"}</p>
          <p className="truncate font-body text-[10.5px] text-slate-400 dark:text-mutedDark">{userEmail}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 font-body text-[9.5px] font-bold uppercase tracking-wide ${planBadgeClass(plan)}`}>
          {plan ?? "Free"}
        </span>
        <Settings size={13} className="shrink-0 text-slate-400 dark:text-mutedDark" />
      </Link>
    </div>
  );
}

function planBadgeClass(plan?: string | null): string {
  switch (plan) {
    case "pro":
      return "bg-signalSoft/20 text-signal";
    case "premium":
      return "bg-accent2/15 text-accent2";
    default:
      return "bg-paper text-slate-500 dark:bg-panelDark dark:text-mutedDark";
  }
}