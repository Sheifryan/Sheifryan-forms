"use client";

import { useMemo, useState } from "react";
import {
  AlignLeft,
  ArrowLeft,
  Briefcase,
  Calendar,
  CalendarCheck,
  CheckSquare,
  ChevronsUpDown,
  CircleDot,
  Clock,
  GraduationCap,
  Hash,
  Headphones,
  HeartHandshake,
  Home,
  LayoutTemplate,
  Link,
  Mail,
  Megaphone,
  MessageSquare,
  Paperclip,
  Phone,
  Search,
  ShoppingCart,
  Sparkles,
  Square,
  Star,
  Stethoscope,
  Type,
  UserPlus,
  UtensilsCrossed,
  X,
} from "lucide-react";
import type { FormField } from "@/lib/schema";
import { FIELD_LABELS } from "@/lib/schema";
import { TEMPLATES, type FormTemplate } from "@/lib/templates";

// Icons + pastel accent per template category (Zoho-style browse-by-category).
const CATEGORY_ICONS: Record<string, typeof Type> = {
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

const CATEGORY_ACCENTS: Record<string, string> = {
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

// Icon per field type, used in the read-only template preview.
const FIELD_ICONS: Record<string, typeof Type> = {
  short_text: Type,
  long_text: AlignLeft,
  email: Mail,
  phone: Phone,
  number: Hash,
  url: Link,
  single_select: CircleDot,
  multi_select: CheckSquare,
  dropdown: ChevronsUpDown,
  rating: Star,
  date: Calendar,
  time: Clock,
  checkbox: Square,
  file: Paperclip,
};

export function TemplateGallery({
  onClose,
  onPick,
  onBlank,
}: {
  onClose: () => void;
  onPick: (template: FormTemplate) => void;
  onBlank: () => void;
}) {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<FormTemplate | null>(null);

  const categories = useMemo(() => {
    const rest = Array.from(new Set(TEMPLATES.map((t) => t.category))).sort((a, b) =>
      a.localeCompare(b)
    );
    return ["All", "Featured", ...rest];
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: TEMPLATES.length, Featured: 0 };
    for (const t of TEMPLATES) {
      c[t.category] = (c[t.category] ?? 0) + 1;
      if (t.featured) c.Featured += 1;
    }
    return c;
  }, []);

  const filtered = useMemo(() => {
    let list = TEMPLATES;
    if (category === "Featured") list = list.filter((t) => t.featured);
    else if (category !== "All") list = list.filter((t) => t.category === category);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q)
      );
    }
    return list;
  }, [category, query]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => Number(b.featured ?? false) - Number(a.featured ?? false)),
    [filtered]
  );

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/30 backdrop-blur-[2px]">
      <div className="flex h-[84vh] w-[1080px] max-w-[96vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h3 className="font-display text-[15px] font-semibold text-ink">Start a new form</h3>
            <p className="font-body text-xs text-muted">
              Search the gallery, preview a template, or start from scratch.
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-paper">
            <X size={16} />
          </button>
        </div>

        {selected ? (
          <TemplatePreview
            template={selected}
            onBack={() => setSelected(null)}
            onUse={() => onPick(selected)}
          />
        ) : (
          <div className="flex min-h-0 flex-1">
            {/* Sidebar: search + categories with counts */}
            <aside className="w-56 shrink-0 overflow-y-auto border-r border-line p-4">
              <div className="relative mb-3">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search templates…"
                  className="w-full rounded-lg border border-line bg-paper py-1.5 pl-8 pr-2.5 font-body text-xs text-ink placeholder:text-stone-400 focus:border-signal focus:outline-none"
                />
              </div>
              <nav className="space-y-0.5">
                {categories.map((c) => {
                  const active = category === c;
                  return (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 font-body text-xs font-semibold transition ${
                        active ? "bg-signalSoft text-signal" : "text-stone-600 hover:bg-paper"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {c === "Featured" && (
                          <Sparkles size={13} className={active ? "text-signal" : "text-amber-500"} />
                        )}
                        {c}
                      </span>
                      <span
                        className={`rounded-full px-1.5 font-body text-[10px] ${
                          active ? "bg-white/70 text-signal" : "bg-paper text-muted"
                        }`}
                      >
                        {counts[c] ?? 0}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </aside>

            {/* Template grid */}
            <section className="min-w-0 flex-1 overflow-y-auto p-5">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="font-display text-sm font-semibold text-ink">
                  {query
                    ? `Results for “${query}”`
                    : category === "All"
                      ? "All templates"
                      : `${category} templates`}
                </h4>
                <span className="font-body text-[11px] font-semibold text-muted">
                  {sorted.length} template{sorted.length === 1 ? "" : "s"}
                </span>
              </div>

              {sorted.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={onBlank}
                    className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 p-4 text-center transition hover:border-signal hover:bg-signalSoft"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-paper text-muted">
                      <LayoutTemplate size={17} />
                    </span>
                    <span className="font-body text-xs font-semibold text-ink">Blank form</span>
                    <span className="font-body text-[10.5px] text-muted">Start from scratch</span>
                  </button>
                  {sorted.map((t) => (
                    <TemplateCard key={t.id} template={t} onOpen={setSelected} />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-line p-10 text-center">
                  <p className="font-body text-xs text-muted">
                    No templates match “{query}”. Try another search.
                  </p>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
function TemplateCard({
  template,
  onOpen,
}: {
  template: FormTemplate;
  onOpen: (t: FormTemplate) => void;
}) {
  const Icon = CATEGORY_ICONS[template.category] ?? LayoutTemplate;
  const accent = CATEGORY_ACCENTS[template.category] ?? "bg-paper text-muted";
  return (
    <button
      onClick={() => onOpen(template)}
      className="group rounded-xl border border-line bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-signal hover:shadow-md"
    >
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accent}`}>
          <Icon size={16} />
        </span>
        {template.featured && (
          <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-body text-[9.5px] font-bold uppercase tracking-wide text-amber-600">
            <Star size={9} fill="currentColor" /> Popular
          </span>
        )}
      </div>
      <h4 className="truncate font-body text-[13px] font-semibold text-ink">{template.title}</h4>
      <p className="mt-1 line-clamp-2 font-body text-[11px] leading-snug text-muted">
        {template.description}
      </p>
      <div className="mt-2.5 flex items-center gap-1.5">
        <span className="rounded-full bg-paper px-2 py-0.5 font-body text-[9.5px] font-semibold text-stone-500">
          {template.category}
        </span>
        <span className="font-body text-[10px] text-muted">{template.build().length} fields</span>
      </div>
    </button>
  );
}

function TemplatePreview({
  template,
  onBack,
  onUse,
}: {
  template: FormTemplate;
  onBack: () => void;
  onUse: () => void;
}) {
  const fields = useMemo(() => template.build(), [template]);
  const Icon = CATEGORY_ICONS[template.category] ?? LayoutTemplate;
  const accent = CATEGORY_ACCENTS[template.category] ?? "bg-paper text-muted";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 rounded-md p-1.5 font-body text-xs font-semibold text-muted transition hover:bg-paper"
          >
            <ArrowLeft size={15} /> Back
          </button>
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accent}`}>
            <Icon size={16} />
          </span>
          <div className="min-w-0">
            <h4 className="truncate font-display text-sm font-semibold text-ink">{template.title}</h4>
            <p className="font-body text-[11px] text-muted">
              {template.category} · {fields.length} fields
            </p>
          </div>
        </div>
        <button
          onClick={onUse}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-signal px-4 py-2 font-body text-xs font-semibold text-white transition hover:opacity-90"
        >
          <LayoutTemplate size={13} /> Use this template
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-paper p-6">
        <div className="mx-auto max-w-[580px] space-y-3">
          <p className="rounded-xl border border-line bg-white p-3 font-body text-[12px] leading-snug text-muted">
            {template.description}
          </p>
          {fields.map((f) => (
            <FieldPreviewRow key={f.id} field={f} />
          ))}
        </div>
      </div>
    </div>
  );
}
function FieldPreviewRow({ field }: { field: FormField }) {
  const Icon = FIELD_ICONS[field.type] ?? Type;
  const isChoice =
    field.type === "single_select" || field.type === "multi_select" || field.type === "dropdown";

  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Icon size={13} className="mt-0.5 shrink-0 text-muted" />
          <label className="font-body text-[13px] font-medium text-ink">
            {field.label}
            {field.required && <span className="text-warn"> *</span>}
          </label>
        </div>
        <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 font-body text-[9.5px] font-semibold text-stone-400">
          {FIELD_LABELS[field.type] ?? field.type}
        </span>
      </div>

      {field.helpText && <p className="mb-1.5 font-body text-[11px] text-muted">{field.helpText}</p>}

      {field.type === "checkbox" ? (
        <p className="font-body text-[12px] text-stone-600">{field.placeholder ?? "Yes"}</p>
      ) : isChoice ? (
        <div className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map((o) => (
            <span
              key={o.id}
              className="rounded-full bg-paper px-2.5 py-1 font-body text-[11px] text-stone-600"
            >
              {o.label}
            </span>
          ))}
        </div>
      ) : field.type === "rating" ? (
        <div className="flex gap-0.5 text-amber-400">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} size={16} fill="currentColor" strokeWidth={1.5} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg bg-paper px-3 py-2 font-body text-[12px] text-stone-300">
          {field.type === "file"
            ? "File upload will appear here"
            : field.type === "date"
              ? "mm/dd/yyyy"
              : field.type === "time"
                ? "hh:mm AM"
                : field.type === "url"
                  ? "https://example.com"
                  : field.placeholder ?? "Your answer"}
        </div>
      )}
    </div>
  );
}