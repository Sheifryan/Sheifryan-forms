import { createHash } from "crypto";

// Simple, dependency-free hashing for the password-protected-form gate.
// Not meant for high-security use cases (there's no per-form salt), but
// it's enough that a leaked DB row or log line doesn't hand over a plaintext
// password — pair with HTTPS and treat this as "gate", not "vault".
export function hashFormPassword(formId: string, password: string): string {
  return createHash("sha256").update(`${formId}:${password}`).digest("hex");
}
