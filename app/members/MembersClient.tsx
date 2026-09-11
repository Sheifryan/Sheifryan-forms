"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Link2, Mail, MoreVertical, Trash2, UserPlus, UserX, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { formatRelativeDate } from "@/lib/format";
import { ROLE_META, WORKSPACE_ROLES, can, PERMISSION, type MemberLike, type WorkspaceRole } from "@/lib/permissions";

interface MemberRow {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  joinedAt: string | null;
  lastActiveAt: string | null;
}
interface InvitationRow {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
}

export function MembersClient({
  members,
  invitations,
  currentUserId,
  currentRole,
}: {
  members: MemberRow[];
  invitations: InvitationRow[];
  currentUserId: string;
  currentRole: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const me: MemberLike = { role: currentRole, status: "active" };
  const canManageRoles = can(me, PERMISSION.MEMBERS_MANAGE_ROLES);
  const canRemove = can(me, PERMISSION.MEMBERS_REMOVE);

  const activeMembers = useMemo(() => members.filter((m) => m.status !== "invited"), [members]);
  const pending = invitations.filter((i) => i.status === "pending");

  async function patchMember(memberId: string, patch: Record<string, unknown>, successMsg: string) {
    setBusyId(memberId);
    const res = await fetch("/api/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, ...patch }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(successMsg);
      router.refresh();
    } else {
      toast.error("Couldn't update the member", { description: data.error });
    }
    setBusyId(null);
  }

  async function removeMember(m: MemberRow) {
    setBusyId(m.id);
    const res = await fetch(`/api/members?memberId=${encodeURIComponent(m.id)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.info("Member removed", { description: m.email ?? m.name ?? "" });
      router.refresh();
    } else {
      toast.error("Couldn't remove the member", { description: data.error });
    }
    setBusyId(null);
  }

  async function resendInvite(inv: InvitationRow) {
    setBusyId(inv.id);
    const res = await fetch("/api/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitationId: inv.id }),
    });
    if (res.ok) toast.success("Invitation renewed", { description: `Extended for ${inv.email}` });
    else toast.error("Couldn't resend the invitation");
    setBusyId(null);
    router.refresh();
  }

  async function revokeInvite(inv: InvitationRow) {
    setBusyId(inv.id);
    const res = await fetch(`/api/members?invitationId=${encodeURIComponent(inv.id)}`, { method: "DELETE" });
    if (res.ok) toast.info("Invitation revoked", { description: inv.email });
    else toast.error("Couldn't revoke the invitation");
    setBusyId(null);
    router.refresh();
  }

  async function copyInviteLink(token: string) {
    const url = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied", { description: "Share it with your teammate to let them join." });
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  return (
    <div className="min-h-screen p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[15px] font-semibold text-ink dark:text-inkDark">Team members</h2>
          <p className="font-body text-[12px] text-slate-500 dark:text-mutedDark">
            {activeMembers.length} member{activeMembers.length !== 1 ? "s" : ""}
            {pending.length > 0 ? ` · ${pending.length} pending invitation${pending.length !== 1 ? "s" : ""}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="flex items-center gap-1.5 rounded-full bg-signal px-4 py-2 font-body text-[12.5px] font-semibold text-white transition hover:opacity-90"
        >
          <UserPlus size={14} /> Invite Member
        </button>
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-line bg-white shadow-sm dark:border-lineDark dark:bg-panelDark">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-line bg-paper text-left dark:border-lineDark dark:bg-panelDark">
              <Th>Member</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Joined</Th>
              <Th>Last active</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {activeMembers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center font-body text-[12.5px] text-slate-400 dark:text-mutedDark">
                  No members yet.
                </td>
              </tr>
            ) : (
              activeMembers.map((m) => (
                <MemberRowView
                  key={m.id}
                  member={m}
                  isSelf={m.userId === currentUserId}
                  canManageRoles={canManageRoles}
                  canRemove={canRemove}
                  currentRole={currentRole}
                  busy={busyId === m.id}
                  onRole={(role) => void patchMember(m.id, { role }, "Role updated")}
                  onSuspend={() => void patchMember(m.id, { status: "suspended" }, "Member suspended")}
                  onReactivate={() => void patchMember(m.id, { status: "active" }, "Member reactivated")}
                  onRemove={() => void removeMember(m)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {pending.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 font-display text-[14px] font-semibold text-ink dark:text-inkDark">Pending invitations</h3>
          <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm dark:border-lineDark dark:bg-panelDark">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-line bg-paper text-left dark:border-lineDark dark:bg-panelDark">
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Expires</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {pending.map((inv) => (
                  <tr key={inv.id} className="border-b border-line last:border-0 dark:border-lineDark">
                    <td className="px-4 py-2.5 font-body text-[12.5px] text-ink dark:text-inkDark">{inv.email}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 font-body text-[10px] font-semibold ${ROLE_META[(inv.role as WorkspaceRole) ?? "viewer"]?.chip ?? ""}`}>
                        {ROLE_META[(inv.role as WorkspaceRole) ?? "viewer"]?.label ?? inv.role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-body text-[12px] text-slate-500 dark:text-mutedDark" title={inv.expiresAt ?? ""}>
                      {inv.expiresAt ? formatRelativeDate(inv.expiresAt) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => void resendInvite(inv)}
                          disabled={busyId === inv.id}
                          className="rounded-md border border-line px-2.5 py-1 font-body text-[11px] font-medium text-slate-600 transition hover:bg-paper disabled:opacity-50 dark:border-lineDark dark:text-mutedDark dark:hover:bg-panelDark"
                        >
                          Resend
                        </button>
                        <button
                          type="button"
                          onClick={() => void revokeInvite(inv)}
                          disabled={busyId === inv.id}
                          className="rounded-md border border-line px-2.5 py-1 font-body text-[11px] font-medium text-warn transition hover:bg-rose-50 disabled:opacity-50 dark:border-lineDark dark:hover:bg-panelDark"
                        >
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-line bg-white p-4 shadow-sm dark:border-lineDark dark:bg-panelDark">
        <h3 className="font-display text-[14px] font-semibold text-ink dark:text-inkDark">Roles</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {WORKSPACE_ROLES.map((r) => (
            <div key={r} className="rounded-lg border border-line p-3 dark:border-lineDark">
              <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-semibold ${ROLE_META[r].chip}`}>{ROLE_META[r].label}</span>
              <p className="mt-1.5 font-body text-[11px] leading-snug text-slate-500 dark:text-mutedDark">{ROLE_META[r].description}</p>
            </div>
          ))}
        </div>
      </div>

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} onInvited={() => router.refresh()} onCopy={copyInviteLink} />}
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`px-4 py-2.5 font-body text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark ${align === "right" ? "text-right" : ""}`}>
      {children}
    </th>
  );
}

function MemberRowView({
  member,
  isSelf,
  canManageRoles,
  canRemove,
  currentRole,
  busy,
  onRole,
  onSuspend,
  onReactivate,
  onRemove,
}: {
  member: MemberRow;
  isSelf: boolean;
  canManageRoles: boolean;
  canRemove: boolean;
  currentRole: string;
  busy: boolean;
  onRole: (role: string) => void;
  onSuspend: () => void;
  onReactivate: () => void;
  onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isOwner = member.role === "owner";
  const suspended = member.status === "suspended";
  const label = member.name || member.email || "Member";
  const initials = label.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "M";

  // Only the owner may promote to admin — mirror of the server-side guard.
  const assignable: WorkspaceRole[] = currentRole === "owner" ? ["admin", "editor", "viewer"] : ["editor", "viewer"];

  return (
    <tr className="border-b border-line last:border-0 dark:border-lineDark">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-signal to-accent2 text-[10px] font-bold text-white">
            {initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-body text-[12.5px] font-medium text-ink dark:text-inkDark">{label}</span>
            {isSelf && <span className="font-body text-[10px] text-slate-400 dark:text-mutedDark">You</span>}
          </span>
        </div>
      </td>
      <td className="px-4 py-2.5 font-body text-[12px] text-slate-500 dark:text-mutedDark">{member.email ?? "—"}</td>
      <td className="px-4 py-2.5">
        {canManageRoles && !isOwner ? (
          <select
            value={member.role}
            disabled={busy}
            onChange={(e) => onRole(e.target.value)}
            className="rounded-md border border-line bg-white px-2 py-1 font-body text-[11.5px] text-ink outline-none focus:border-signal disabled:opacity-50 dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
          >
            {assignable.map((r) => (
              <option key={r} value={r}>
                {ROLE_META[r].label}
              </option>
            ))}
          </select>
        ) : (
          <span className={`rounded-full px-2 py-0.5 font-body text-[10px] font-semibold ${ROLE_META[(member.role as WorkspaceRole) ?? "viewer"]?.chip ?? ""}`}>
            {ROLE_META[(member.role as WorkspaceRole) ?? "viewer"]?.label ?? member.role}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <span className={`rounded-full px-2 py-0.5 font-body text-[10px] font-semibold ${suspended ? "bg-amber-100 text-amber-700" : "bg-emerald-50 text-success"}`}>
          {suspended ? "Suspended" : "Active"}
        </span>
      </td>
      <td className="px-4 py-2.5 font-body text-[12px] text-slate-500 dark:text-mutedDark">{member.joinedAt ? formatRelativeDate(member.joinedAt) : "—"}</td>
      <td className="px-4 py-2.5 font-body text-[12px] text-slate-500 dark:text-mutedDark">{member.lastActiveAt ? formatRelativeDate(member.lastActiveAt) : "—"}</td>
      <td className="px-4 py-2.5">
        <div className="flex justify-end">
          <div className="relative">
            <button
              type="button"
              disabled={busy}
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Member actions"
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-paper hover:text-ink disabled:opacity-50 dark:text-mutedDark dark:hover:bg-panelDark"
            >
              <MoreVertical size={14} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-20 mt-1.5 w-44 overflow-hidden rounded-lg border border-line bg-white shadow-lg dark:border-lineDark dark:bg-panelDark">
                {!isOwner && (suspended ? (
                  <MenuItem icon={UserPlus} label="Reactivate" onClick={() => { setMenuOpen(false); onReactivate(); }} />
                ) : (
                  <MenuItem icon={UserX} label="Suspend" onClick={() => { setMenuOpen(false); onSuspend(); }} />
                ))}
                {canRemove && !isOwner && <MenuItem icon={Trash2} label="Remove member" danger onClick={() => { setMenuOpen(false); onRemove(); }} />}
                {isOwner && <p className="px-3 py-2 font-body text-[11px] text-slate-400 dark:text-mutedDark">Transfer ownership to change the owner.</p>}
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: typeof Trash2; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left font-body text-[11.5px] transition hover:bg-paper dark:hover:bg-panelDark ${
        danger ? "text-warn" : "text-slate-600 dark:text-mutedDark"
      }`}
    >
      <Icon size={13} /> {label}
    </button>
  );
}

function InviteModal({ onClose, onInvited, onCopy }: { onClose: () => void; onInvited: () => void; onCopy: (token: string) => Promise<void> }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("editor");
  const [busy, setBusy] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit() {
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      toast.error("Enter a valid email address");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: address, role }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setInviteToken(data.invitation?.token ?? null);
      setSentTo(address);
      setEmail("");
      onInvited();
    } else {
      toast.error("Couldn't send the invitation", { description: data.error });
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-line bg-white p-5 shadow-2xl dark:border-lineDark dark:bg-panelDark" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-base font-semibold text-ink dark:text-inkDark">Invite a team member</h3>
            <p className="mt-1 font-body text-[12px] text-slate-500 dark:text-mutedDark">They&apos;ll join this organisation with the role you choose.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-paper dark:hover:bg-panelDark">
            <X size={15} />
          </button>
        </div>

        {inviteToken ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5">
            <p className="flex items-center gap-1.5 font-body text-[12.5px] font-semibold text-emerald-800">
              <Check size={13} /> Invitation created for {sentTo}
            </p>
            <p className="mt-1 font-body text-[11.5px] text-emerald-700">
              Email delivery isn&apos;t configured yet — share this link instead. It expires in 14 days.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <input
                readOnly
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/invite/${inviteToken}`}
                className="min-w-0 flex-1 rounded-md border border-emerald-200 bg-white px-2.5 py-1.5 font-mono text-[10.5px] text-slate-600 outline-none dark:bg-panelDark dark:text-mutedDark"
              />
              <button
                type="button"
                onClick={() => void onCopy(inviteToken)}
                className="flex shrink-0 items-center gap-1.5 rounded-md bg-signal px-3 py-1.5 font-body text-[11px] font-semibold text-white transition hover:opacity-90"
              >
                <Copy size={12} /> Copy
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setInviteToken(null);
                setSentTo(null);
              }}
              className="mt-3 font-body text-[11.5px] font-semibold text-signal hover:underline"
            >
              Invite someone else
            </button>
          </div>
        ) : (
          <InviteForm email={email} setEmail={setEmail} role={role} setRole={setRole} />
        )}

        <div className="mt-5 flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-2 font-body text-xs font-medium text-slate-600 transition hover:bg-paper dark:border-lineDark dark:bg-panelDark dark:text-mutedDark">
            {inviteToken ? "Done" : "Cancel"}
          </button>
          {!inviteToken && (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-signal px-3.5 py-2 font-body text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              <Link2 size={13} /> {busy ? "Creating…" : "Create invitation"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function InviteForm({
  email,
  setEmail,
  role,
  setRole,
}: {
  email: string;
  setEmail: (v: string) => void;
  role: WorkspaceRole;
  setRole: (v: WorkspaceRole) => void;
}) {
  return (
    <>
      <label className="mt-4 block font-body text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Email address</label>
      <div className="relative mt-1">
        <Mail size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-mutedDark" />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@company.com"
          className="w-full rounded-md border border-line bg-white py-2 pl-8 pr-3 font-body text-sm text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
        />
      </div>

      <label className="mt-3 block font-body text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Role</label>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as WorkspaceRole)}
        className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 font-body text-sm text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
      >
        <option value="admin">Admin — manages members, forms, responses, workflows</option>
        <option value="editor">Editor — creates and edits forms, views responses</option>
        <option value="viewer">Viewer — read-only access</option>
      </select>
      <p className="mt-1.5 font-body text-[11px] text-slate-400 dark:text-mutedDark">{ROLE_META[role].description}</p>
    </>
  );
}