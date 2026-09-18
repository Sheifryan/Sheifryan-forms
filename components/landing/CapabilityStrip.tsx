import { Reveal } from "./Reveal";

const CAPABILITIES = [
  "Form Builder",
  "AI",
  "Analytics",
  "Workflows",
  "File Uploads",
  "Integrations",
];

/** Capability strip — the "this is more than a basic form tool" signal. */
export function CapabilityStrip() {
  return (
    <section className="border-y border-line bg-white dark:border-lineDark dark:bg-panelDark">
      <Reveal className="mx-auto max-w-6xl px-5 py-8">
        <p className="text-center font-display text-[15px] font-bold text-ink dark:text-inkDark">
          Everything you need to build better forms
        </p>
        <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          {CAPABILITIES.map((c, i) => (
            <li key={c} className="flex items-center gap-3">
              {i > 0 && (
                <span aria-hidden className="text-signalSoft">
                  ·
                </span>
              )}
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-mutedDark">
                {c}
              </span>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
