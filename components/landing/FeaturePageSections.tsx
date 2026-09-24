import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  FileUp,
  MessageSquare,
  Sparkles,
  TrendingUp,
  Wand2,
} from "lucide-react";
import { FIELD_GROUPS, FIELD_LABELS, THEMES } from "@/lib/schema";
import { Reveal, Stagger, StaggerItem } from "./Reveal";

/**
 * Page-specific sections for /features and /ai.
 *
 * Everything numeric or label-like is derived from lib/schema.ts — the module
 * the builder palette, the form renderer and the server-side validator all read
 * from — so these pages can't advertise a field type or theme the product
 * doesn't ship. Same "no drift" rule as Pricing.tsx and LandingTemplates.tsx.
 */

const FIELD_COUNT = FIELD_GROUPS.reduce((total, group) => total + group.types.length, 0);
const THEME_COUNT = Object.keys(THEMES).length;
const THEME_NAMES = Object.values(THEMES)
  .map((theme) => theme.label)
  .join(", ");

/** The full field catalogue, generated from the real palette groups. */
export function FieldTypesShowcase() {
  return (
    <section
      id="fields"
      className="scroll-mt-24 border-y border-line bg-white py-16 sm:py-20 dark:border-lineDark dark:bg-panelDark"
    >
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl dark:text-inkDark">
            {FIELD_COUNT} field types. Every shape of question.
          </h2>
          <p className="mt-3 font-body text-[14.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
            The builder palette, the renderer and the server-side validator all read from one
            catalogue, so a field always behaves the way the builder says it will.
          </p>
        </Reveal>

        <Stagger className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FIELD_GROUPS.map((group) => (
            <StaggerItem key={group.label}>
              <div className="h-full rounded-xl border border-line bg-paper p-5 dark:border-lineDark dark:bg-night/40">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400 dark:text-mutedDark">
                  {group.label}
                </p>
                <ul className="mt-3 space-y-1.5">
                  {group.types.map((type) => (
                    <li
                      key={type}
                      className="flex items-center gap-2 font-body text-[13px] text-ink dark:text-inkDark"
                    >
                      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-signalSoft" />
                      {FIELD_LABELS[type]}
                    </li>
                  ))}
                </ul>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal className="mt-8 grid gap-4 sm:grid-cols-3" delay={0.05}>
          {[
            {
              title: "Conditional rules",
              body: "Show or hide a field based on earlier answers — equals, not equals or contains. Rules are combined with AND.",
            },
            {
              title: "Multi-page forms",
              body: "Drop a Page Break to split a long form into pages, each validated before the respondent can continue.",
            },
            {
              title: `${THEME_COUNT} accent themes`,
              body: `One accent per form — ${THEME_NAMES} — carried through the public page and the embed alike.`,
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-line bg-paper p-5 dark:border-lineDark dark:bg-night/40"
            >
              <h3 className="font-display text-[14px] font-bold text-ink dark:text-inkDark">
                {item.title}
              </h3>
              <p className="mt-1.5 font-body text-[12.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
                {item.body}
              </p>
            </div>
          ))}
        </Reveal>

        <Reveal className="mt-8 text-center" delay={0.1}>
          <Link
            href="/docs#fields"
            className="group inline-flex items-center gap-1.5 font-body text-[13.5px] font-semibold text-signal transition hover:text-accent2 dark:text-signalSoft"
          >
            Read the field reference
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

const AI_CAPABILITIES = [
  {
    icon: Sparkles,
    title: "Generate a form",
    body: "Describe the form in plain English and get real fields back, added straight into the builder.",
  },
  {
    icon: FileUp,
    title: "Import a form",
    body: "Upload a photo or scan, a PDF or a Word document and turn it into editable fields.",
  },
  {
    icon: Wand2,
    title: "Improve wording",
    body: "Rewrite labels, help text and options so every question reads clearly.",
  },
  {
    icon: ClipboardCheck,
    title: "Critique before publishing",
    body: "Review structure and clarity, and catch problems before your respondents do.",
  },
  {
    icon: MessageSquare,
    title: "Ask your data",
    body: "Ask plain-English questions about one form's submissions and get counts, tables and charts back.",
  },
  {
    icon: TrendingUp,
    title: "Generate insights",
    body: "Summarise what stands out across a form's responses, right in Analytics.",
  },
];

export function AiCapabilities() {
  return (
    <section className="border-y border-line bg-white py-16 sm:py-20 dark:border-lineDark dark:bg-panelDark">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl dark:text-inkDark">
            AI that helps at every step.
          </h2>
          <p className="mt-3 font-body text-[14.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
            AI drafts, improves, reviews and explains — and it reads your real submissions rather than
            guessing at them.
          </p>
        </Reveal>

        <Stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {AI_CAPABILITIES.map((capability) => (
            <StaggerItem key={capability.title}>
              <div className="h-full rounded-xl border border-line bg-paper p-5 dark:border-lineDark dark:bg-night/40">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-signalSoft/20 text-signal dark:text-signalSoft">
                  <capability.icon size={18} />
                </span>
                <h3 className="mt-4 font-display text-[15px] font-bold text-ink dark:text-inkDark">
                  {capability.title}
                </h3>
                <p className="mt-2 font-body text-[13px] leading-relaxed text-slate-600 dark:text-mutedDark">
                  {capability.body}
                </p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal className="mt-8 text-center" delay={0.05}>
          <Link
            href="/docs#ai"
            className="group inline-flex items-center gap-1.5 font-body text-[13.5px] font-semibold text-signal transition hover:text-accent2 dark:text-signalSoft"
          >
            How AI works, and what it costs
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
