"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, Bell, Copy, History, Mail, Plus, Radio, Trash2, UserCheck, Webhook, Zap } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useFormat } from "@/components/FormatProvider";

interface WorkflowRow {
  id: string;
  name: string;
  triggerType: string;
  triggerFormId: string | null;
  actions: unknown;
  enabled: boolean;
  lastRunAt: string | null;
  createdAt: string;
}
interface FormRow {
  id: string;
  title: string;
}
interface MemberOption {
  userId: string;
  name: string | null;
  email: string | null;
}
interface HistoryEntry {
  id: string;
  action: string;
  createdAt: string;
  actorName: string | null;
}

const ACTION_META = [
  { type: "email_notification", label: "Send email notification", icon: Mail, hint: "notify you when a form receives a response" },
  { type: "confirmation_email", label: "Send confirmation email", icon: Mail, hint: "automatically confirm the respondent's submission" },
  { type: "webhook", label: "Add a webhook", icon: Webhook, hint: "deliver the response payload to a URL" },
  { type: "update_status", label: "Update internal status", icon: Radio, hint: "flip a status field visible in your responses" },
  { type: "assign_response", label: "Assign to a team member", icon: UserCheck, hint: "route the response to one person in your organisation" },
  { type: "notify_team", label: "Notify the team", icon: Bell, hint: "alert your organisation members about the new response" },
] as const;

export function WorkflowsClient({
  workflows,
  forms,
  current,
  limit,
  planName,
  members = [],
  orgMode = false,
  history = [],
}: {
  workflows: WorkflowRow[];
  forms: FormRow[];
  current: number;
  limit: number;
  planName: string;
  members?: MemberOption[];
  orgMode?: boolean;
  history?: HistoryEntry[];
}) {
  const router = useRouter();
  const toast = useToast();
  const { formatRelativeDate } = useFormat();
  const [creatorOpen, setCreatorOpen] = useState(false);

  async function toggle(w: WorkflowRow) {
    const res = await fetch(`/api/workflows?id=${w.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !w.enabled }),
    });
    if (res.ok) toast.info(w.enabled ? "Workflow paused" : "Workflow enabled");
    else toast.error("Couldn't update the workflow");
    router.refresh();
  }

  async function remove(w: WorkflowRow) {
    const res = await fetch(`/api/workflows?id=${w.id}`, { method: "DELETE" });
    if (res.ok) toast.info("Workflow deleted", { description: w.name });
    else toast.error("Couldn't delete the workflow");
    router.refresh();
  }

  const overLimit = limit >= 0 && current >= limit;

  // Clones a workflow as a paused copy, ready to edit.
  async function duplicate(w: WorkflowRow) {
    const res = await fetch(`/api/workflows?duplicate=${encodeURIComponent(w.id)}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) toast.success("Workflow duplicated", { description: "The copy starts paused." });
    else toast.error("Couldn't duplicate the workflow", { description: data.error });
    router.refresh();
  }

  return (
    <div className="min-h-screen p-7">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[15px] font-semibold text-ink dark:text-inkDark">Automate responses</h2>
          <p className="font-body text-[12px] text-slate-500 dark:text-mutedDark">When a form gets a new response, run one or more actions.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreatorOpen(true)}
          disabled={overLimit}
          className="flex items-center gap-1.5 rounded-full bg-signal px-4 py-2 font-body text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={14} /> Create Workflow
        </button>
      </div>
      <p className="font-body text-[11px] text-slate-400 dark:text-mutedDark">
        {limit < 0 ? `${current} active` : `${current} of ${limit} workflows used`} on your {planName} plan
      </p>

      {overLimit && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5 font-body text-[12px] text-amber-800">
          You&apos;ve hit the {planName} plan limit of {limit} workflows — upgrade from Settings → Billing to add more.
        </div>
      )}

      <div className="mt-5 space-y-4">
        {workflows.length === 0 ? (
          <EmptyState onOpen={() => setCreatorOpen(true)} />
        ) : (
          workflows.map((w) => (
            <WorkflowCard
              key={w.id}
              workflow={w}
              formTitle={forms.find((f) => f.id === w.triggerFormId)?.title ?? "Any form"}
              members={members}
              onToggle={() => void toggle(w)}
              onDuplicate={() => void duplicate(w)}
              onDelete={() => void remove(w)}
            />
          ))
        )}
      </div>

      {history.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-2.5 flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">
            <History size={13} /> Recent workflow activity
          </h3>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white shadow-sm dark:divide-lineDark dark:border-lineDark dark:bg-panelDark">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="font-body text-[12px] text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-ink dark:text-inkDark">{h.actorName ?? "Someone"}</span>{" "}
                  {h.action.replace(/^workflow\./, "").replace(/_/g, " ")}
                </span>
                <span className="shrink-0 font-body text-[11px] text-slate-400 dark:text-mutedDark" suppressHydrationWarning>{formatRelativeDate(h.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {creatorOpen && (
        <WorkflowCreator
          forms={forms}
          members={members}
          orgMode={orgMode}
          onClose={() => setCreatorOpen(false)}
          onCreated={() => {
            setCreatorOpen(false);
            toast.success("Workflow created", { description: "It will run on new responses." });
            router.refresh();
          }}
        />
      )}
    </div>
  );
function WorkflowCard({
  workflow: w,
  formTitle,
  members = [],
  onToggle,
  onDuplicate,
  onDelete,
}: {
  workflow: WorkflowRow;
  formTitle: string;
  members?: MemberOption[];
  onToggle: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const actions = (Array.isArray(w.actions) ? w.actions : []) as {
    type: string;
    label?: string;
    assignToUserId?: string;
    notifyUserIds?: string[];
  }[];

  const memberName = (id: string) => {
    const m = members.find((x) => x.userId === id);
    return m ? m.name || m.email || "Member" : "Member";
  };
  const { formatDateTime } = useFormat();

  /** "Assign to a team member" → "→ Priya", "Notify the team" → "· +3 people". */
  function actionDetail(a: { type: string; assignToUserId?: string; notifyUserIds?: string[] }): string | null {
    if (a.type === "assign_response") return a.assignToUserId ? `→ ${memberName(a.assignToUserId)}` : "→ unassigned";
    if (a.type === "notify_team") {
      if (!a.notifyUserIds || a.notifyUserIds.length === 0) return "· everyone";
      return `· ${a.notifyUserIds.map(memberName).join(", ")}`;
    }
    return null;
  }

  return (
    <div className={`rounded-xl border border-line bg-white shadow-sm dark:border-lineDark dark:bg-panelDark ${w.enabled ? "" : "opacity-60"}`}>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0">
          <p className="font-body text-sm font-semibold text-ink dark:text-inkDark">{w.name}</p>
          <p className="font-body text-[11.5px] text-slate-500 dark:text-mutedDark">
            Triggered by <b>{formTitle}</b> · {w.lastRunAt ? `last ran ${formatDateTime(w.lastRunAt)}` : "never ran yet"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-label={w.enabled ? "Pause workflow" : "Enable workflow"}
            className={`relative h-6 w-11 rounded-full transition ${w.enabled ? "bg-success" : "bg-slate-300 dark:bg-lineDark"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${w.enabled ? "left-[22px]" : "left-0.5"}`} />
          </button>
          <button type="button" onClick={onDuplicate} aria-label="Duplicate workflow" className="rounded-md p-1.5 text-slate-400 transition hover:bg-paper hover:text-signal dark:text-mutedDark dark:hover:bg-panelDark">
            <Copy size={14} />
          </button>
          <button type="button" onClick={onDelete} aria-label="Delete workflow" className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-warn dark:text-mutedDark dark:hover:bg-panelDark">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <span className="flex items-center gap-1.5 rounded-md bg-signalSoft/20 px-2.5 py-1.5 font-body text-[11px] font-semibold text-signal">
          <Zap size={12} /> New Form Response
        </span>
        {actions.length === 0 ? (
          <span className="rounded-md bg-paper px-2.5 py-1.5 font-body text-[11px] text-slate-400 dark:bg-panelDark dark:text-mutedDark">No actions yet</span>
        ) : (
          actions.map((a, i) => {
            const meta = ACTION_META.find((m) => m.type === a.type);
            const Icon = meta?.icon ?? Plus;
            const detail = actionDetail(a);
            return (
              <span key={i} className="flex items-center gap-1.5 rounded-md bg-paper px-2.5 py-1.5 font-body text-[11px] text-slate-600 dark:bg-panelDark dark:text-mutedDark">
                <Icon size={12} className="text-slate-400 dark:text-mutedDark" /> {meta?.label ?? a.label ?? a.type}
                {detail && <span className="text-slate-400 dark:text-mutedDark">{detail}</span>}
                {i < actions.length - 1 && <ArrowDown size={11} className="text-slate-300 dark:text-lineDark" />}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}

function EmptyState({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-line bg-white p-12 text-center dark:border-lineDark dark:bg-panelDark">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-signalSoft/20">
        <Zap size={24} className="text-signal" />
      </div>
      <h3 className="font-display text-lg font-semibold text-ink dark:text-inkDark">Automate your first workflow</h3>
      <p className="mt-1.5 font-body text-sm text-slate-500 dark:text-mutedDark">Get an email, fire a webhook, or update a status the moment a response arrives.</p>
      <button onClick={onOpen} className="mt-5 flex items-center gap-1.5 rounded-full bg-signal px-4 py-2 font-body text-[12.5px] font-semibold text-white transition hover:opacity-90">
        <Plus size={14} /> Create Workflow
      </button>
    </div>
  );
}
function WorkflowCreator({
  forms,
  members = [],
  orgMode = false,
  onClose,
  onCreated,
}: {
  forms: FormRow[];
  members?: MemberOption[];
  orgMode?: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [formId, setFormId] = useState(forms[0]?.id ?? "");
  const [name, setName] = useState("When a form gets a new response");
  const [selected, setSelected] = useState<string[]>([]);
  const [assignTo, setAssignTo] = useState("");
  const [notifyIds, setNotifyIds] = useState<string[]>([]);

  // Team-routing actions only make sense inside an organisation.
  const actionOptions = orgMode ? ACTION_META : ACTION_META.filter((a) => a.type !== "assign_response" && a.type !== "notify_team");

  function addAction(type: string) {
    if (selected.includes(type)) return;
    setSelected([...selected, type]);
  }

  function toggleNotify(id: string) {
    setNotifyIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function create() {
    setBusy(true);
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || "New workflow",
        formId: formId || null,
        actions: selected.slice(0, 5).map((type) => {
          if (type === "assign_response") return { type, assignToUserId: assignTo || undefined };
          if (type === "notify_team") return { type, notifyUserIds: notifyIds };
          return { type };
        }),
      }),
    });
    const data = await res.json();
    if (data.id) onCreated();
    else toast.error("Couldn't create the workflow");
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[92%] w-full max-w-md overflow-y-auto rounded-xl border border-line bg-white p-5 shadow-2xl dark:border-lineDark dark:bg-panelDark" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-base font-semibold text-ink dark:text-inkDark">Create a workflow</h3>
        <p className="mt-1 font-body text-[12px] text-slate-500 dark:text-mutedDark">Automate what happens after a new response arrives.</p>

        <label className="mt-4 block font-body text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Workflow name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 font-body text-sm text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
        />

        <label className="mt-3 block font-body text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Trigger</label>
        <select
          value={formId}
          onChange={(e) => setFormId(e.target.value)}
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 font-body text-sm text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
        >
          <option value="">Any form</option>
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </select>
        <p className="mt-1.5 font-body text-[11.5px] text-slate-400 dark:text-mutedDark">When this form receives a new response…</p>

        <label className="mt-4 block font-body text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Then run these actions</label>
        <div className="mt-1.5 space-y-2">
          {actionOptions.map((a) => {
            const checked = selected.includes(a.type);
            return (
              <label key={a.type} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition ${checked ? "border-signal bg-signalSoft/10" : "border-line bg-white hover:border-signal dark:border-lineDark dark:bg-panelDark"}`}>
                <input type="checkbox" checked={checked} onChange={() => (checked ? setSelected(selected.filter((s) => s !== a.type)) : addAction(a.type))} className="mt-0.5 accent-[#6D28D9]" />
                <span>
                  <span className="flex items-center gap-1.5 font-body text-[12.5px] font-medium text-ink dark:text-inkDark">
                    <a.icon size={13} className="text-slate-400 dark:text-mutedDark" /> {a.label}
                  </span>
                  <span className="mt-0.5 block font-body text-[11px] text-slate-400 dark:text-mutedDark">{a.hint}</span>
                </span>
              </label>
            );
          })}
        </div>

        {selected.includes("assign_response") && members.length > 0 && (
          <div className="mt-3 rounded-lg border border-line bg-paper p-3 dark:border-lineDark dark:bg-panelDark">
            <label className="block font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Assign new responses to</label>
            <select
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-white px-2.5 py-2 font-body text-xs text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
            >
              <option value="">Leave unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name || m.email || "Member"}
                </option>
              ))}
            </select>
          </div>
        )}

        {selected.includes("notify_team") && members.length > 0 && (
          <div className="mt-3 rounded-lg border border-line bg-paper p-3 dark:border-lineDark dark:bg-panelDark">
            <label className="block font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Notify</label>
            <p className="mt-0.5 font-body text-[10.5px] text-slate-400 dark:text-mutedDark">Tick nobody to alert everyone with access.</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {members.map((m) => {
                const on = notifyIds.includes(m.userId);
                return (
                  <button
                    key={m.userId}
                    type="button"
                    onClick={() => toggleNotify(m.userId)}
                    className={`rounded-full border px-2.5 py-1 font-body text-[11px] transition ${
                      on ? "border-signal bg-signalSoft/20 text-signal" : "border-line text-slate-500 hover:border-signal dark:border-lineDark dark:text-mutedDark"
                    }`}
                  >
                    {m.name || m.email || "Member"}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2.5">
          <button onClick={onClose} className="rounded-lg border border-line px-3.5 py-2 font-body text-xs font-medium text-slate-600 transition hover:bg-paper dark:border-lineDark dark:bg-panelDark dark:text-mutedDark">
            Cancel
          </button>
          <button onClick={() => void create()} disabled={busy} className="rounded-lg bg-signal px-3.5 py-2 font-body text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
            {busy ? "Creating…" : "Create workflow"}
          </button>
        </div>
      </div>
    </div>
  );
}
}