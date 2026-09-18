"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, m, useMotionValueEvent, useScroll } from "framer-motion";
import { Menu, Moon, Sun, X } from "lucide-react";
import { applyTheme, type ThemeChoice } from "@/lib/theme";

interface Props {
  /** Signed-in visitors get a "Go to dashboard" CTA instead of "Start building". */
  authed: boolean;
  /**
   * True on `/`. On other public pages (/templates) the section links are
   * rewritten to `/#features` so they still land somewhere real.
   */
  onHome?: boolean;
}

const SECTIONS = [
  { label: "Product", hash: "#product" },
  { label: "Features", hash: "#features" },
  { label: "AI", hash: "#ai" },
  { label: "Pricing", hash: "#pricing" },
];

export function LandingNav({ authed, onHome = true }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 16));

  function toggleTheme() {
    // Same contract as AppHeader: the <html> class is the source of truth,
    // applyTheme flips it and the pre-paint script's value stays authoritative.
    const next: ThemeChoice = document.documentElement.classList.contains("dark") ? "light" : "dark";
    applyTheme(next);
    window.dispatchEvent(new Event("nibble:theme-changed"));
  }

  const prefix = onHome ? "" : "/";
  const homeHref = (hash: string) => `${prefix}${hash}`;
  const startHref = authed ? "/dashboard" : "/signup";
  const startLabel = authed ? "Go to dashboard" : "Start Building";

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        scrolled
          ? "border-b border-line bg-white/80 backdrop-blur-md dark:border-lineDark dark:bg-night/80"
          : "border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3.5">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="NibbleForms home">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-signal to-accent2 font-display text-[13px] font-bold text-white">
            N
          </span>
          <span className="font-display text-[15px] font-bold text-ink dark:text-inkDark">
            Nibble<span className="text-signal">Forms</span>
          </span>
        </Link>

        <div className="ml-4 hidden items-center gap-1 md:flex">
          {SECTIONS.map((s) => (
            <a
              key={s.label}
              href={homeHref(s.hash)}
              className="rounded-lg px-3 py-1.5 font-body text-[13px] font-medium text-slate-600 transition hover:bg-paper hover:text-ink dark:text-mutedDark dark:hover:bg-panelDark dark:hover:text-inkDark"
            >
              {s.label}
            </a>
          ))}
          <Link
            href="/templates"
            className="rounded-lg px-3 py-1.5 font-body text-[13px] font-medium text-slate-600 transition hover:bg-paper hover:text-ink dark:text-mutedDark dark:hover:bg-panelDark dark:hover:text-inkDark"
          >
            Templates
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-slate-500 transition hover:border-signal hover:text-signal dark:border-lineDark dark:text-mutedDark"
          >
            <Sun size={15} className="hidden dark:block" />
            <Moon size={15} className="block dark:hidden" />
          </button>

          {!authed && (
            <Link
              href="/login"
              className="hidden rounded-lg px-3 py-1.5 font-body text-[13px] font-medium text-ink transition hover:bg-paper sm:block dark:text-inkDark dark:hover:bg-panelDark"
            >
              Log in
            </Link>
          )}
          <Link
            href={startHref}
            className="hidden rounded-lg bg-gradient-to-r from-signal to-accent2 px-3.5 py-1.5 font-body text-[13px] font-semibold text-white shadow-sm transition hover:opacity-90 sm:block"
          >
            {startLabel}
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-slate-500 md:hidden dark:border-lineDark dark:text-mutedDark"
          >
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </nav>

      <AnimatePresence initial={false}>
        {open && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden border-t border-line bg-white md:hidden dark:border-lineDark dark:bg-night"
          >
            <div className="flex flex-col gap-1 px-5 py-3">
              {SECTIONS.map((s) => (
                <a
                  key={s.label}
                  href={homeHref(s.hash)}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2 font-body text-sm font-medium text-slate-600 dark:text-mutedDark"
                >
                  {s.label}
                </a>
              ))}
              <Link
                href="/templates"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 font-body text-sm font-medium text-slate-600 dark:text-mutedDark"
              >
                Templates
              </Link>
              <div className="mt-2 flex gap-2">
                {!authed && (
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-lg border border-line px-3 py-2 text-center font-body text-sm font-medium text-ink dark:border-lineDark dark:text-inkDark"
                  >
                    Log in
                  </Link>
                )}
                <Link
                  href={startHref}
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-lg bg-gradient-to-r from-signal to-accent2 px-3 py-2 text-center font-body text-sm font-semibold text-white"
                >
                  {startLabel}
                </Link>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </header>
  );
}
