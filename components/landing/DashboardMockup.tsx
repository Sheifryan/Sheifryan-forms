"use client";

import { useRef } from "react";
import { m, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
  BarChart3,
  ClipboardList,
  Files,
  History,
  Inbox,
  LayoutDashboard,
  Plus,
  Send,
  Settings,
  Users,
  Wallet,
  Workflow,
} from "lucide-react";

const NAV = [
  { label: "Dashboard", icon: LayoutDashboard, active: true },
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

const STATS = [
  { value: "1,284", label: "Responses" },
  { value: "842", label: "Submissions" },
  { value: "67%", label: "Completion" },
];

/**
 * Product mockup built from real DOM + an inline SVG chart rather than a
 * screenshot: it stays crisp at any size and follows the dark/light tokens.
 *
 * Two motion layers on purpose — the outer element carries the scroll-driven
 * parallax (a `style` transform) and the inner one the ambient float (an
 * `animate` loop), so they never fight over the same transform.
 */
export function DashboardMockup() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 90%", "start 30%"],
  });
  const rotateX = useTransform(scrollYProgress, [0, 1], [7, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.97, 1]);

  return (
    <div ref={ref} className="mt-14 [perspective:1400px]">
      <m.div
        style={reduce ? undefined : { rotateX, scale }}
        initial={reduce ? undefined : { opacity: 0, y: 40 }}
        animate={reduce ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="rounded-2xl border border-line bg-white shadow-2xl shadow-signal/10 dark:border-lineDark dark:bg-panelDark"
      >
        <m.div
          animate={reduce ? undefined : { y: [0, -8, 0] }}
          transition={reduce ? undefined : { duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="overflow-hidden rounded-2xl"
        >
          {/* Window chrome */}
          <div className="flex items-center gap-2 border-b border-line px-4 py-3 dark:border-lineDark">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="ml-3 font-display text-[12.5px] font-bold text-ink dark:text-inkDark">
              Nibble<span className="text-signal">Forms</span>
            </span>
            <span className="ml-auto flex items-center gap-1 rounded-lg bg-gradient-to-r from-signal to-accent2 px-2.5 py-1 font-body text-[11px] font-semibold text-white">
              <Plus size={11} /> Create
            </span>
          </div>

          <div className="flex">
            {/* Sidebar replica */}
            <div className="hidden w-44 shrink-0 border-r border-line bg-paper/60 p-3 sm:block dark:border-lineDark dark:bg-night/40">
              <div className="space-y-0.5">
                {NAV.map((item) => (
                  <div
                    key={item.label}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 font-body text-[11.5px] ${
                      item.active
                        ? "bg-signalSoft/20 font-semibold text-signal dark:text-signalSoft"
                        : "text-slate-500 dark:text-mutedDark"
                    }`}
                  >
                    <item.icon size={12} />
                    {item.label}
                  </div>
                ))}
              </div>
              <p className="mt-3 px-2 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400 dark:text-mutedDark">
                Organisation
              </p>
              <div className="mt-1 space-y-0.5">
                {ORG_NAV.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 font-body text-[11.5px] text-slate-500 dark:text-mutedDark"
                  >
                    <item.icon size={12} />
                    {item.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Main pane */}
            <div className="min-w-0 flex-1 p-4 sm:p-5">
              <p className="font-display text-[15px] font-bold text-ink dark:text-inkDark">
                Good afternoon 👋
              </p>
              <p className="font-body text-[11.5px] text-slate-400 dark:text-mutedDark">Overview</p>

              <div className="mt-3 grid grid-cols-3 gap-2.5">
                {STATS.map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl border border-line bg-white p-3 dark:border-lineDark dark:bg-night/40"
                  >
                    <p className="font-display text-lg font-bold text-ink dark:text-inkDark">{s.value}</p>
                    <p className="font-body text-[10.5px] text-slate-400 dark:text-mutedDark">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-xl border border-line bg-white p-3 dark:border-lineDark dark:bg-night/40">
                <p className="font-body text-[11px] font-semibold text-ink dark:text-inkDark">
                  Response Activity
                </p>
                <svg
                  viewBox="0 0 320 80"
                  className="mt-2 h-20 w-full"
                  role="img"
                  aria-label="Response activity chart"
                >
                  <defs>
                    <linearGradient id="nibble-mockup-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6D28D9" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#6D28D9" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0 62 L40 48 L80 54 L120 30 L160 38 L200 20 L240 28 L280 12 L320 18 L320 80 L0 80 Z"
                    fill="url(#nibble-mockup-fill)"
                  />
                  <path
                    d="M0 62 L40 48 L80 54 L120 30 L160 38 L200 20 L240 28 L280 12 L320 18"
                    fill="none"
                    stroke="#6D28D9"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>
        </m.div>
      </m.div>
    </div>
  );
}
