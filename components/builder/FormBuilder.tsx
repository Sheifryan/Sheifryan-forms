"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  GripVertical,
  Trash2,
  Search,
  Type,
  AlignLeft,
  Mail,
  Phone,
  Hash,
  Link as LinkIcon,
  List,
  ListChecks,
  Star,
  Calendar,
  Clock,
  Upload,
  CheckSquare,
  SeparatorHorizontal,
  FileText,
  Zap,
  Settings as SettingsIcon,
  Palette,
  Share2,
  Link2,
  QrCode,
  Copy,
  Download,
  X,
  HardDrive,
  Plug,
} from "lucide-react";
import QRCode from "qrcode";
import {
  FIELD_LABELS,
  FIELD_GROUPS,
  THEMES,
  DEFAULT_THEME,
  defaultFileConfig,
  formatBytes,
  type FormField,
  type FormSchema,
  type FieldType,
  type FormSettings,
  type ThemeKey,
  type WebhookDelivery,
} from "@/lib/schema";
import { FieldEditor } from "./FieldEditor";
import { IntegrationsTab } from "./IntegrationsTab";
import { FormRenderer } from "@/components/renderer/FormRenderer";
import { useToast } from "@/components/Toast";

interface Props {
  formId: string;
  initialTitle: string;
  initialSchema: FormSchema;
  initialStatus: "draft" | "published" | "closed";
  initialSettings: FormSettings;
  initialTheme: ThemeKey;
  storageBytes?: number;
  fileCount?: number;
  deliveries?: WebhookDelivery[];
}

const TYPE_ICONS: Record<FieldType, typeof Type> = {
  short_text: Type,
  long_text: AlignLeft,
  email: Mail,
  phone: Phone,
  number: Hash,
  url: LinkIcon,
  single_select: List,
  multi_select: ListChecks,
  dropdown: List,
  rating: Star,
  date: Calendar,
  time: Clock,
  checkbox: CheckSquare,
  file: Upload,
  page_break: SeparatorHorizontal,
};

const TABS = [
  { id: "fields", label: "Fields", icon: FileText },
  { id: "rules", label: "Rules", icon: Zap },
  { id: "settings", label: "Settings", icon: SettingsIcon },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "themes", label: "Themes", icon: Palette },
  { id: "share", label: "Share", icon: Share2 },
] as const;
type TabId = (typeof TABS)[number]["id"];

function blankField(type: FieldType): FormField {
  const needsOptions = type === "single_select" || type === "multi_select" || type === "dropdown";
  if (type === "page_break") {
    return { id: nanoid(8), type, label: "New page", required: false };
  }
  if (type === "file") {
    return {
      id: nanoid(8),
      type,
      label: FIELD_LABELS[type],
      required: false,
      fileConfig: defaultFileConfig(),
    };
  }
  return {
    id: nanoid(8),
    type,
    label: FIELD_LABELS[type],
    required: false,
    options: needsOptions
      ? [
          { id: nanoid(6), label: "Option 1" },
          { id: nanoid(6), label: "Option 2" },
        ]
      : undefined,
  };
}

export function FormBuilder({
  formId,
  initialTitle,
  initialSchema,
  initialStatus,
  initialSettings,
  initialTheme,
  storageBytes = 0,
  fileCount = 0,
  deliveries = [],
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [fields, setFields] = useState<FormField[]>(initialSchema.fields);
  const [settings, setSettings] = useState<FormSettings>(initialSettings);
  const [theme, setTheme] = useState<ThemeKey>(initialTheme);
  const [selectedId, setSelectedId] = useState<string | null>(initialSchema.fields[0]?.id ?? null);
  const [tab, setTab] = useState<TabId>("fields");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [status, setStatus] = useState(initialStatus);
  const toast = useToast();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const accent = THEMES[theme]?.hex ?? THEMES[DEFAULT_THEME].hex;

  // Active drag state drives the DragOverlay preview and the palette-drop
  // highlight on canvas rows below.
  const [activeDrag, setActiveDrag] = useState<{ id: string; type: FieldType; label: string } | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Single debounced autosave for everything editable in this screen.
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const isFirstRun = useRef(true);
  // Throttles the "Changes saved" toast so rapid edits don't flood the stack.
  const lastSaveToastAt = useRef(0);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/forms/${formId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, schema: { fields }, settings, theme, bumpVersion: true }),
      });
      if (res.ok) {
        setSaveState("saved");
        const now = Date.now();
        if (now - lastSaveToastAt.current > 4000) {
          lastSaveToastAt.current = now;
          toast.success("Changes saved");
        }
      } else {
        setSaveState("idle");
        toast.error("Couldn't save changes");
      }
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, fields, settings, theme, toast]);

  const addField = useCallback((type: FieldType) => {
    const field = blankField(type);
    setFields((prev) => [...prev, field]);
    setSelectedId(field.id);
  }, []);

  const updateField = useCallback((id: string, patch: Partial<FormField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  const duplicateField = useCallback((id: string) => {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      if (idx === -1) return prev;
      const copy: FormField = { ...prev[idx], id: nanoid(8), label: prev[idx].label + " (copy)" };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }, []);

  const removeField = useCallback(
    (id: string) => {
      setFields((prev) => prev.filter((f) => f.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [selectedId]
  );

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    if (id.startsWith("palette-")) {
      const type = id.replace("palette-", "") as FieldType;
      setActiveDrag({ id, type, label: FIELD_LABELS[type] });
    } else {
      const field = fields.find((f) => f.id === id);
      if (field) setActiveDrag({ id, type: field.type, label: field.label });
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    setOverId(event.over ? String(event.over.id) : null);

    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    // Live-reorder existing fields while dragging so the dragged row slides to
    // the correct above/below position. Palette items (new fields) are not
    // reordered here — they get inserted on drop in handleDragEnd.
    if (activeId.startsWith("palette-") || overId.startsWith("palette-")) return;
    if (activeId === overId) return;

    setFields((prev) => {
      const oldIndex = prev.findIndex((f) => f.id === activeId);
      const newIndex = prev.findIndex((f) => f.id === overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDrag(null);
    setOverId(null);

    // Dragging a new field from the left palette onto the canvas.
    if (String(active.id).startsWith("palette-")) {
      // Dropping back onto another palette item cancels the drop.
      if (over && String(over.id).startsWith("palette-")) return;

      const type = String(active.id).replace("palette-", "") as FieldType;
      const field = blankField(type);
      setFields((prev) => {
        // Insert AFTER the hovered field so a new field drops below the one
        // you're dropping it on (appends to the end when there's no target).
        const overIndex = over ? prev.findIndex((f) => f.id === over.id) : -1;
        const insertAt = overIndex === -1 ? prev.length : overIndex + 1;
        const next = [...prev];
        next.splice(insertAt, 0, field);
        return next;
      });
      setSelectedId(field.id);
      return;
    }

    // Reordering an existing field. The array is already kept in sync live by
    // handleDragOver; this also covers the case where no reorder fired.
    if (!over || active.id === over.id) return;
    setFields((prev) => {
      const oldIndex = prev.findIndex((f) => f.id === active.id);
      const newIndex = prev.findIndex((f) => f.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function handleDragCancel() {
    setActiveDrag(null);
    setOverId(null);
  }

  async function togglePublish() {
    const next = status === "published" ? "draft" : "published";
    setStatus(next);
    const res = await fetch(`/api/forms/${formId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      setStatus(status);
      toast.error(next === "published" ? "Couldn't publish the form" : "Couldn't unpublish the form");
      return;
    }
    if (next === "published") {
      toast.success("Form published", {
        description: "Your form is now live and accepting responses.",
        action: { label: "View form", onClick: () => window.open(`/f/${formId}`, "_blank") },
      });
    } else {
      toast.info("Form unpublished", {
        description: "Respondents can no longer submit responses.",
      });
    }
  }

  async function deleteForm() {
    const res = await fetch(`/api/forms/${formId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Form deleted");
      router.push("/dashboard");
      router.refresh();
    } else {
      toast.error("Couldn't delete the form");
      setConfirmDelete(false);
    }
  }

  const selectedField = fields.find((f) => f.id === selectedId) ?? null;
  const pageCount = fields.filter((f) => f.type === "page_break").length + 1;

  return (
    <div className="flex h-screen flex-col bg-paper" style={{ "--accent": accent } as React.CSSProperties}>
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-line bg-white px-6 py-3">
        <div className="flex items-center gap-2.5">
          <Link
            href="/dashboard"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-muted transition hover:bg-paper"
          >
            <ArrowLeft size={15} />
          </Link>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-56 bg-transparent font-display text-lg text-ink outline-none"
          />
          <span
            className={`rounded-full px-2.5 py-0.5 font-body text-[10.5px] font-semibold ${
              status === "published" ? "bg-emerald-50 text-success" : "bg-amber-50 text-amber-700"
            }`}
          >
            {status === "published" ? "Live" : "Draft"}
          </span>
          {pageCount > 1 && (
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 font-body text-[10.5px] font-semibold text-stone-600">
              {pageCount} pages
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
          </span>
          <button
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                setTimeout(() => setConfirmDelete(false), 3000);
                return;
              }
              deleteForm();
            }}
            title={confirmDelete ? "Click again to confirm delete" : "Delete form"}
            className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 font-body text-xs font-semibold transition ${
              confirmDelete
                ? "border-warn bg-warn text-white hover:opacity-90"
                : "border-line bg-white text-stone-600 hover:border-warn hover:bg-rose-50 hover:text-warn"
            }`}
          >
            <Trash2 size={13} /> {confirmDelete ? "Confirm delete?" : "Delete"}
          </button>
          <button
            onClick={togglePublish}
            className="rounded-full bg-[var(--accent)] px-4 py-1.5 font-body text-xs font-semibold text-white transition hover:opacity-90"
          >
            {status === "published" ? "Unpublish" : "Publish"}
          </button>
        </div>
      </header>

      {/* Tab strip */}
      <div className="flex gap-1 border-b border-line bg-white px-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 font-body text-xs font-semibold transition ${
              tab === t.id
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "fields" && (
        <FieldsTab
          title={title}
          fields={fields}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          addField={addField}
          updateField={updateField}
          duplicateField={duplicateField}
          removeField={removeField}
          selectedField={selectedField}
          sensors={sensors}
          handleDragStart={handleDragStart}
          handleDragOver={handleDragOver}
          handleDragEnd={handleDragEnd}
          handleDragCancel={handleDragCancel}
          activeDrag={activeDrag}
          overId={overId}
        />
      )}

      {tab === "rules" && (
        <RulesTab
          fields={fields}
          onJumpToField={(id) => {
            setSelectedId(id);
            setTab("fields");
          }}
        />
      )}

      {tab === "settings" && (
        <SettingsTab
          settings={settings}
          onChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
          onSavePassword={async (password) => {
            const res = await fetch(`/api/forms/${formId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ password }),
            });
            if (res.ok) toast.success("Password saved");
            else toast.error("Couldn't save the password");
          }}
          storageBytes={storageBytes}
          fileCount={fileCount}
        />
      )}

      {tab === "themes" && (
        <ThemesTab title={title} fields={fields} theme={theme} onThemeChange={setTheme} settings={settings} />
      )}

      {tab === "integrations" && (
        <IntegrationsTab
          formId={formId}
          settings={settings}
          onChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
          deliveries={deliveries}
        />
      )}

      {tab === "share" && <ShareTab formId={formId} title={title} />}
    </div>
  );
}

/* -------------------------------------------------------- Fields tab -------------------------------------------------------- */

function FieldsTab({
  fields,
  selectedId,
  setSelectedId,
  addField,
  updateField,
  duplicateField,
  removeField,
  selectedField,
  sensors,
  handleDragStart,
  handleDragOver,
  handleDragEnd,
  handleDragCancel,
  activeDrag,
  overId,
}: {
  title: string;
  fields: FormField[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  addField: (type: FieldType) => void;
  updateField: (id: string, patch: Partial<FormField>) => void;
  duplicateField: (id: string) => void;
  removeField: (id: string) => void;
  selectedField: FormField | null;
  sensors: ReturnType<typeof useSensors>;
  handleDragStart: (e: DragStartEvent) => void;
  handleDragOver: (e: DragOverEvent) => void;
  handleDragEnd: (e: DragEndEvent) => void;
  handleDragCancel: () => void;
  activeDrag: { id: string; type: FieldType; label: string } | null;
  overId: string | null;
}) {
  const isPaletteDrag = activeDrag?.id.startsWith("palette-") ?? false;

  return (
    <div className="flex flex-1 overflow-hidden">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-line bg-white p-3.5">
          <div className="mb-3.5 flex items-center gap-2 rounded-md bg-paper px-2.5 py-2 font-body text-xs text-muted">
            <Search size={12} /> Search fields
          </div>
          {FIELD_GROUPS.map((group) => (
            <div key={group.label} className="mb-1">
              <p className="mb-1.5 mt-3 font-mono text-[10px] font-bold uppercase tracking-wide text-muted">
                {group.label}
              </p>
              {group.types.map((type) => (
                <PaletteItem key={type} type={type} onClick={() => addField(type)} />
              ))}
            </div>
          ))}
          <p className="mt-3 rounded-md bg-paper p-2.5 font-body text-[11px] text-muted">
            Drag fields onto the canvas, or click to append. Page breaks split your form into multiple pages.
          </p>
        </aside>

        <main className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-xl">
            {fields.length === 0 ? (
              <EmptyCanvasDroppable />
            ) : (
              <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {fields.map((field) => (
                    <SortableFieldRow
                      key={field.id}
                      field={field}
                      selected={field.id === selectedId}
                      isDropTarget={isPaletteDrag && overId === field.id}
                      onSelect={() => setSelectedId(field.id)}
                      onRemove={() => removeField(field.id)}
                      onDuplicate={() => duplicateField(field.id)}
                      onToggleRequired={() => updateField(field.id, { required: !field.required })}
                    />
                  ))}
                </div>
              </SortableContext>
            )}
          </div>
        </main>

        <aside className="w-80 shrink-0 overflow-y-auto border-l border-line bg-white p-4">
          {selectedField ? (
            <FieldEditor
              field={selectedField}
              allFields={fields}
              onChange={(patch) => updateField(selectedField.id, patch)}
            />
          ) : (
            <p className="font-body text-sm text-muted">Select a field to edit its settings.</p>
          )}
        </aside>

        <DragOverlay dropAnimation={null}>
          {activeDrag ? (
            activeDrag.id.startsWith("palette-") ? (
              <PaletteChip type={activeDrag.type} label={activeDrag.label} />
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-[var(--accent)] bg-white px-4 py-3 shadow-xl">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-paper text-muted">
                  {(() => {
                    const Icon = TYPE_ICONS[activeDrag.type];
                    return <Icon size={13} />;
                  })()}
                </span>
                <p className="font-body text-sm text-ink">{activeDrag.label}</p>
              </div>
            )
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function PaletteItem({ type, onClick }: { type: FieldType; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${type}`,
  });
  const Icon = TYPE_ICONS[type];

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`flex w-full cursor-grab items-center gap-2.5 rounded-md px-2 py-1.5 text-left font-body text-xs text-ink transition hover:bg-signalSoft hover:text-[var(--accent)] active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-paper text-muted">
        <Icon size={12} />
      </span>
      {FIELD_LABELS[type]}
    </button>
  );
}

function PaletteChip({ type, label }: { type: FieldType; label: string }) {
  const Icon = TYPE_ICONS[type];
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-[var(--accent)] bg-white px-2 py-1.5 font-body text-xs text-ink shadow-xl">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-paper text-muted">
        <Icon size={12} />
      </span>
      {label}
    </div>
  );
}

function EmptyCanvasDroppable() {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas-empty" });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border border-dashed bg-white p-12 text-center transition ${
        isOver ? "border-[var(--accent)] bg-signalSoft" : "border-line"
      }`}
    >
      <p className="font-body text-sm text-muted">Add a field from the left to start building this form.</p>
    </div>
  );
}

function SortableFieldRow({
  field,
  selected,
  isDropTarget,
  onSelect,
  onRemove,
  onDuplicate,
  onToggleRequired,
}: {
  field: FormField;
  selected: boolean;
  isDropTarget?: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onToggleRequired: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const Icon = TYPE_ICONS[field.type];

  if (field.type === "page_break") {
    return (
      <div
        ref={setNodeRef}
        style={style}
        onClick={onSelect}
        className={`group my-3 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 transition ${
          selected
            ? "border-[var(--accent)] bg-signalSoft"
            : isDropTarget
              ? "border-[var(--accent)] bg-signalSoft"
              : "border-stone-300 hover:border-stone-400"
        }`}
      >
        <span {...attributes} {...listeners} className="cursor-grab text-stone-300">
          <GripVertical size={13} />
        </span>
        <SeparatorHorizontal size={13} className="text-muted" />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-muted">{field.label}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-auto rounded p-1 text-stone-300 opacity-0 transition hover:bg-rose-50 hover:text-warn group-hover:opacity-100"
        >
          <Trash2 size={13} />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`group flex cursor-pointer items-center gap-3 rounded-lg border bg-white px-4 py-3 transition ${
        selected
          ? "border-[var(--accent)] ring-1 ring-[var(--accent)]"
          : isDropTarget
            ? "border-[var(--accent)] bg-signalSoft ring-1 ring-[var(--accent)]"
            : "border-line hover:border-muted"
      }`}
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab select-none text-stone-300 active:cursor-grabbing"
        title="Drag to reorder"
      >
        <GripVertical size={15} />
      </span>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-paper text-muted">
        <Icon size={13} />
      </span>
      <div className="flex-1">
        <p className="font-body text-sm text-ink">
          {field.label}
          {field.required && <span className="text-warn"> *</span>}
        </p>
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted">{FIELD_LABELS[field.type]}</p>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleRequired();
          }}
          title="Toggle required"
          className={`rounded px-1.5 py-1 text-[10px] font-bold ${field.required ? "bg-rose-50 text-warn" : "text-stone-300 hover:bg-paper hover:text-stone-500"}`}
        >
          *
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          title="Duplicate"
          className="rounded p-1.5 text-stone-300 hover:bg-paper hover:text-stone-600"
        >
          <Copy size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Delete"
          className="rounded p-1.5 text-stone-300 hover:bg-rose-50 hover:text-warn"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------- Rules tab -------------------------------------------------------- */

function RulesTab({ fields, onJumpToField }: { fields: FormField[]; onJumpToField: (id: string) => void }) {
  const dataFields = fields.filter((f) => f.type !== "page_break");
  const rulesFields = dataFields.filter((f) => f.showIf && f.showIf.length > 0);

  return (
    <div className="flex-1 overflow-y-auto bg-paper p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-5">
          <h3 className="font-display text-[15px] font-semibold text-ink">Field visibility rules</h3>
          <p className="font-body text-xs text-muted">
            Every conditional rule on this form, in one place. Click one to jump to that field and edit it.
          </p>
        </div>

        {rulesFields.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center">
            <Zap className="mx-auto mb-2 text-stone-300" size={22} />
            <p className="font-body text-xs text-muted">
              No rules yet. Select a field in the <b>Fields</b> tab and use &ldquo;Show this field if&rdquo; to add one.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {rulesFields.map((field) => (
              <button
                key={field.id}
                onClick={() => onJumpToField(field.id)}
                className="flex w-full items-start gap-3 rounded-lg border border-line bg-white p-3.5 text-left transition hover:border-[var(--accent)]"
              >
                <Zap size={14} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                <div className="flex-1 font-body text-xs text-stone-700">
                  Show <b className="text-ink">{field.label}</b> if{" "}
                  {(field.showIf ?? []).map((rule, i) => {
                    const trigger = dataFields.find((f) => f.id === rule.fieldId);
                    const opLabel =
                      rule.operator === "equals"
                        ? "equals"
                        : rule.operator === "not_equals"
                          ? "does not equal"
                          : "contains";
                    return (
                      <span key={i}>
                        {i > 0 && " and "}
                        <b className="text-ink">{trigger?.label ?? "—"}</b> {opLabel}{" "}
                        <span className="rounded bg-paper px-1.5 py-0.5 font-mono text-[11px]">
                          {rule.value || "(empty)"}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------- Settings tab -------------------------------------------------------- */

function SettingsTab({
  settings,
  onChange,
  onSavePassword,
  storageBytes,
  fileCount,
}: {
  settings: FormSettings;
  onChange: (patch: Partial<FormSettings>) => void;
  onSavePassword: (password: string) => Promise<void>;
  storageBytes: number;
  fileCount: number;
}) {
  const inputCls =
    "w-full rounded-md border border-line bg-white px-3 py-2 font-body text-xs text-ink outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]";
  const labelCls = "mb-1 block font-mono text-[11px] font-semibold uppercase tracking-wide text-muted";
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);

  async function savePassword() {
    if (!passwordInput) return;
    await onSavePassword(passwordInput);
    setPasswordInput("");
    setPasswordSaved(true);
    setTimeout(() => setPasswordSaved(false), 2000);
  }

  return (
    <div className="flex-1 overflow-y-auto bg-paper p-8">
      <div className="mx-auto max-w-xl space-y-5">
        <div className="rounded-xl border border-line bg-white p-5">
          <h3 className="mb-3 font-display text-[13px] font-semibold text-ink">Storage</h3>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-paper text-muted">
              <HardDrive size={16} />
            </div>
            <div>
              <p className="font-body text-sm font-semibold text-ink">{formatBytes(storageBytes)} used</p>
              <p className="font-body text-xs text-muted">
                {fileCount} file{fileCount === 1 ? "" : "s"} uploaded to your Supabase S3 storage bucket
              </p>
            </div>
          </div>
          <p className="mt-3 font-body text-[10.5px] leading-relaxed text-muted">
            Files attached to this form are stored privately in the <b>form-attachments</b> bucket. Usage updates
            automatically as respondents upload files and as responses are removed.
          </p>
        </div>

        <div className="rounded-xl border border-line bg-white p-5">
          <h3 className="mb-3 font-display text-[13px] font-semibold text-ink">After submission</h3>
          <div className="mb-4">
            <label className={labelCls}>Confirmation message</label>
            <textarea
              rows={2}
              className={inputCls}
              value={settings.confirmationMessage}
              onChange={(e) => onChange({ confirmationMessage: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>Redirect URL (optional)</label>
            <input
              className={inputCls}
              placeholder="https://example.com/thank-you"
              value={settings.redirectUrl ?? ""}
              onChange={(e) => onChange({ redirectUrl: e.target.value })}
            />
            <p className="mt-1 font-body text-[10.5px] text-muted">
              If set, respondents are sent here instead of seeing the confirmation message.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-white p-5">
          <h3 className="mb-3 font-display text-[13px] font-semibold text-ink">Notifications</h3>
          <label className={labelCls}>Notify by email on new submission</label>
          <input
            className={inputCls}
            placeholder="team@example.com"
            value={settings.notifyEmail ?? ""}
            onChange={(e) => onChange({ notifyEmail: e.target.value })}
          />
          <p className="mt-1 font-body text-[10.5px] text-muted">
            Requires the <code>notify-submission</code> Edge Function to be deployed — see the README.
          </p>
        </div>

        <div className="rounded-xl border border-line bg-white p-5">
          <h3 className="mb-3 font-display text-[13px] font-semibold text-ink">Security</h3>
          <SettingsToggleRow
            label="Require a password to view this form"
            checked={settings.passwordProtected}
            onChange={(v) => onChange({ passwordProtected: v })}
          />
          {settings.passwordProtected && (
            <div className="mt-3 rounded-md border border-line bg-paper p-3">
              <label className={labelCls}>Set password</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  className={inputCls}
                  placeholder="Enter a new password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                />
                <button
                  onClick={savePassword}
                  disabled={!passwordInput}
                  className="shrink-0 rounded-md bg-[var(--accent)] px-3 py-2 font-body text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {passwordSaved ? "Saved" : "Save"}
                </button>
              </div>
              <p className="mt-1.5 font-body text-[10.5px] text-muted">
                Write-only — once saved, the password can&apos;t be viewed again here, only replaced.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-line bg-white p-5">
          <h3 className="mb-3 font-display text-[13px] font-semibold text-ink">Response limits</h3>
          <SettingsToggleRow
            label="Allow multiple submissions per person"
            checked={settings.allowMultiple}
            onChange={(v) => onChange({ allowMultiple: v })}
          />
          <div className="mt-2">
            <SettingsToggleRow
              label="Limit total submissions"
              checked={settings.limitResponses}
              onChange={(v) => onChange({ limitResponses: v })}
            />
            {settings.limitResponses && (
              <input
                type="number"
                className={`${inputCls} mt-2 max-w-[140px]`}
                value={settings.maxResponses}
                onChange={(e) => onChange({ maxResponses: Number(e.target.value) })}
              />
            )}
          </div>
          <div className="mt-2">
            <SettingsToggleRow
              label="Close form on a specific date"
              checked={settings.closeOnDate}
              onChange={(v) => onChange({ closeOnDate: v })}
            />
            {settings.closeOnDate && (
              <input
                type="date"
                className={`${inputCls} mt-2 max-w-[180px]`}
                value={settings.closeDate ?? ""}
                onChange={(e) => onChange({ closeDate: e.target.value })}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="font-body text-xs font-medium text-stone-700">{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-[var(--accent)]" : "bg-stone-200"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${checked ? "left-4" : "left-0.5"}`}
      />
    </button>
  );
}

/* -------------------------------------------------------- Themes tab -------------------------------------------------------- */

function ThemesTab({
  title,
  fields,
  theme,
  onThemeChange,
  settings,
}: {
  title: string;
  fields: FormField[];
  theme: ThemeKey;
  onThemeChange: (t: ThemeKey) => void;
  settings: FormSettings;
}) {
  const dataFieldCount = fields.filter((f) => f.type !== "page_break").length;

  return (
    <div className="flex-1 overflow-y-auto bg-paper p-8">
      <div className="mx-auto grid max-w-4xl grid-cols-[220px_1fr] gap-6">
        <div>
          <h3 className="mb-3 font-display text-[15px] font-semibold text-ink">Accent color</h3>
          <div className="space-y-2">
            {(Object.entries(THEMES) as [ThemeKey, (typeof THEMES)[ThemeKey]][]).map(([key, t]) => (
              <button
                key={key}
                onClick={() => onThemeChange(key)}
                className={`flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition ${
                  theme === key ? "border-[var(--accent)] bg-white" : "border-line bg-white hover:border-stone-300"
                }`}
              >
                <span className="h-5 w-5 rounded-full" style={{ backgroundColor: t.hex }} />
                <span className="font-body text-xs font-medium text-stone-700">{t.label}</span>
                {theme === key && (
                  <span className="ml-auto font-body text-[10px] font-bold text-[var(--accent)]">Active</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-3 font-display text-[15px] font-semibold text-ink">Live preview</h3>
          <div className="rounded-2xl border border-line bg-white p-7 shadow-sm">
            <p className="mb-1 font-display text-lg text-ink">{title}</p>
            <p className="mb-6 font-body text-xs text-muted">This is exactly how respondents will see it.</p>
            {dataFieldCount === 0 ? (
              <p className="font-body text-xs text-muted">Add fields in the Fields tab to preview them here.</p>
            ) : (
              <FormRenderer
                schema={{ fields }}
                onSubmit={async () => ({ ok: true })}
                submitLabel="Submit (preview)"
                settings={settings}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------- Share tab -------------------------------------------------------- */

function ShareTab({ formId, title }: { formId: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const url = typeof window !== "undefined" ? `${window.location.origin}/f/${formId}` : `/f/${formId}`;
  const toast = useToast();

  useEffect(() => {
    QRCode.toDataURL(url, { width: 240, margin: 1, color: { dark: "#0F172A", light: "#FFFFFF" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [url]);

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function downloadQr() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `${title.replace(/\s+/g, "-").toLowerCase() || "form"}-qr.png`;
    a.click();
    toast.info("QR code downloaded");
  }

  return (
    <div className="flex-1 overflow-y-auto bg-paper p-8">
      <div className="mx-auto max-w-xl space-y-4">
        <div className="flex gap-2">
          <div className="flex flex-1 items-center gap-2 truncate rounded-md border border-line bg-white px-3 py-2.5 font-mono text-xs text-stone-600">
            <Link2 size={13} className="shrink-0 text-muted" /> {url}
          </div>
          <button
            onClick={copy}
            className="flex items-center gap-1.5 rounded-md border border-line bg-white px-3 font-body text-xs font-semibold text-ink hover:bg-paper"
          >
            <Copy size={12} /> {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="flex items-center gap-4 rounded-lg border border-line bg-white p-4">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="QR code linking to the public form" className="h-16 w-16 shrink-0 rounded" />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-[var(--accent)] text-white">
              <QrCode size={26} />
            </div>
          )}
          <div>
            <p className="font-body text-xs font-semibold text-ink">Scan to open on mobile</p>
            <p className="font-body text-[11px] text-muted">Print this for signage or handouts.</p>
          </div>
          <button
            onClick={downloadQr}
            disabled={!qrDataUrl}
            className="ml-auto flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 font-body text-xs font-semibold text-ink hover:bg-paper disabled:opacity-40"
          >
            <Download size={12} /> PNG
          </button>
        </div>

        <p className="font-body text-xs text-muted">
          Need to gate access? Password protection and response limits live in the <b>Settings</b> tab.
        </p>
      </div>
    </div>
  );
}
