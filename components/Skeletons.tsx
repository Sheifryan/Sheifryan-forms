// ---------------------------------------------------------------------------
// Shared loading skeletons for the route-level `loading.tsx` files.
//
// Next.js swaps these in while a server component is streaming, so they must
// stay dependency-free (no data fetching) and match the page padding so the
// layout doesn't jump when real content arrives.
// ---------------------------------------------------------------------------

export function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/70 dark:bg-lineDark/70 ${className}`} />;
}

/** Page-level padding wrapper matching the app's standard content rhythm. */
function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen p-7">{children}</div>;
}

/** Heading + a row of KPI cards. */
export function StatsSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <Shell>
      <div className="mb-5 flex items-center justify-between">
        <div className="space-y-2">
          <Shimmer className="h-5 w-40" />
          <Shimmer className="h-3 w-64" />
        </div>
        <Shimmer className="h-9 w-32 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="rounded-xl border border-line bg-white p-5 shadow-sm dark:border-lineDark dark:bg-panelDark">
            <Shimmer className="h-3 w-24" />
            <Shimmer className="mt-3 h-7 w-16" />
            <Shimmer className="mt-3 h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-xl border border-line bg-white p-5 shadow-sm dark:border-lineDark dark:bg-panelDark">
        <Shimmer className="h-4 w-32" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Shimmer key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </Shell>
  );
}

/** Toolbar + table rows (forms, responses, files, members). */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <Shell>
      <div className="mb-5 flex items-center justify-between">
        <Shimmer className="h-5 w-36" />
        <Shimmer className="h-9 w-28 rounded-full" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2.5">
        <Shimmer className="h-9 w-40" />
        <Shimmer className="h-9 w-52" />
        <Shimmer className="h-9 w-28" />
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm dark:border-lineDark dark:bg-panelDark">
        <div className="flex gap-4 border-b border-line bg-paper px-4 py-3 dark:border-lineDark dark:bg-panelDark">
          {Array.from({ length: cols }).map((_, i) => (
            <Shimmer key={i} className="h-3 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-0 dark:border-lineDark">
            {Array.from({ length: cols }).map((_, c) => (
              <Shimmer key={c} className={`h-3.5 ${c === 0 ? "w-40" : "flex-1"}`} />
            ))}
          </div>
        ))}
      </div>
    </Shell>
  );
}

/** Bar-chart style placeholder (analytics, activity). */
export function ChartSkeleton() {
  const heights = [40, 65, 30, 80, 55, 70, 45];
  return (
    <Shell>
      <Shimmer className="mb-5 h-5 w-36" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-line bg-white p-5 shadow-sm dark:border-lineDark dark:bg-panelDark">
            <Shimmer className="h-3 w-24" />
            <Shimmer className="mt-3 h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-xl border border-line bg-white p-5 shadow-sm dark:border-lineDark dark:bg-panelDark">
        <Shimmer className="h-4 w-40" />
        <div className="mt-5 flex h-40 items-end gap-3">
          {heights.map((h, i) => (
            <div key={i} className="flex-1 animate-pulse rounded-md bg-slate-200/70 dark:bg-lineDark/70" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </Shell>
  );
}

/** Left nav + form field rows (settings, builder-adjacent screens). */
export function FormSkeleton() {
  return (
    <Shell>
      <Shimmer className="mb-5 h-5 w-32" />
      <div className="mx-auto max-w-2xl space-y-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-line bg-white p-5 shadow-sm dark:border-lineDark dark:bg-panelDark">
            <Shimmer className="h-3.5 w-28" />
            <Shimmer className="mt-3 h-10 w-full" />
          </div>
        ))}
      </div>
    </Shell>
  );
}
