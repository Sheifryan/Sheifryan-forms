"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

interface NavSection {
  id: string;
  title: string;
  articles: { id: string; title: string }[];
}

/**
 * Sticky "on this page" sidebar for /docs.
 *
 * The content itself is server-rendered; this component only receives the slim
 * section/article list (see lib/docs.ts → docNavSections) so the whole content
 * corpus never crosses into the client bundle.
 *
 * Active-section tracking is a plain scroll listener rather than an
 * IntersectionObserver: it needs "the last heading scrolled past", which is
 * exact and cheap with a rAF-throttled comparison of bounding rects.
 */
export function DocsNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const ids = sections.flatMap((section) => [section.id, ...section.articles.map((a) => a.id)]);
    let frame = 0;

    function update() {
      frame = 0;
      // Anything whose top has passed this line counts as "current".
      const offset = 140;
      let current = ids[0] ?? "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= offset) current = id;
      }
      setActive(current);
    }

    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections]);

  const sectionClass = (id: string) =>
    `block rounded-md px-2 py-1.5 font-body text-[12.5px] font-semibold transition ${
      active === id
        ? "bg-signalSoft/20 text-signal dark:text-signalSoft"
        : "text-ink hover:text-signal dark:text-inkDark dark:hover:text-signalSoft"
    }`;

  const articleClass = (id: string) =>
    `block rounded-md px-2 py-1 font-body text-[12px] transition ${
      active === id
        ? "text-signal dark:text-signalSoft"
        : "text-slate-500 hover:text-ink dark:text-mutedDark dark:hover:text-inkDark"
    }`;

  return (
    <div className="lg:sticky lg:top-24">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-xl border border-line bg-white px-4 py-3 font-body text-[13px] font-semibold text-ink dark:border-lineDark dark:bg-panelDark dark:text-inkDark lg:hidden"
      >
        On this page
        <ChevronDown size={15} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <nav
        aria-label="Documentation contents"
        className={`${
          open ? "mt-3 block" : "hidden"
        } rounded-xl border border-line bg-white p-4 dark:border-lineDark dark:bg-panelDark lg:mt-0 lg:block lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto`}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400 dark:text-mutedDark">
          On this page
        </p>
        <ul className="mt-3 space-y-4">
          {sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} onClick={() => setOpen(false)} className={sectionClass(section.id)}>
                {section.title}
              </a>
              <ul className="mt-1 space-y-0.5 border-l border-line pl-2 dark:border-lineDark">
                {section.articles.map((article) => (
                  <li key={article.id}>
                    <a href={`#${article.id}`} onClick={() => setOpen(false)} className={articleClass(article.id)}>
                      {article.title}
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
