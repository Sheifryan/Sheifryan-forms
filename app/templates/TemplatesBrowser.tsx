"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import type { TemplateSummary } from "@/lib/templates";
import { categoryAccent, categoryIcon } from "@/lib/templateCategories";
import { Stagger, StaggerItem } from "@/components/landing/Reveal";

/**
 * Public, read-only template browser. Category filter + search over the
 * summaries the server passes in (no `build` functions, see
 * lib/templates.ts → templateSummaries).
 */
export function TemplatesBrowser({
  templates,
  categories,
  authed,
}: {
  templates: TemplateSummary[];
  categories: string[];
  authed: boolean;
}) {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (category !== "All" && t.category !== category) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    });
  }, [templates, category, query]);

  // Signed-in visitors go straight to the gallery modal they already have.
  const ctaHref = authed ? "/dashboard?open=templates" : "/signup";

  return (
    <div className="mt-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-mutedDark"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates"
            aria-label="Search templates"
            className="w-full rounded-lg border border-line bg-white py-2 pl-8 pr-3 font-body text-[13px] text-ink placeholder:text-slate-400 focus:border-signal focus:outline-none dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
          />
        </div>
        <p className="font-body text-[12px] text-slate-400 dark:text-mutedDark">
          {filtered.length} of {templates.length} templates
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {["All", ...categories].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`rounded-full border px-3 py-1.5 font-body text-[12px] font-medium transition ${
              category === c
                ? "border-signal bg-signalSoft/20 text-signal dark:text-signalSoft"
                : "border-line text-slate-500 hover:border-signal hover:text-signal dark:border-lineDark dark:text-mutedDark"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-12 text-center font-body text-[13.5px] text-slate-500 dark:text-mutedDark">
          No templates match that search.
        </p>
      ) : (
        <Stagger className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const Icon = categoryIcon(t.category);
            const accent = categoryAccent(t.category);
            return (
              <StaggerItem key={t.id}>
                <div className="flex h-full flex-col rounded-xl border border-line bg-white p-4 transition hover:-translate-y-1 hover:border-signal hover:shadow-md dark:border-lineDark dark:bg-panelDark">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
                      <Icon size={16} />
                    </span>
                    {t.featured && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-amber-600">
                        Popular
                      </span>
                    )}
                  </div>
                  <h2 className="mt-3 font-display text-[14px] font-bold text-ink dark:text-inkDark">
                    {t.title}
                  </h2>
                  <p className="mt-1 flex-1 font-body text-[12px] leading-relaxed text-slate-500 dark:text-mutedDark">
                    {t.description}
                  </p>
                  <p className="mt-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-slate-400 dark:text-mutedDark">
                    {t.category} · {t.fieldCount} fields
                  </p>
                  <Link
                    href={ctaHref}
                    className="group mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 font-body text-[12.5px] font-semibold text-ink transition hover:border-signal hover:text-signal dark:border-lineDark dark:text-inkDark"
                  >
                    {authed ? "Open in dashboard" : "Use this template"}
                    <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
    </div>
  );
}
