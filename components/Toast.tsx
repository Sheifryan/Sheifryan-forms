"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { nanoid } from "nanoid";

type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Milliseconds before auto-dismissing; defaults to 3500. */
  duration?: number;
  /** Optional call-to-action button rendered inside the toast. */
  action?: ToastAction;
}

interface ToastItem extends ToastInput {
  id: string;
  variant: ToastVariant;
  /** Flagged just before unmount so the exit animation can play. */
  leaving?: boolean;
}

type ToastExtra = Omit<ToastInput, "title" | "variant">;

interface ToastApi {
  /** Push a fully custom toast. */
  toast: (input: ToastInput) => void;
  success: (title: string, extra?: ToastExtra) => void;
  error: (title: string, extra?: ToastExtra) => void;
  warning: (title: string, extra?: ToastExtra) => void;
  info: (title: string, extra?: ToastExtra) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** How long the exit animation runs before a toast is unmounted. */
const EXIT_MS = 180;
/** Maximum toasts shown at once; the oldest are dropped first. */
const MAX_VISIBLE = 5;
const DEFAULT_DURATION = 3500;

const ICONS: Record<ToastVariant, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

// Left accent border + icon colour per variant, using the app's design tokens.
const ACCENTS: Record<ToastVariant, string> = {
  success: "border-l-success text-success",
  error: "border-l-warn text-warn",
  warning: "border-l-amber-400 text-amber-500",
  info: "border-l-signal text-signal",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Clear any pending timers if the provider unmounts (e.g. hot reload).
  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((timer) => clearTimeout(timer));
  }, []);

  const dismiss = useCallback((id: string) => {
    // Flag the toast as leaving so the exit animation plays, then unmount it.
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    const existing = timers.current.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timers.current.delete(id);
    }, EXIT_MS);
    timers.current.set(id, timer);
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = nanoid(6);
      const item: ToastItem = { ...input, id, variant: input.variant ?? "info" };
      setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), item]);
      const timer = setTimeout(() => dismiss(id), input.duration ?? DEFAULT_DURATION);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast: push,
      success: (title, extra) => push({ ...extra, title, variant: "success" }),
      error: (title, extra) => push({ ...extra, title, variant: "error" }),
      warning: (title, extra) => push({ ...extra, title, variant: "warning" }),
      info: (title, extra) => push({ ...extra, title, variant: "info" }),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Viewport — fixed top-right, stacked; the wrapper stays click-transparent. */}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-72 flex-col gap-2">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const Icon = ICONS[toast.variant];
  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border border-line border-l-2 bg-white p-3.5 shadow-lg shadow-slate-200/70 ${
        ACCENTS[toast.variant]
      } ${toast.leaving ? "toast-out" : "toast-in"}`}
    >
      <Icon size={17} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-body text-xs font-semibold leading-snug text-ink">{toast.title}</p>
        {toast.description && (
          <p className="mt-1 font-body text-[11px] leading-relaxed text-muted">{toast.description}</p>
        )}
        {toast.action && (
          <button
            onClick={() => {
              toast.action?.onClick();
              onDismiss();
            }}
            className="mt-2 rounded-md bg-paper px-2 py-1 font-body text-[11px] font-semibold text-signal transition hover:bg-signalSoft"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="shrink-0 rounded p-0.5 text-muted transition hover:bg-paper hover:text-ink"
      >
        <X size={13} />
      </button>
    </div>
  );
}

export function useToast() {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used within a <ToastProvider>");
  return api;
}
