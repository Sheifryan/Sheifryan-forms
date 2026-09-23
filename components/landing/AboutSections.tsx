import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Database,
  Inbox,
  LayoutGrid,
  Scale,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { FIELD_GROUPS, THEMES } from "@/lib/schema";
import { TEMPLATES } from "@/lib/templates";
import { CountUp } from "./CountUp";
import { Reveal, Stagger, StaggerItem } from "./Reveal";

/**
 * Server-rendered sections for the public /about page.
 *
 * Every figure comes from the module that owns the data (lib/schema.ts,
 * lib/templates.ts) rather than a hard-coded number, so this page can't drift
 * from what the product actually ships. CountUp is the only client component
 * involved, and it server-renders the true value first.
 */

const FIELD_COUNT = FIELD_GROUPS.reduce((total, group) => total + group.types.length, 0);
const THEME_COUNT = Object.keys(THEMES).length;
const CATEGORY_COUNT = new Set(TEMPLATES.map((t) => t.category)).size;

const LOOP = [
  {
    icon: LayoutGrid,
    title: "Build",
    body: `Assemble the form from ${FIELD_COUNT} field types, conditional rules and accent themes.`,
  },
  { icon: Share2, title: "Share", body: "Send a link, print a QR code, or embed the form directly in your own site." },
  {
    icon: Inbox,
    title: "Collect",
    body: "Responses and files arrive, validated server-side before anything is stored.",
  },
  {
    icon: BarChart3,
    title: "Understand",
    body: "Analytics and plain-English answers, computed from your real submissions.",
  },
  { icon: Workflow, title: "Automate", body: "Workflows and webhooks move each response on to the work that follows." },
];

const PRINCIPLES = [
  {
    icon: Database,
    title: "Your data stays yours",
    body: "Forms, responses and files live in your own workspace, scoped by Row Level Security in the database — not just hidden in the interface.",
  },
  {
    icon: ShieldCheck,
    title: "Secure by default",
    body: "Password gates, close dates and response limits are enforced on the server, so a visitor can't bypass them by editing the page.",
  },
  {
    icon: Sparkles,
    title: "AI that assists, never invents",
    body: "AI drafts, improves, critiques and summarises. It never publishes for you, and it asks you to rephrase rather than guessing at data you don't collect.",
  },
  {
    icon: LayoutGrid,
    title: "One workspace, no hand-offs",
    body: "Build, share, collect, analyse and automate in the same place — no exporting between four tools to finish the job.",
  },
  {
    icon: Scale,
    title: "Honest limits",
    body: "The pricing page and the docs are generated from the same plan data the app enforces, so what you read is what you get.",
  },
  {
    icon: Users,
    title: "Ready for teams",
    body: "Organisation workspaces add members, roles, folders and an activity log, so shared work has an audit trail.",
  },
];

export function AboutHero({ authed }: { authed: boolean }) {
  return (
    <section className="relative overflow-hidden pb-12 pt-14 sm:pt-20">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 -top-32 h-[26rem] w-[26rem] rounded-full bg-signal/10 blur-3xl dark:bg-signal/20" />
        <div className="absolute -right-20 top-10 h-[22rem] w-[22rem] rounded-full bg-accent2/10 blur-3xl dark:bg-accent2/15" />
      </div>

      <div className="mx-auto max-w-3xl text-center">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-signal dark:text-signalSoft">
          About NibbleForms
        </p>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.1] tracking-tight text-ink dark:text-inkDark sm:text-5xl">
          We build forms that do more than{" "}
          <span className="bg-gradient-to-r from-signal to-accent2 bg-clip-text text-transparent">
            collect answers.
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl font-body text-[15px] leading-relaxed text-slate-600 dark:text-mutedDark sm:text-base">
          NibbleForms is a form platform for people who care about what happens after the submit button — the responses,
          the files, the analysis, and the work that follows.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href={authed ? "/dashboard" : "/signup"}
            className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-signal to-accent2 px-6 py-3 font-body text-sm font-semibold text-white shadow-lg shadow-signal/20 transition hover:opacity-90 sm:w-auto"
          >
            {authed ? "Go to dashboard" : "Start Building Free"}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/docs"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-6 py-3 font-body text-sm font-semibold text-ink transition hover:border-signal hover:text-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark sm:w-auto"
          >
            <BookOpen size={16} />
            Read the documentation
          </Link>
        </div>
      </div>
    </section>
  );
}

export function AboutMission() {
  return (
    <section className="border-y border-line bg-white py-16 dark:border-lineDark dark:bg-panelDark sm:py-20">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-[1.2fr_1fr]">
        <Reveal>
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink dark:text-inkDark sm:text-3xl">
            A form is where the work starts, not where it ends.
          </h2>
          <div className="mt-4 space-y-4 font-body text-[14.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
            <p>
              Most form tools treat the submission as the finish line. You build the questions, collect the answers,
              export a spreadsheet, and then do the real work somewhere else — copying rows between tools, chasing
              colleagues, rebuilding the same context by hand.
            </p>
            <p>
              NibbleForms keeps the whole loop in one workspace. The questions, the responses, the uploaded files, the
              analysis and the automation all live together, so nothing has to be handed off to a second system just to
              be useful.
            </p>
            <p>
              It is built for the person who owns the outcome: a fundraiser watching signups climb, an HR lead working
              through applications, a product team reading feedback at scale — and for the teams who need those
              responses shared, assigned and auditable rather than sitting in one person&apos;s inbox.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="rounded-xl border border-line bg-paper p-6 dark:border-lineDark dark:bg-night/40">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400 dark:text-mutedDark">
              What that means in practice
            </p>
            <ul className="mt-4 space-y-3">
              {[
                "One form can collect answers, files and payment.",
                "Responses are validated on the server, not just the browser.",
                "Analysis and AI read the real submissions, not a sample export.",
                "Automation runs the moment a response lands.",
                "Teams share the same workspace, with roles and an activity log.",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 font-body text-[13px] leading-relaxed text-slate-600 dark:text-mutedDark"
                >
                  <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent2" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/docs#use-cases"
              className="group mt-5 inline-flex items-center gap-1.5 font-body text-[13px] font-semibold text-signal transition hover:text-accent2 dark:text-signalSoft"
            >
              See the use cases
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function AboutLoop() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink dark:text-inkDark sm:text-3xl">
            The loop we optimise for.
          </h2>
          <p className="mt-3 font-body text-[14.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
            Five steps that normally span four products — kept in one workspace, in order.
          </p>
        </Reveal>

        <Stagger className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {LOOP.map((step, i) => (
            <StaggerItem key={step.title}>
              <div className="h-full rounded-xl border border-line bg-white p-4 dark:border-lineDark dark:bg-panelDark">
                <div className="flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-signalSoft/20 text-signal dark:text-signalSoft">
                    <step.icon size={16} />
                  </span>
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-slate-400 dark:text-mutedDark">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-3 font-display text-[14px] font-bold text-ink dark:text-inkDark">{step.title}</h3>
                <p className="mt-1.5 font-body text-[12px] leading-relaxed text-slate-600 dark:text-mutedDark">
                  {step.body}
                </p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

export function AboutPrinciples() {
  return (
    <section className="border-y border-line bg-white py-16 dark:border-lineDark dark:bg-panelDark sm:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink dark:text-inkDark sm:text-3xl">
            What we refuse to compromise on.
          </h2>
          <p className="mt-3 font-body text-[14.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
            These are product decisions, not marketing lines — each one is visible in how the app is built.
          </p>
        </Reveal>

        <Stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PRINCIPLES.map((principle) => (
            <StaggerItem key={principle.title}>
              <div className="h-full rounded-xl border border-line bg-paper p-5 dark:border-lineDark dark:bg-night/40">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-signalSoft/20 text-signal dark:text-signalSoft">
                  <principle.icon size={18} />
                </span>
                <h3 className="mt-4 font-display text-[15px] font-bold text-ink dark:text-inkDark">
                  {principle.title}
                </h3>
                <p className="mt-2 font-body text-[13px] leading-relaxed text-slate-600 dark:text-mutedDark">
                  {principle.body}
                </p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

export function AboutNumbers() {
  const stats: { value: number; label: string }[] = [
    { value: FIELD_COUNT, label: "Field types in the builder" },
    { value: TEMPLATES.length, label: "Ready-to-use templates" },
    { value: CATEGORY_COUNT, label: "Template categories" },
    { value: THEME_COUNT, label: "Accent themes per form" },
  ];

  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink dark:text-inkDark sm:text-3xl">
            Where we are today.
          </h2>
          <p className="mt-3 font-body text-[14.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
            Numbers below are read straight from the product, not typed into this page.
          </p>
        </Reveal>

        <Stagger className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <StaggerItem key={stat.label}>
              <div className="h-full rounded-xl border border-line bg-white p-5 text-center dark:border-lineDark dark:bg-panelDark">
                <p className="font-display text-3xl font-bold tracking-tight text-ink dark:text-inkDark">
                  <CountUp value={stat.value} />
                </p>
                <p className="mt-1.5 font-body text-[12.5px] text-slate-500 dark:text-mutedDark">{stat.label}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal className="mt-10 flex flex-wrap items-center justify-center gap-3" delay={0.05}>
          <Link
            href="/docs"
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-4 py-2.5 font-body text-[13px] font-semibold text-ink transition hover:border-signal hover:text-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
          >
            <BookOpen size={15} />
            Read the documentation
          </Link>
          <Link
            href="/templates"
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-4 py-2.5 font-body text-[13px] font-semibold text-ink transition hover:border-signal hover:text-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
          >
            Browse templates
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
