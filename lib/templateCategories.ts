import {
  Briefcase,
  CalendarCheck,
  GraduationCap,
  Headphones,
  HeartHandshake,
  Home,
  LayoutTemplate,
  Megaphone,
  MessageSquare,
  ShoppingCart,
  Stethoscope,
  Type,
  UserPlus,
  UtensilsCrossed,
} from "lucide-react";

// Icons + pastel accent per template category (Zoho-style browse-by-category).
//
// These lived inside app/dashboard/TemplateGallery.tsx. They moved here so the
// public /templates page and the landing-page template strip can share exactly
// the same category visuals as the in-app gallery, without duplicating the map.
export const CATEGORY_ICONS: Record<string, typeof Type> = {
  Registration: UserPlus,
  HR: Briefcase,
  Feedback: MessageSquare,
  Marketing: Megaphone,
  Sales: ShoppingCart,
  Events: CalendarCheck,
  Education: GraduationCap,
  Healthcare: Stethoscope,
  Hospitality: UtensilsCrossed,
  "Real Estate": Home,
  Support: Headphones,
  "Non-profit": HeartHandshake,
};

export const CATEGORY_ACCENTS: Record<string, string> = {
  Registration: "bg-sky-50 text-sky-600",
  HR: "bg-violet-50 text-violet-600",
  Feedback: "bg-amber-50 text-amber-600",
  Marketing: "bg-pink-50 text-pink-600",
  Sales: "bg-emerald-50 text-emerald-600",
  Events: "bg-indigo-50 text-indigo-600",
  Education: "bg-teal-50 text-teal-600",
  Healthcare: "bg-rose-50 text-rose-600",
  Hospitality: "bg-orange-50 text-orange-600",
  "Real Estate": "bg-lime-50 text-lime-600",
  Support: "bg-cyan-50 text-cyan-600",
  "Non-profit": "bg-fuchsia-50 text-fuchsia-600",
};

/** Category icon with the generic template-gallery fallback. */
export function categoryIcon(category: string): typeof Type {
  return CATEGORY_ICONS[category] ?? LayoutTemplate;
}

/** Category accent classes with a neutral fallback. */
export function categoryAccent(category: string): string {
  return CATEGORY_ACCENTS[category] ?? "bg-paper text-muted dark:bg-panelDark dark:text-mutedDark";
}

/** Every category, in the order the templates declare them. */
export const TEMPLATE_CATEGORIES: string[] = Array.from(
  new Set(Object.keys(CATEGORY_ICONS))
);
