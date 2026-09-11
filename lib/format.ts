import { formatBytes } from "@/lib/plans";

// ---------------------------------------------------------------------------
// Locale/timezone-aware formatting.
//
// `toLocaleString(undefined, …)` reads the *runtime* locale and timezone, which
// differ between the Node server (typically en-US / UTC) and the browser (the
// user's locale and clock). Client components are rendered on BOTH sides, so
// that difference produced hydration mismatches:
//
//   "There was an error while hydrating this Suspense boundary."
//
// The fix is to make formatting a function of DATA — an explicit locale and
// timezone that the server supplies and the client receives, via
// `useFormat()` (components/FormatProvider.tsx), which binds them to the
// signed-in user's profile. Server components may keep calling these with the
// default context: their output is serialized into the RSC payload and is never
// re-rendered on the client, so it cannot mismatch.
// ---------------------------------------------------------------------------

export interface FormatContext {
  locale: string;
  timeZone: string;
}

/** Deterministic fallback — never the runtime locale/timezone. */
export const DEFAULT_FORMAT_CONTEXT: FormatContext = { locale: "en-US", timeZone: "UTC" };

/**
 * Profile values are user-writable, so both are validated: an invalid locale or
 * timezone makes `toLocaleString` throw a RangeError, which would break every
 * page render rather than just look wrong.
 */
export function safeLocale(value?: string | null): string {
  if (!value) return DEFAULT_FORMAT_CONTEXT.locale;
  try {
    return Intl.getCanonicalLocales(value)[0] ?? DEFAULT_FORMAT_CONTEXT.locale;
  } catch {
    return DEFAULT_FORMAT_CONTEXT.locale;
  }
}

export function safeTimeZone(value?: string | null): string {
  if (!value) return DEFAULT_FORMAT_CONTEXT.timeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return DEFAULT_FORMAT_CONTEXT.timeZone;
  }
}

// Build share support: every form has a public page regardless of status, but
// only published forms are reachable by anonymous visitors (the others 404 for
// non-owners, which is the intended privacy behavior).
export function shareUrlFor(formId: string): string {
  return `${window.location.origin}/f/${formId}`;
}

export async function copyShareLink(formId: string, fallbackTitle = "Form"): Promise<boolean> {
  const url = shareUrlFor(formId);
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }
}

export function formatRelativeDate(iso: string | null | undefined, ctx: FormatContext = DEFAULT_FORMAT_CONTEXT): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(ctx.locale, { month: "short", day: "numeric", timeZone: ctx.timeZone });
}

export function formatDateTime(iso: string | null | undefined, ctx: FormatContext = DEFAULT_FORMAT_CONTEXT): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(ctx.locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: ctx.timeZone,
  });
}

/**
 * Thousands separators are locale-dependent too — a bare `toLocaleString()`
 * rendered "1,234" on the server and "1 234" in some browsers.
 */
export function formatNumber(value: number, ctx: FormatContext = DEFAULT_FORMAT_CONTEXT): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(ctx.locale);
}

/** Clock time only (the webhook delivery log shows just the time of day). */
export function formatTime(iso: string | null | undefined, ctx: FormatContext = DEFAULT_FORMAT_CONTEXT): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(ctx.locale, { hour: "numeric", minute: "2-digit", timeZone: ctx.timeZone });
}

/**
 * Monday-first weekday index (0 = Mon … 6 = Sun) for an instant, evaluated in
 * the context timezone, or -1 when the input is unusable.
 *
 * `Date#getDay()` reads the *runtime* timezone, so the server (UTC) and the
 * browser (+03:00, say) put the same response in different buckets — which for
 * the analytics histogram meant a mismatched inline `style.height`.
 *
 * The "en-US" formatter is deliberate: weekday abbreviations are used only as a
 * stable lookup key, so the result must not vary with `ctx.locale`.
 */
export function weekdayIndex(iso: string | null | undefined, ctx: FormatContext = DEFAULT_FORMAT_CONTEXT): number {
  if (!iso) return -1;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return -1;
  const abbr = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: ctx.timeZone }).format(d);
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(abbr);
}

// Readable duration for analytics "average completion time".
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export { formatBytes };