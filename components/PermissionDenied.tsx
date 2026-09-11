import Link from "next/link";
import { ShieldAlert } from "lucide-react";

/**
 * Shown when a member reaches a page their role doesn't permit.
 *
 * This is UX only — the real enforcement happens server-side in `authorize()`
 * and at the database via RLS. Hiding a page never protects data.
 */
export function PermissionDenied({
  title = "You don't have access to this page",
  description = "Your role in this workspace doesn't include the permission required here. Ask an owner or admin if you need access.",
  backHref = "/dashboard",
  backLabel = "Back to dashboard",
}: {
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="min-h-screen p-7">
      <div className="mx-auto max-w-lg rounded-xl border border-line bg-white p-10 text-center shadow-sm dark:border-lineDark dark:bg-panelDark">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <ShieldAlert size={24} />
        </div>
        <h1 className="font-display text-lg font-semibold text-ink dark:text-inkDark">{title}</h1>
        <p className="mt-1.5 font-body text-sm text-slate-500 dark:text-mutedDark">{description}</p>
        <Link
          href={backHref}
          className="mt-5 inline-block rounded-full bg-signal px-4 py-2 font-body text-[12.5px] font-semibold text-white transition hover:opacity-90"
        >
          {backLabel}
        </Link>
      </div>
    </div>
  );
}