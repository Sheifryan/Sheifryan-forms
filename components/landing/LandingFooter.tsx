import Link from "next/link";

/**
 * Public marketing footer.
 *
 * Every link points at a page or section that actually exists — /templates,
 * /docs and /about are real routes, and the hash links resolve on the landing
 * page. Shipping links that 404 reads as broken, so add the real page first.
 */
const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "AI insights", href: "/ai" },
      { label: "Security", href: "/features#security" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    heading: "Build with",
    links: [
      { label: "Form builder", href: "/product" },
      { label: "Templates", href: "/templates" },
      { label: "Workflows & webhooks", href: "/docs#webhooks" },
      { label: "Embed a form", href: "/docs#embedding" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Webhook integration", href: "/docs#webhooks" },
      { label: "Use cases", href: "/docs#use-cases" },
      { label: "About us", href: "/about" },
    ],
  },
  {
    heading: "Get started",
    links: [
      { label: "Create an account", href: "/signup" },
      { label: "Log in", href: "/login" },
      { label: "Dashboard", href: "/dashboard" },
      { label: "Browse all 31 templates", href: "/templates" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-line bg-white dark:border-lineDark dark:bg-panelDark">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Link href="/" className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-signal to-accent2 font-display text-[13px] font-bold text-white">
                N
              </span>
              <span className="font-display text-[15px] font-bold text-ink dark:text-inkDark">
                Nibble<span className="text-signal">Forms</span>
              </span>
            </Link>
            <p className="mt-3 max-w-xs font-body text-[13px] leading-relaxed text-slate-500 dark:text-mutedDark">
              Build forms. Collect responses.
              <br />
              Turn data into action.
            </p>
            <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.18em] text-slate-400 dark:text-mutedDark">
              Build · Collect · Analyze
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h3 className="font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-mutedDark">
                {col.heading}
              </h3>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={`${col.heading}-${l.label}`}>
                    <Link
                      href={l.href}
                      className="font-body text-[13px] text-slate-600 transition hover:text-signal dark:text-mutedDark dark:hover:text-signalSoft"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-6 dark:border-lineDark sm:flex-row sm:items-center sm:justify-between">
          <p className="font-body text-[12px] text-slate-400 dark:text-mutedDark">
            © 2026 NibbleForms. All rights reserved.
          </p>
          <p className="font-body text-[12px] text-slate-400 dark:text-mutedDark">
            Forms, responses and files stored in your own Supabase project.
          </p>
        </div>
      </div>
    </footer>
  );
}
