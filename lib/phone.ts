// Server- and client-safe Uganda phone helpers.
//
// MarzPay mobile-money collections are charged to a UG MTN/Airtel number, and
// the API expects an international E.164 number like "+256712345678". Form
// respondents type all kinds of shapes ("0771234567", "+256 771 234 567",
// "256771234567", "712345678"...), so we canonicalise everything to one
// form before validation, storage and charging.

export const UG_MOBILE_RE = /^\+2567\d{8}$/;

/**
 * Normalise a Uganda mobile-money number to E.164 "+256XXXXXXXXX".
 * Returns null when the input isn't recognisable as a UG mobile number.
 * Handles strings and numbers, plus prefixes: 077…, +256…, 256…, 00 256…,
 * bare national 7XXXXXXXX, and any spaces/dashes/brackets the user typed.
 */
export function normalizeUgPhone(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  let digits = String(raw).replace(/[^\d]/g, "");
  if (digits.length === 0) return null;
  if (digits.startsWith("00")) digits = digits.slice(2); // 00… international prefix

  let national: string;
  if (digits.startsWith("256") && digits.length === 12) {
    national = digits.slice(3); // +256 / 256 + 9-digit national
  } else if (digits.startsWith("0") && digits.length === 10) {
    national = digits.slice(1); // 0 + 9-digit national
  } else if (digits.length === 9) {
    national = digits; // bare national, e.g. 712345678
  } else {
    return null;
  }

  // Uganda mobile numbers are 7XXXXXXXX (MTN, Airtel, Lycamobile).
  if (!/^7\d{8}$/.test(national)) return null;
  return `+256${national}`;
}

/** True when the value is (or normalises to) a valid UG mobile-money number. */
export function isUgMobileMoneyPhone(raw: unknown): boolean {
  return normalizeUgPhone(raw) !== null;
}
