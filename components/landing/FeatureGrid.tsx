import {
  BarChart3,
  LayoutGrid,
  Lock,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "./Reveal";

const FEATURES = [
  {
    icon: LayoutGrid,
    title: "Powerful Form Builder",
    lead: "Build without the complexity.",
    body: "Create forms using a flexible drag-and-drop builder with fields, rules, settings, themes, integrations and sharing controls.",
    badge: null,
  },
  {
    icon: Sparkles,
    title: "AI-Powered Forms",
    lead: "Let AI help you build smarter.",
    body: "Generate, improve, critique and analyze forms with AI. Ask questions about your collected data and get useful insights faster.",
    badge: "AI POWERED",
  },
  {
    icon: BarChart3,
    title: "Analytics",
    lead: "Understand every response.",
    body: "Turn submissions into meaningful insights with analytics designed to help you understand what your audience is telling you.",
    badge: null,
  },
  {
    icon: Workflow,
    title: "Workflows",
    lead: "Make every submission trigger action.",
    body: "Create workflows that help move information from submission to the next step automatically.",
    badge: null,
  },
  {
    icon: Lock,
    title: "Secure File Collection",
    lead: "Collect files without the mess.",
    body: "Allow respondents to upload documents and files while keeping stored files protected with private storage and signed access URLs.",
    badge: null,
  },
  {
    icon: ShieldCheck,
    title: "Smart Response Controls",
    lead: "Stay in control of your forms.",
    body: "Protect forms with password protection, close dates, response limits, rate limiting and honeypot protection.",
    badge: null,
  },
];

/** 3 x 2 feature grid, staggered in on scroll. */
export function FeatureGrid() {
  return (
    <section id="features" className="scroll-mt-20 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl dark:text-inkDark">
            One workspace. Every part of your form workflow.
          </h2>
          <p className="mt-3 font-body text-[14.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
            From the first question to the final response, NibbleForms gives you the tools to build,
            collect, analyze and automate.
          </p>
        </Reveal>

        <Stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <StaggerItem key={f.title}>
              <div className="group h-full rounded-xl border border-line bg-white p-5 transition hover:-translate-y-1 hover:border-signal hover:shadow-lg hover:shadow-signal/5 dark:border-lineDark dark:bg-panelDark">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-signalSoft/20 text-signal dark:text-signalSoft">
                    <f.icon size={18} />
                  </span>
                  {f.badge && (
                    <span className="rounded-full bg-gradient-to-r from-signal to-accent2 px-2.5 py-1 font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-white">
                      {f.badge}
                    </span>
                  )}
                </div>
                <h3 className="mt-4 font-display text-[15.5px] font-bold text-ink dark:text-inkDark">
                  {f.title}
                </h3>
                <p className="mt-1 font-body text-[13px] font-semibold text-signal dark:text-signalSoft">
                  {f.lead}
                </p>
                <p className="mt-2 font-body text-[13px] leading-relaxed text-slate-600 dark:text-mutedDark">
                  {f.body}
                </p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
