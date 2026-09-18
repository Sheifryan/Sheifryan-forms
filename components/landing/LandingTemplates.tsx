import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TEMPLATES } from "@/lib/templates";
import { categoryAccent, categoryIcon } from "@/lib/templateCategories";
import { Reveal, Stagger, StaggerItem } from "./Reveal";

/**
 * Template strip. Uses the same TEMPLATES data as the in-app gallery (31
 * templates across 12 categories), featured first, so this section can never
 * drift from what the product actually ships.
 */
export function LandingTemplates() {
  const featured = TEMPLATES.filter((t) => t.featured);
  const rest = TEMPLATES.filter((t) => !t.featured);
  const shown = [...featured, ...rest].slice(0, 8);

  return (
    <section className="border-y border-line bg-white py-16 sm:py-20 dark:border-lineDark dark:bg-panelDark">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl dark:text-inkDark">
            Start with a template. Make it yours.
          </h2>
          <p className="mt-3 font-body text-[14.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
            Choose from ready-to-use templates and customize them for your workflow — {TEMPLATES.length}{" "}
            templates across {new Set(TEMPLATES.map((t) => t.category)).size} categories.
          </p>
        </Reveal>

        <Stagger className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((t) => {
            const Icon = categoryIcon(t.category);
            const accent = categoryAccent(t.category);
            return (
              <StaggerItem key={t.id}>
                <Link
                  href="/templates"
                  className="group flex h-full flex-col rounded-xl border border-line bg-paper p-4 text-left transition hover:-translate-y-1 hover:border-signal hover:shadow-md dark:border-lineDark dark:bg-night/40"
                >
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
                    <Icon size={16} />
                  </span>
                  <h3 className="mt-3 font-display text-[14px] font-bold text-ink dark:text-inkDark">
                    {t.title}
                  </h3>
                  <p className="mt-1 flex-1 font-body text-[12px] leading-relaxed text-slate-500 dark:text-mutedDark">
                    {t.description}
                  </p>
                  <span className="mt-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-slate-400 dark:text-mutedDark">
                    {t.category}
                  </span>
                </Link>
              </StaggerItem>
            );
          })}
        </Stagger>

        <Reveal className="mt-8 text-center" delay={0.05}>
          <Link
            href="/templates"
            className="group inline-flex items-center gap-1.5 font-body text-[13.5px] font-semibold text-signal transition hover:text-accent2 dark:text-signalSoft"
          >
            Browse all templates
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
