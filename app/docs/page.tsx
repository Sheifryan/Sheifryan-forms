import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  HelpCircle,
  LayoutGrid,
  Lightbulb,
  Share2,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { MotionProvider } from "@/components/landing/MotionProvider";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { Reveal } from "@/components/landing/Reveal";
import { DOC_SECTIONS, docNavSections, type DocArticle, type DocSection, type DocTable } from "@/lib/docs";
import { isSignedIn } from "@/lib/landing-session";
import { DocsNav } from "./DocsNav";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "How to build forms, collect and analyse responses, run workflows, integrate webhooks and embed forms with NibbleForms.",
  openGraph: {
    title: "NibbleForms documentation",
    description:
      "Guides for building forms, sharing and embedding them, reading responses, and automating with workflows and webhooks.",
    type: "article",
  },
};

/** Section → icon. Keyed by lib/docs.ts section id; a missing entry falls back. */
const SECTION_ICONS: Record<string, typeof BookOpen> = {
  "getting-started": BookOpen,
  build: LayoutGrid,
  share: Share2,
  collect: BarChart3,
  automate: Workflow,
  "use-cases": Lightbulb,
  security: ShieldCheck,
  faq: HelpCircle,
};

/** The three guides people arrive looking for, pinned above the fold. */
const QUICK_LINKS = [
  { label: "Webhook integration", href: "#webhooks" },
  { label: "Embed a form", href: "#embedding" },
  { label: "Use cases", href: "#use-cases" },
];

/** Render `backticked` spans from content strings as inline code. */
function Inline({ text }: { text: string }) {
  const parts = text.split("`");
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <code
            key={i}
            className="rounded bg-paper px-1 py-0.5 font-mono text-[11.5px] text-signal dark:bg-night dark:text-signalSoft"
          >
            {part}
          </code>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <figure className="mt-4 overflow-hidden rounded-lg border border-lineDark bg-night">
      <figcaption className="border-b border-lineDark px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-mutedDark">
        {label}
      </figcaption>
      <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-slate-100">{code}</pre>
    </figure>
  );
}

function DocTableView({ table }: { table: DocTable }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-line dark:border-lineDark">
      <table className="w-full min-w-[34rem] border-collapse text-left">
        <thead className="bg-paper dark:bg-night/40">
          <tr>
            {table.headers.map((header) => (
              <th
                key={header}
                scope="col"
                className="border-b border-line px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:border-lineDark dark:text-mutedDark"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-line last:border-0 dark:border-lineDark">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`px-3 py-2 align-top font-body text-[12.5px] leading-relaxed ${
                    cellIndex === 0 ? "font-semibold text-ink dark:text-inkDark" : "text-slate-600 dark:text-mutedDark"
                  }`}
                >
                  <Inline text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ArticleBlock({ article }: { article: DocArticle }) {
  return (
    <article
      id={article.id}
      className="scroll-mt-24 border-t border-line pt-8 first:border-0 first:pt-0 dark:border-lineDark"
    >
      <h3 className="font-display text-lg font-bold tracking-tight text-ink dark:text-inkDark">{article.title}</h3>

      {article.body?.map((paragraph) => (
        <p key={paragraph} className="mt-3 font-body text-[13.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
          <Inline text={paragraph} />
        </p>
      ))}

      {article.steps && (
        <ol className="mt-4 space-y-2">
          {article.steps.map((step, i) => (
            <li
              key={step}
              className="flex gap-2.5 font-body text-[13px] leading-relaxed text-slate-600 dark:text-mutedDark"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-signalSoft/25 font-mono text-[10px] font-medium text-signal dark:text-signalSoft">
                {i + 1}
              </span>
              <span>
                <Inline text={step} />
              </span>
            </li>
          ))}
        </ol>
      )}

      {article.bullets && (
        <ul className="mt-4 space-y-2">
          {article.bullets.map((bullet) => (
            <li
              key={bullet}
              className="flex gap-2.5 font-body text-[13px] leading-relaxed text-slate-600 dark:text-mutedDark"
            >
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent2" />
              <span>
                <Inline text={bullet} />
              </span>
            </li>
          ))}
        </ul>
      )}

      {article.facts && (
        <dl className="mt-4 space-y-2.5">
          {article.facts.map((fact) => (
            <div
              key={fact.term}
              className="rounded-lg border border-line bg-white px-3.5 py-2.5 dark:border-lineDark dark:bg-panelDark"
            >
              <dt className="font-body text-[12.5px] font-semibold text-ink dark:text-inkDark">
                <Inline text={fact.term} />
              </dt>
              <dd className="mt-1 font-body text-[12.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
                <Inline text={fact.detail} />
              </dd>
            </div>
          ))}
        </dl>
      )}

      {article.table && <DocTableView table={article.table} />}

      {article.code?.map((block) => (
        <CodeBlock key={block.label} label={block.label} code={block.code} />
      ))}

      {article.note && (
        <p className="mt-4 rounded-lg border border-signalSoft/40 bg-signalSoft/10 px-3.5 py-3 font-body text-[12.5px] leading-relaxed text-ink dark:border-signalSoft/30 dark:text-inkDark">
          <Inline text={article.note} />
        </p>
      )}
    </article>
  );
}

function SectionBlock({ section, index }: { section: DocSection; index: number }) {
  const Icon = SECTION_ICONS[section.id] ?? BookOpen;

  return (
    <section id={section.id} className={`scroll-mt-24 ${index > 0 ? "mt-16" : ""}`}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-signalSoft/20 text-signal dark:text-signalSoft">
          <Icon size={16} />
        </span>
        <h2 className="font-display text-xl font-bold tracking-tight text-ink dark:text-inkDark sm:text-2xl">
          {section.title}
        </h2>
      </div>
      <p className="mt-2 font-body text-[13.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
        {section.summary}
      </p>

      <div className="mt-6 space-y-8">
        {section.articles.map((article) => (
          <ArticleBlock key={article.id} article={article} />
        ))}
      </div>
    </section>
  );
}

/**
 * Public documentation.
 *
 * Same shell as /templates: MotionProvider → LandingNav → LandingFooter.
 * The content is server-rendered from lib/docs.ts; only the sticky sidebar is a
 * client component, and it receives the slim section/article list rather than
 * the article bodies.
 */
export default async function DocsPage() {
  const authed = await isSignedIn();

  return (
    <MotionProvider>
      <div className="min-h-screen bg-paper text-ink antialiased dark:bg-night dark:text-inkDark">
        <LandingNav authed={authed} />

        <main className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
          <Reveal className="max-w-2xl">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-signal dark:text-signalSoft">
              Documentation
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink dark:text-inkDark sm:text-4xl">
              Everything NibbleForms can do — and how to set it up.
            </h1>
            <p className="mt-3 font-body text-[14.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
              Build forms, share them as links, QR codes or embeds, read what came back, then automate what happens next
              with workflows and webhooks.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {QUICK_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 font-body text-[12px] font-medium text-slate-600 transition hover:border-signal hover:text-signal dark:border-lineDark dark:bg-panelDark dark:text-mutedDark dark:hover:text-signalSoft"
                >
                  {link.label}
                  <ArrowRight size={12} />
                </a>
              ))}
            </div>
          </Reveal>

          <div className="mt-10 grid gap-10 lg:grid-cols-[240px_1fr] lg:gap-12">
            <DocsNav sections={docNavSections()} />

            <div className="min-w-0">
              {DOC_SECTIONS.map((section, index) => (
                <SectionBlock key={section.id} section={section} index={index} />
              ))}

              <div className="mt-14 rounded-xl border border-line bg-white p-6 text-center dark:border-lineDark dark:bg-panelDark">
                <h2 className="font-display text-lg font-bold text-ink dark:text-inkDark">Ready to try it?</h2>
                <p className="mx-auto mt-2 max-w-md font-body text-[13px] leading-relaxed text-slate-600 dark:text-mutedDark">
                  Every plan starts free, and your forms, responses and files stay in your own workspace.
                </p>
                <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    href={authed ? "/dashboard" : "/signup"}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-signal to-accent2 px-5 py-2.5 font-body text-[13px] font-semibold text-white transition hover:opacity-90 sm:w-auto"
                  >
                    {authed ? "Go to dashboard" : "Start Building Free"}
                    <ArrowRight size={15} />
                  </Link>
                  <Link
                    href="/about"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line px-5 py-2.5 font-body text-[13px] font-semibold text-ink transition hover:border-signal hover:text-signal dark:border-lineDark dark:text-inkDark sm:w-auto"
                  >
                    About NibbleForms
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </main>

        <LandingFooter />
      </div>
    </MotionProvider>
  );
}
