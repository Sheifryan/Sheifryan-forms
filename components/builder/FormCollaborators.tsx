"use client";

import { useCallback, useEffect, useState } from "react";
import { Crown, Link2, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { FORM_ACCESS_LABELS, FORM_ACCESS_LEVELS, type FormAccessLevel } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Per-form collaboration ("Collaborators" tab in the builder).
//
// Organisation members already reach the form through their org role; this
// panel adds finer-grained, per-form access. `canManage` comes from the API and
// is the same check the route enforces server-side — hiding the controls is
// only cosmetic.
// ---------------------------------------------------------------------------

interface Collaborator {
  userId: string;
  level: string;
  name: string | null;
  email: string | null;
  isCreator: boolean;
}

interface Candidate {
  userId: string;
  workspaceRole: string;
  name: string | null;
  email: string | null;
}

const LEVEL_HINT: Record<FormAccessLevel, string> = {
  viewer: "Can view the form and its responses",
  editor: "Can edit the form and see responses",
  owner: "Full control, including managing access",
};

export function FormCollaborators({ formId }: { formId: string }) {
  const toast = useToast();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pickId, setPickId] = useState("");
  const [pickLevel, setPickLevel] = useState<FormAccessLevel>("editor");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/forms/${formId}/members`);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      setCollaborators(data.collaborators ?? []);
      setCandidates(data.candidates ?? []);
      setCanManage(Boolean(data.canManage));
    }
    setLoading(false);
  }, [formId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(userId: string, level: FormAccessLevel) {
    setBusy(true);
    const res = await fetch(`/api/forms/${formId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, level }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      toast.success("Form access updated");
      setPickId("");
      await load();
    } else {
      toast.error("Couldn't update form access", { description: data.error });
    }
  }

  async function remove(userId: string) {
    setBusy(true);
    const res = await fetch(`/api/forms/${formId}/members?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      toast.success("Removed from this form");
      await load();
    } else {
      toast.error("Couldn't remove access", { description: data.error });
    }
  }

  const nameOf = (c: Collaborator | Candidate) => c.name || c.email || "Member";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-1 flex items-center gap-2">
        <Users size={16} className="text-signal" />
        <h3 className="font-display text-base font-semibold text-ink dark:text-inkDark">Form collaborators</h3>
      </div>
      <p className="mb-5 font-body text-xs text-slate-500 dark:text-mutedDark">
        Everyone in this workspace can already open the form. Add someone here to give them a different level of access on
        just this form — for example, an editor who shouldn&apos;t touch the rest of the workspace.
      </p>

      {canManage && (
        <div className="mb-5 rounded-xl border border-line bg-white p-4 shadow-sm dark:border-lineDark dark:bg-panelDark">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[220px] flex-1 flex-col gap-1">
              <span className="font-body text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Team member</span>
              <select
                value={pickId}
                onChange={(e) => setPickId(e.target.value)}
                className="rounded-md border border-line bg-white px-2.5 py-2 font-body text-xs text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
              >
                <option value="">Select a member…</option>
                {candidates.map((c) => (
                  <option key={c.userId} value={c.userId}>
                    {nameOf(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-body text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Access level</span>
              <select
                value={pickLevel}
                onChange={(e) => setPickLevel(e.target.value as FormAccessLevel)}
                className="rounded-md border border-line bg-white px-2.5 py-2 font-body text-xs text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
              >
                {FORM_ACCESS_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {FORM_ACCESS_LABELS[l]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!pickId || busy}
              onClick={() => void save(pickId, pickLevel)}
              className="flex items-center gap-1.5 rounded-md bg-signal px-3.5 py-2 font-body text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              <UserPlus size={13} /> Add
            </button>
          </div>
          <p className="mt-2.5 font-body text-[11px] text-slate-400 dark:text-mutedDark">{LEVEL_HINT[pickLevel]}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm dark:border-lineDark dark:bg-panelDark">
        {loading ? (
          <p className="px-4 py-6 text-center font-body text-xs text-slate-400 dark:text-mutedDark">Loading collaborators…</p>
        ) : collaborators.length === 0 ? (
          <p className="px-4 py-6 text-center font-body text-xs text-slate-400 dark:text-mutedDark">
            No one has individual access yet — the whole workspace can open this form.
          </p>
        ) : (
          <ul className="divide-y divide-line dark:divide-lineDark">
            {collaborators.map((c) => (
              <li key={c.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-signal to-accent2 font-body text-[11px] font-bold text-white">
                  {nameOf(c)[0]?.toUpperCase() ?? "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-body text-[12.5px] font-semibold text-ink dark:text-inkDark">
                    {nameOf(c)}
                    {c.isCreator && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 font-body text-[9.5px] font-semibold text-amber-700">
                        <Crown size={9} /> Creator
                      </span>
                    )}
                  </p>
                  <p className="truncate font-body text-[11px] text-slate-400 dark:text-mutedDark">{c.email ?? "—"}</p>
                </div>

                {canManage ? (
                  <select
                    value={c.level}
                    disabled={busy}
                    onChange={(e) => void save(c.userId, e.target.value as FormAccessLevel)}
                    className="rounded-md border border-line bg-white px-2 py-1.5 font-body text-[11.5px] text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
                  >
                    {FORM_ACCESS_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {FORM_ACCESS_LABELS[l]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 font-body text-[10.5px] font-semibold text-slate-600 dark:bg-panelDark dark:text-mutedDark">
                    <ShieldCheck size={11} /> {FORM_ACCESS_LABELS[(c.level as FormAccessLevel) ?? "viewer"] ?? c.level}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => void remove(c.userId)}
                  disabled={busy}
                  title="Remove from this form"
                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-warn disabled:opacity-50 dark:text-mutedDark dark:hover:bg-panelDark"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 flex items-center gap-1.5 font-body text-[11px] text-slate-400 dark:text-mutedDark">
        <Link2 size={11} /> Organisation roles still apply — a form-level row can narrow access, never widen it.
      </p>
    </div>
  );
}
