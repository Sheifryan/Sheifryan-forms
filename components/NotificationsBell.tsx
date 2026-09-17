"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check } from "lucide-react";
import { useFormat } from "@/components/FormatProvider";

interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * Header bell for `notify_team` workflow notifications.
 *
 * Polls once a minute (and on window focus) rather than holding a socket open —
 * this is an internal alert, not a chat. Failures are silent: a broken bell must
 * never make the app feel broken, so it simply shows nothing.
 */
export function NotificationsBell() {
  const { formatRelativeDate } = useFormat();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { notifications?: NotificationItem[]; unread?: number };
      setItems(Array.isArray(data.notifications) ? data.notifications : []);
      setUnread(Number(data.unread ?? 0));
      setLoaded(true);
    } catch {
      /* decoration only */
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function markAllRead() {
    setUnread(0);
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => undefined);
    void load();
  }

  async function openItem(item: NotificationItem) {
    setOpen(false);
    if (!item.readAt) {
      setUnread((current) => Math.max(0, current - 1));
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      }).catch(() => undefined);
    }
    if (item.href) window.location.href = item.href;
    else void load();
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-1.5 text-slate-500 transition hover:bg-paper hover:text-ink dark:text-mutedDark dark:hover:bg-panelDark dark:hover:text-inkDark"
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 font-body text-[9.5px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-white shadow-xl dark:border-lineDark dark:bg-panelDark">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5 dark:border-lineDark">
            <span className="font-body text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-mutedDark">
              Notifications
            </span>
            {unread > 0 && (
              <button
                onClick={() => void markAllRead()}
                className="flex items-center gap-1 font-body text-[11px] font-semibold text-signal transition hover:opacity-80"
              >
                <Check size={11} /> Mark all read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-3.5 py-6 text-center font-body text-[12px] text-slate-400 dark:text-mutedDark">
              {loaded ? "Nothing yet — workflow alerts show up here." : "Loading…"}
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto dark:divide-lineDark">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => void openItem(item)}
                    className={`block w-full px-3.5 py-2.5 text-left transition hover:bg-paper dark:hover:bg-night ${
                      item.readAt ? "" : "bg-signalSoft/10"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!item.readAt && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-body text-[12.5px] font-semibold text-ink dark:text-inkDark">
                          {item.title}
                        </p>
                        {item.body && (
                          <p className="mt-0.5 font-body text-[11.5px] leading-snug text-slate-500 dark:text-mutedDark">
                            {item.body}
                          </p>
                        )}
                        <p
                          className="mt-1 font-body text-[10.5px] text-slate-400 dark:text-mutedDark"
                          suppressHydrationWarning
                        >
                          {formatRelativeDate(item.createdAt)}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
