import Link from "next/link";
import { ClipboardList, Home, Inbox, BarChart3, Files } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { FoldersSidebar } from "./FoldersSidebar";
import { AppHeader } from "./AppHeader";

interface Props {
  active: "dashboard" | "forms" | "submissions" | "analytics" | "settings";
  /** Header title for the page. */
  title: string;
  /** When true, the header shows a time-based greeting instead of `title`. */
  greeting?: boolean;
  userEmail?: string | null;
  /** Active folder view for the sidebar highlight ("all" | "none" | folder id). */
  activeFolderId?: string;
  /** Per-folder form counts — the dashboard passes these for the count badges. */
  folderCounts?: { all: number; none: number; [folderId: string]: number };
  children: React.ReactNode;
}

const NAV = [
  { id: "dashboard", label: "Home", href: "/dashboard", icon: Home },
  { id: "forms", label: "All forms", href: "/forms", icon: Files },
  { id: "submissions", label: "Submissions", href: "/submissions", icon: Inbox },
  { id: "analytics", label: "Analytics", href: "/analytics", icon: BarChart3 },
] as const;

export async function AppShell({
  active,
  title,
  greeting = false,
  userEmail,
  activeFolderId = "all",
  folderCounts,
  children,
}: Props) {
  const supabase = createClient();
  const { data: folders } = await supabase
    .from("folders")
    .select("id, name")
    .order("created_at", { ascending: true });

  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-white px-3 py-4">
        <Link href="/dashboard" className="mb-5 flex items-center gap-2 px-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-signal text-white">
            <ClipboardList size={15} />
          </div>
          <span className="font-display text-[15px] font-bold text-ink">
            Easy<span className="text-signal">Form</span>
          </span>
        </Link>

        <nav className="space-y-0.5">
          {NAV.map((n) => (
            <Link
              key={n.id}
              href={n.href}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left font-body text-[13px] font-medium transition ${
                active === n.id ? "bg-signalSoft text-signal" : "text-stone-500 hover:bg-paper hover:text-ink"
              }`}
            >
              <n.icon size={15} className={active === n.id ? "text-signal" : "text-muted"} />
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto border-t border-line pt-4 pb-2">
          <FoldersSidebar folders={folders ?? []} activeFolderId={activeFolderId} counts={folderCounts} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <AppHeader title={title} greeting={greeting} userEmail={userEmail} />
        {children}
      </div>
    </div>
  );
}
