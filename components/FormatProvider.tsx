"use client";

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_FORMAT_CONTEXT,
  formatDateTime as formatDateTimeWith,
  formatNumber as formatNumberWith,
  formatRelativeDate as formatRelativeDateWith,
  formatTime as formatTimeWith,
  safeLocale,
  safeTimeZone,
  weekdayIndex as weekdayIndexWith,
  type FormatContext,
} from "@/lib/format";

// ---------------------------------------------------------------------------
// Binds locale/timezone-aware formatting to the signed-in user's profile.
//
// Both the server render and the client hydration read these values from this
// context, and the values come from the database — so the same string is
// produced on both sides and hydration matches. Without a provider the
// formatters fall back to a deterministic default (en-US / UTC) rather than the
// runtime locale, which is exactly what caused the mismatches.
// ---------------------------------------------------------------------------

const FormatReactContext = createContext<FormatContext>(DEFAULT_FORMAT_CONTEXT);

export function FormatProvider({
  locale,
  timeZone,
  children,
}: {
  locale?: string | null;
  timeZone?: string | null;
  children: ReactNode;
}) {
  const value = useMemo<FormatContext>(
    () => ({ locale: safeLocale(locale), timeZone: safeTimeZone(timeZone) }),
    [locale, timeZone]
  );

  return (
    <FormatReactContext.Provider value={value}>
      <TimezoneSync storedTimeZone={timeZone ?? null} />
      {children}
    </FormatReactContext.Provider>
  );
}

/** Formatters bound to the active context. Safe to call without a provider. */
export function useFormat() {
  const ctx = useContext(FormatReactContext);
  return useMemo(
    () => ({
      context: ctx,
      formatDateTime: (iso: string | null | undefined) => formatDateTimeWith(iso, ctx),
      formatRelativeDate: (iso: string | null | undefined) => formatRelativeDateWith(iso, ctx),
      formatNumber: (value: number) => formatNumberWith(value, ctx),
      formatTime: (iso: string | null | undefined) => formatTimeWith(iso, ctx),
      weekdayIndex: (iso: string | null | undefined) => weekdayIndexWith(iso, ctx),
    }),
    [ctx]
  );
}

/**
 * Auto-seeds `profiles.preferences.timezone` from the browser.
 *
 * Only writes when the preference is ABSENT — a timezone the user chose in
 * Settings is never overwritten. After the write the server re-renders with the
 * real timezone, so server and client keep agreeing at every step (the first
 * render simply uses the UTC default).
 */
function TimezoneSync({ storedTimeZone }: { storedTimeZone: string | null }) {
  const router = useRouter();
  const attempted = useRef(false);

  useEffect(() => {
    // Ref guard: React 18 StrictMode double-invokes effects in development.
    if (storedTimeZone || attempted.current) return;
    attempted.current = true;

    let detected: string | undefined;
    try {
      detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      detected = undefined;
    }
    if (!detected) return;

    void fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: { timezone: detected } }),
    })
      .then((res) => {
        if (res.ok) router.refresh();
      })
      .catch(() => {
        // Non-fatal: the app keeps working in UTC until the user sets it.
      });
  }, [storedTimeZone, router]);

  return null;
}