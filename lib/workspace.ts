// Pure, client-safe helpers for the personal account shell. Keep this file
// free of any `next/headers` / server-only imports — the sidebar, header, and
// onboarding flow import it from client components. The database helpers live
// in ./workspace-server.ts (server-only).

export function firstName(fullName: string | null | undefined, fallback = "there"): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  return first || fallback;
}

export function initials(fullName: string | null | undefined, fallback = "U"): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback.slice(0, 1).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}