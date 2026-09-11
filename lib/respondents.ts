// Derive a human-readable "respondent" label from a response's answers. The
// responses table doesn't store the respondent identity directly (forms are
// anonymous by design), so we guess from the answers: any value that looks
// like an email wins, then a short piece of text, then fall back.
export function respondentFrom(answers: Record<string, unknown> | null | undefined): string {
  if (!answers) return "Anonymous respondent";
  const values: { key: string; value: unknown }[] = Object.entries(answers).map(([key, value]) => ({ key, value }));

  for (const { value } of values) {
    if (typeof value === "string" && /^\S+@\S+\.\S+$/.test(value.trim())) {
      return value.trim();
    }
  }

  // Prefer a value from a field literally named something name-ish.
  for (const { key, value } of values) {
    if (/name/i.test(key) && typeof value === "string" && value.trim() && value.trim().length < 80) {
      return value.trim();
    }
  }

  for (const { value } of values) {
    if (typeof value === "string" && value.trim() && value.trim().length <= 40 && !value.trim().startsWith("+256")) {
      return value.trim();
    }
  }

  return "Anonymous respondent";
}

export function respondentInitial(name: string): string {
  return (name.trim() || "A").slice(0, 1).toUpperCase();
}