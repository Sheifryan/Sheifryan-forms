import {
  BarChart3,
  ClipboardList,
  Files,
  History,
  Inbox,
  LayoutDashboard,
  Send,
  Settings,
  Users,
  Wallet,
  Workflow,
} from "lucide-react";
import { CountUp } from "./CountUp";
import { Reveal, Stagger, StaggerItem } from "./Reveal";

const NAV = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Forms", icon: ClipboardList },
  { label: "Responses", icon: Inbox },
  { label: "Submissions", icon: Send },
  { label: "Analytics", icon: BarChart3 },
  { label: "Files", icon: Files },
  { label: "Workflows", icon: Workflow },
  { label: "Wallet", icon: Wallet },
  { label: "Settings", icon: Settings },
];

const ORG_NAV = [
  { label: "Members", icon: Users },
  { label: "Activity", icon: History },
];

const STATS: { value: number; suffix?: string; label: string }[] = [
  { value: 24, label: "Forms" },
  { value: 3842, label: "Responses" },
  { value: 1923, label: "Submissions" },
  { value: 74, suffix: "%", label: "Completion" },
];

/** Workspace showcase — shows the product is a platform, not a single page. */
export function WorkspaceShowcase() {
  return (
    <section id="product" className="scroll-mt-20 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl dark:text-inkDark">
            Everything happens in your workspace.
          </h2>
          <p className="mt-3 font-body text-[14.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
            Forms, responses, files, workflows and billing live side by side — with organisation-only
            Members and Activity views when you need them.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-6 lg:grid-cols-[260px_1fr]">
          <Reveal>
            <nav className="rounded-xl border border-line bg-white p-3 dark:border-lineDark dark:bg-panelDark">
              <div className="space-y-0.5">
                {NAV.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 font-body text-[13px] text-slate-600 dark:text-mutedDark"
                  >
                    <item.icon size={14} className="text-slate-400 dark:text-mutedDark" />
                    {item.label}
                  </div>
                ))}
              </div>
              <p className="mt-4 px-2.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-slate-400 dark:text-mutedDark">
                Organisation
              </p>
              <div className="mt-1 space-y-0.5">
                {ORG_NAV.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 font-body text-[13px] text-slate-600 dark:text-mutedDark"
                  >
                    <item.icon size={14} className="text-slate-400 dark:text-mutedDark" />
                    {item.label}
                  </div>
                ))}
              </div>
            </nav>
          </Reveal>

          <Stagger className="grid gap-4 sm:grid-cols-2">
            {STATS.map((s) => (
              <StaggerItem key={s.label}>
                <div className="h-full rounded-xl border border-line bg-white p-5 dark:border-lineDark dark:bg-panelDark">
                  <p className="font-display text-3xl font-bold tracking-tight text-ink dark:text-inkDark">
                    <CountUp value={s.value} suffix={s.suffix} />
                  </p>
                  <p className="mt-1 font-body text-[12.5px] text-slate-500 dark:text-mutedDark">
                    {s.label}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
  );
}
