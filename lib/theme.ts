"use client";

// Theme handling. The chosen preference is persisted in localStorage; the
// .dark class lives on <html> so Tailwind's `dark:` variants can key off it.
//
// SSR-safe by construction: every entry point bails out when there is no
// `window`. Client components are still server-rendered for the initial HTML,
// so none of these may touch the DOM during render. Note that optional chaining
// on `window.x?.()` does NOT protect you — the bare `window` identifier is what
// is unbound on the server, so the ReferenceError is thrown before `?.` applies.
export type ThemeChoice = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "nibbleforms-theme";

/** True only in the browser — false during SSR, prerender and server actions. */
const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";

export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice === "light" || choice === "dark") return choice;
  // Server / prerender: a deterministic value keeps the markup stable.
  if (!isBrowser()) return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function storedTheme(): ThemeChoice {
  if (!isBrowser()) return "system";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // localStorage unavailable (private mode etc.) — fall through to system.
  }
  return "system";
}

export function applyTheme(choice: ThemeChoice) {
  if (!isBrowser()) return;
  const resolved = resolveTheme(choice);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // ignore storage failures — theme still applies for this session
  }
}

// Returns the effective theme for the current stored preference.
export function currentResolvedTheme(): "light" | "dark" {
  return resolveTheme(storedTheme());
}