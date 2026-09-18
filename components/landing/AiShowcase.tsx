"use client";

import { m, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Reveal } from "./Reveal";

const FINDINGS = ["Customer service", "Delivery times", "Product availability"];

/**
 * AI showcase. The animated element is a blurred plum→fuchsia gradient layer
 * whose background position loops; with reduced motion the layer is rendered
 * statically (same look, no movement).
 */
export function AiShowcase() {
  const reduce = useReducedMotion();

  return (
    <section id="ai" className="scroll-mt-20 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-signalSoft/20 px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-signal dark:text-signalSoft">
              <Sparkles size={11} /> AI powered
            </span>
            <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl dark:text-inkDark">
              Your data. Your questions. AI-powered answers.
            </h2>
            <p className="mt-3 font-body text-[14.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
              Stop digging through hundreds of responses manually. NibbleForms can help you generate
              forms, improve questions, critique your form structure, analyze responses and interact
              with your collected data.
            </p>
            <ul className="mt-5 space-y-2">
              {[
                "Generate a form from a plain-English prompt",
                "Review and improve an existing form",
                "Summarise responses into plain-language findings",
                "Export the answers you asked for as CSV",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 font-body text-[13px] text-slate-600 dark:text-mutedDark"
                >
                  <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent2" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="relative rounded-2xl border border-lineDark bg-night p-6 shadow-2xl shadow-signal/20">
              {!reduce && (
                <m.div
                  aria-hidden
                  animate={{
                    backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                  }}
                  transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                  className="pointer-events-none absolute -inset-3 -z-10 rounded-3xl bg-[linear-gradient(110deg,#6D28D9,#C026D3,#6D28D9)] bg-[length:200%_200%] opacity-30 blur-2xl"
                />
              )}

              <div className="flex items-center gap-2 text-signalSoft">
                <Sparkles size={14} />
                <span className="font-mono text-[10.5px] uppercase tracking-[0.18em]">Ask your data</span>
              </div>

              <p className="mt-4 rounded-xl border border-lineDark bg-panelDark px-4 py-3 font-body text-[13px] text-inkDark">
                &ldquo;What are the most common complaints?&rdquo;
              </p>

              <div className="mt-5 border-t border-lineDark pt-5">
                <div className="flex items-center gap-2 text-accent2">
                  <Sparkles size={13} />
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.18em]">AI analysis</span>
                </div>
                <p className="mt-3 font-body text-[13px] leading-relaxed text-inkDark/90">
                  The most common responses mention:
                </p>
                <ul className="mt-3 space-y-2">
                  {FINDINGS.map((f) => (
                    <li key={f} className="flex items-center gap-2 font-body text-[13px] text-inkDark">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-signalSoft" />
                      {f}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-mutedDark">
                  Insights cached per form · export to CSV
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
