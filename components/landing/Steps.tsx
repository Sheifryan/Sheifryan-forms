import { Fragment } from "react";
import { ArrowDown, ArrowRight } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "./Reveal";

const STEPS = [
  { n: "01", title: "Build", body: "Create your form using the visual builder." },
  { n: "02", title: "Share", body: "Send your form anywhere using a shareable link or QR code." },
  { n: "03", title: "Collect", body: "Receive responses, submissions and files securely." },
  { n: "04", title: "Understand", body: "Analyze your data and use AI to discover insights." },
];

/** "From blank page to actionable data" — the 4-step journey. */
export function Steps() {
  return (
    <section className="border-y border-line bg-white py-16 sm:py-20 dark:border-lineDark dark:bg-panelDark">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl dark:text-inkDark">
            From blank page to actionable data.
          </h2>
          <p className="mt-3 font-body text-[14.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
            Four steps, one workspace — no hand-offs, no exporting between tools.
          </p>
        </Reveal>

        <Stagger className="mt-10 flex flex-col items-stretch gap-3 md:flex-row md:items-center">
          {STEPS.map((s, i) => (
            <Fragment key={s.n}>
              <StaggerItem className="flex-1">
                <div className="h-full rounded-xl border border-line bg-paper p-5 dark:border-lineDark dark:bg-night/40">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-signal dark:text-signalSoft">
                    {s.n}
                  </span>
                  <h3 className="mt-2 font-display text-[15px] font-bold text-ink dark:text-inkDark">
                    {s.title}
                  </h3>
                  <p className="mt-1.5 font-body text-[12.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
                    {s.body}
                  </p>
                </div>
              </StaggerItem>
              {i < STEPS.length - 1 && (
                <div
                  aria-hidden
                  className="flex shrink-0 items-center justify-center py-1 text-signalSoft"
                >
                  <ArrowDown size={16} className="md:hidden" />
                  <ArrowRight size={16} className="hidden md:block" />
                </div>
              )}
            </Fragment>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
