import { FolderLock, KeyRound, ShieldCheck, ShieldAlert } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "./Reveal";

const ITEMS = [
  {
    icon: ShieldCheck,
    title: "Protected data",
    body: "Postgres with Row Level Security — every row is scoped to the workspace that owns it, enforced in the database, not just the UI.",
  },
  {
    icon: FolderLock,
    title: "Secure files",
    body: "Uploads land in private storage with per-file metadata; downloads are served through short-lived signed URLs.",
  },
  {
    icon: KeyRound,
    title: "Protected forms",
    body: "Password protection, response limits and close dates are enforced server-side — not just hidden in the UI.",
  },
  {
    icon: ShieldAlert,
    title: "Safer submissions",
    body: "Rate limiting and honeypot checks help protect your forms from spam and abuse.",
  },
];

/** Security — four controls that genuinely exist in the codebase. */
export function Security() {
  return (
    <section id="security" className="scroll-mt-20 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl dark:text-inkDark">
            Built with security in mind.
          </h2>
          <p className="mt-3 font-body text-[14.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
            Your forms and collected data deserve more than a public spreadsheet.
          </p>
        </Reveal>

        <Stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map((item) => (
            <StaggerItem key={item.title}>
              <div className="h-full rounded-xl border border-line bg-white p-5 dark:border-lineDark dark:bg-panelDark">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <item.icon size={18} />
                </span>
                <h3 className="mt-4 font-display text-[14.5px] font-bold text-ink dark:text-inkDark">
                  {item.title}
                </h3>
                <p className="mt-1.5 font-body text-[12.5px] leading-relaxed text-slate-600 dark:text-mutedDark">
                  {item.body}
                </p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
