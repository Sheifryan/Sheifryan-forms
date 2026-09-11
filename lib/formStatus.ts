// Single source of truth for form status display across the dashboard, the
// forms grid/list, and the builder's status pill.
export const FORM_STATUSES = ["draft", "published", "closed", "archived"] as const;
export type FormStatus = (typeof FORM_STATUSES)[number];

export const STATUS_META: Record<FormStatus, { label: string; chip: string; dot: string }> = {
  draft: {
    label: "Draft",
    chip: "bg-paper text-slate-500 border border-line dark:bg-panelDark dark:text-mutedDark dark:border-lineDark",
    dot: "bg-slate-400",
  },
  published: {
    label: "Published",
    chip: "bg-emerald-50 text-success",
    dot: "bg-success",
  },
  closed: {
    label: "Closed",
    chip: "bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  archived: {
    label: "Archived",
    chip: "bg-slate-100 text-slate-500 border border-dashed border-slate-300 dark:bg-panelDark dark:text-mutedDark",
    dot: "bg-slate-400",
  },
};

export function statusMeta(status: string | null | undefined): { label: string; chip: string; dot: string } {
  return STATUS_META[(status as FormStatus) in STATUS_META ? (status as FormStatus) : "draft"];
}

export function isFormStatus(value: unknown): value is FormStatus {
  return typeof value === "string" && (FORM_STATUSES as readonly string[]).includes(value);
}