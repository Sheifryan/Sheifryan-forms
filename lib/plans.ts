export type PlanId = "free" | "pro" | "premium" | "starter" | "business" | "enterprise";

export interface PlanLimits {
  forms: number; // -1 = unlimited
  monthlyResponses: number; // -1 = unlimited
  storageBytes: number; // -1 = unlimited
  workflows: number; // -1 = unlimited
  fileUploads: number; // -1 = unlimited
  creditsPerMonth: number; // -1 = unlimited
  /** Seat limit for organisation workspaces (1 for individual plans). */
  members: number; // -1 = unlimited
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthly: number; // USD; 0 for free
  limits: PlanLimits;
  features: string[];
  /** Tailwind classes for the plan badge / card accent. */
  badgeClass: string;
  highlight?: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "For getting started",
    priceMonthly: 0,
    limits: {
      forms: 5,
      monthlyResponses: 500,
      storageBytes: 1024 * 1024 * 1024, // 1 GB
      workflows: 1,
      fileUploads: 100,
      creditsPerMonth: 500,
      members: 1,
    },
    features: ["5 forms", "500 responses / month", "1 GB storage", "1 workflow", "100 file uploads"],
    badgeClass: "bg-paper text-muted border border-line",
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "For growing creators",
    priceMonthly: 19,
    limits: {
      forms: 25,
      monthlyResponses: 5000,
      storageBytes: 5 * 1024 * 1024 * 1024, // 5 GB
      workflows: 5,
      fileUploads: 1000,
      creditsPerMonth: 2000,
      members: 1,
    },
    features: ["25 forms", "5,000 responses / month", "5 GB storage", "5 workflows", "1,000 file uploads"],
    badgeClass: "bg-signalSoft/20 text-signal",
    highlight: true,
  },
  premium: {
    id: "premium",
    name: "Premium",
    tagline: "For power users",
    priceMonthly: 49,
    limits: {
      forms: 100,
      monthlyResponses: 50000,
      storageBytes: 25 * 1024 * 1024 * 1024, // 25 GB
      workflows: 25,
      fileUploads: 5000,
      creditsPerMonth: 5000,
      members: 1,
    },
    features: ["100 forms", "50,000 responses / month", "25 GB storage", "25 workflows", "5,000 file uploads"],
    badgeClass: "bg-accent2/15 text-accent2",
  },

  // ---- Organisation plans -------------------------------------------------
  starter: {
    id: "starter",
    name: "Starter",
    tagline: "For small teams getting organised",
    priceMonthly: 12,
    limits: {
      forms: 25,
      monthlyResponses: 5000,
      storageBytes: 10 * 1024 * 1024 * 1024, // 10 GB
      workflows: 5,
      fileUploads: 1000,
      creditsPerMonth: 2000,
      members: 5,
    },
    features: ["25 forms", "5,000 responses / month", "10 GB storage", "5 workflows", "Up to 5 members"],
    badgeClass: "bg-sky-100 text-sky-700",
  },
  business: {
    id: "business",
    name: "Business",
    tagline: "For growing organisations",
    priceMonthly: 39,
    limits: {
      forms: -1,
      monthlyResponses: 20000,
      storageBytes: 100 * 1024 * 1024 * 1024, // 100 GB
      workflows: 20,
      fileUploads: 5000,
      creditsPerMonth: 10000,
      members: 25,
    },
    features: ["Unlimited forms", "20,000 responses / month", "100 GB storage", "20 workflows", "Up to 25 members"],
    badgeClass: "bg-signalSoft/25 text-signal",
    highlight: true,
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For large institutions",
    priceMonthly: 99,
    limits: {
      forms: -1,
      monthlyResponses: 100000,
      storageBytes: 1024 * 1024 * 1024 * 1024, // 1 TB
      workflows: -1,
      fileUploads: -1,
      creditsPerMonth: 50000,
      members: 250,
    },
    features: ["Unlimited forms", "100,000 responses / month", "1 TB storage", "Unlimited workflows", "Up to 250 members"],
    badgeClass: "bg-accent2/15 text-accent2",
  },
};

/** Personal workspace plan ladder. */
export const PLAN_ORDER: PlanId[] = ["free", "pro", "premium"];

/** Organisation workspace plan ladder. */
export const ORG_PLAN_ORDER: PlanId[] = ["free", "starter", "business", "enterprise"];

/** The plan ladder that applies to a workspace kind. */
export function planOrderFor(kind: string | null | undefined): PlanId[] {
  return kind === "personal" ? PLAN_ORDER : ORG_PLAN_ORDER;
}

export function planById(id: string | null | undefined): Plan {
  return PLANS[(id as PlanId) in PLANS ? (id as PlanId) : "free"];
}

// Monospace-ish friendly byte formatting for quota bars (e.g. "2.4 GB").
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function usagePercent(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

// Credit packs purchasable from the Wallet.
export interface CreditPack {
  credits: number;
  priceUsd: number;
  bonus?: string;
  popular?: boolean;
}

export const CREDIT_PACKS: CreditPack[] = [
  { credits: 500, priceUsd: 5 },
  { credits: 2000, priceUsd: 18, bonus: "Get 15% extra", popular: true },
  { credits: 5000, priceUsd: 40, bonus: "Get 20% extra" },
];