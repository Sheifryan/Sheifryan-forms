"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Bell, BellRing, Check, CreditCard, KeyRound, MonitorSmartphone, Palette, Save, Shield, ShieldCheck, Trash2, User, Building2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { applyTheme } from "@/lib/theme";
import { useFormat } from "@/components/FormatProvider";
import { formatBytes, planById, priceUgx, usagePercent } from "@/lib/plans";
import { planUsageRows } from "@/lib/usage";
import type { PlanUsage } from "@/lib/usage";
import type { Plan, PlanId } from "@/lib/plans";
import { PLAN_ORDER, PLANS, planOrderFor } from "@/lib/plans";

type Prefs = {
  theme?: "light" | "dark" | "system";
  language?: string;
  timezone?: string;
  notifications?: { responses?: boolean; weekly?: boolean; usage?: boolean; workflowFailures?: boolean };
};
type Usage = PlanUsage;

const TABS: { id: string; label: string; icon: typeof User }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "preferences", label: "Preferences", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  { id: "billing", label: "Billing & Plan", icon: CreditCard },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
];

export interface OrgSettings {
  name: string;
  description: string;
  industry: string;
  country: string;
  timezone: string;
  logoUrl: string;
  orgType: string;
  orgSize: string;
}

/** Organisation-level preferences stored as jsonb on the workspace (0016). */
export interface OrgPreferences {
  security: {
    require2fa?: boolean;
    enforceDomains?: boolean;
    invitationExpiryDays?: number;
    sessionTimeoutMinutes?: number;
    auditRetentionDays?: number;
  };
  notifications: {
    newResponse?: boolean;
    newMember?: boolean;
    invitationAccepted?: boolean;
    weeklyDigest?: boolean;
    storageAlerts?: boolean;
    billingAlerts?: boolean;
  };
  allowedEmailDomains: string[];
}

export function SettingsClient({
  initialTab,
  email,
  authId,
  profile,
  workspace,
  members = [],
  isOwner = false,
  organisation = null,
  orgPreferences = null,
  plan,
  usage,
}: {
  initialTab: string;
  email: string;
  authId: string;
  profile: { fullName: string; avatarUrl?: string | null; preferences: Prefs };
  workspace: { id?: string | null; name: string; plan: string; credits: number; kind?: string };
  members?: { userId: string; name: string | null; email: string | null; role: string }[];
  isOwner?: boolean;
  organisation?: OrgSettings | null;
  orgPreferences?: OrgPreferences | null;
  plan: Plan;
  usage: Usage;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState(initialTab);
  const [fullName, setFullName] = useState(profile.fullName);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatarUrl ?? null);
  const [theme, setTheme] = useState<"light" | "dark" | "system">(profile.preferences.theme ?? "system");
  const [language, setLanguage] = useState(profile.preferences.language ?? "en");
  const [timezone, setTimezone] = useState(profile.preferences.timezone ?? "UTC");
  const notif = profile.preferences.notifications ?? {};
  const [notifResponses, setNotifResponses] = useState(notif.responses ?? true);
  const [notifWeekly, setNotifWeekly] = useState(notif.weekly ?? true);
  const [notifUsage, setNotifUsage] = useState(notif.usage ?? true);
  const [notifFailures, setNotifFailures] = useState(notif.workflowFailures ?? true);
  const [busy, setBusy] = useState(false);

  async function saveProfile() {
    setBusy(true);
    const res = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName }) });
    if (res.ok) toast.success("Profile saved");
    else toast.error("Couldn't save your profile");
    setBusy(false);
    router.refresh();
  }

  async function savePreferences() {
    setBusy(true);
    applyTheme(theme);
    window.dispatchEvent(new Event("nibble:theme-changed"));
    const res = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences: { theme, language, timezone } }) });
    if (res.ok) toast.success("Preferences saved");
    else toast.error("Couldn't save preferences");
    setBusy(false);
  }

  async function saveNotifications() {
    setBusy(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: { notifications: { responses: notifResponses, weekly: notifWeekly, usage: notifUsage, workflowFailures: notifFailures } } }),
    });
    if (res.ok) toast.success("Notification preferences saved");
    else toast.error("Couldn't save preferences");
    setBusy(false);
  }

  const tabs =
    workspace.kind === "business"
      ? [
          { id: "organisation", label: "Organisation", icon: Building2 },
          { id: "org-security", label: "Org Security", icon: ShieldCheck },
          { id: "org-notifications", label: "Org Notifications", icon: BellRing },
          ...TABS,
        ]
      : TABS;

  return (
    <div className="min-h-screen p-7">
      <div className="grid grid-cols-[220px_1fr] gap-6">
        <nav className="space-y-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                router.push(`/settings?tab=${t.id}`);
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left font-body text-[13px] font-medium transition ${
                tab === t.id ? "bg-signalSoft/25 font-semibold text-signal" : "text-slate-500 hover:bg-paper hover:text-ink dark:text-mutedDark dark:hover:bg-panelDark dark:hover:text-inkDark"
              }`}
            >
              <t.icon size={15} className={tab === t.id ? "text-signal" : "text-slate-400 dark:text-mutedDark"} />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          {tab === "profile" && <ProfileTab email={email} fullName={fullName} setFullName={setFullName} avatarPreview={avatarPreview} busy={busy} onSave={() => void saveProfile()} />}
          {tab === "preferences" && <PreferencesTab theme={theme} setTheme={setTheme} language={language} setLanguage={setLanguage} timezone={timezone} setTimezone={setTimezone} busy={busy} onSave={() => void savePreferences()} />}
          {tab === "notifications" && (
            <NotificationsTab responses={notifResponses} weekly={notifWeekly} usage={notifUsage} failures={notifFailures} setResponses={setNotifResponses} setWeekly={setNotifWeekly} setUsage={setNotifUsage} setFailures={setNotifFailures} busy={busy} onSave={() => void saveNotifications()} />
          )}
          {tab === "organisation" && organisation && <OrganisationTab organisation={organisation} />}
          {tab === "org-security" && orgPreferences && (
            <OrgSecurityTab preferences={orgPreferences} canManage={isOwner || members.length > 0} />
          )}
          {tab === "org-notifications" && orgPreferences && <OrgNotificationsTab preferences={orgPreferences} />}
          {tab === "security" && <SecurityTab email={email} />}
          {tab === "billing" && <BillingTab workspace={workspace} plan={plan} usage={usage} isOrganisation={workspace.kind === "business"} />}
          {tab === "danger" && <DangerZone workspace={workspace} email={email} organisation={workspace.kind === "business"} members={members} isOwner={isOwner} />}
        </div>
      </div>
    </div>
  );
function SectionCard({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-sm dark:border-lineDark dark:bg-panelDark">
      <h3 className="font-display text-[15px] font-semibold text-ink dark:text-inkDark">{title}</h3>
      {desc && <p className="mt-0.5 font-body text-[12px] text-slate-500 dark:text-mutedDark">{desc}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** Shared switch row used by the organisation security/notification tabs. */
function ToggleRow({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-white p-3 transition hover:border-signal dark:border-lineDark dark:bg-panelDark">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#6D28D9]" />
      <span className="min-w-0">
        <span className="block font-body text-[12.5px] font-medium text-ink dark:text-inkDark">{label}</span>
        {hint && <span className="mt-0.5 block font-body text-[11px] text-slate-400 dark:text-mutedDark">{hint}</span>}
      </span>
    </label>
  );
}

function OrgSecurityTab({ preferences, canManage }: { preferences: OrgPreferences; canManage: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [require2fa, setRequire2fa] = useState(Boolean(preferences.security.require2fa));
  const [enforceDomains, setEnforceDomains] = useState(Boolean(preferences.security.enforceDomains));
  const [expiry, setExpiry] = useState(String(preferences.security.invitationExpiryDays ?? 7));
  const [sessionTimeout, setSessionTimeout] = useState(String(preferences.security.sessionTimeoutMinutes ?? 1440));
  const [retention, setRetention] = useState(String(preferences.security.auditRetentionDays ?? 365));
  const [domains, setDomains] = useState<string[]>(preferences.allowedEmailDomains);
  const [domainDraft, setDomainDraft] = useState("");

  function addDomain() {
    const clean = domainDraft.trim().toLowerCase().replace(/^@/, "");
    if (!clean) return;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(clean)) {
      toast.error("That doesn't look like a domain");
      return;
    }
    if (!domains.includes(clean)) setDomains([...domains, clean]);
    setDomainDraft("");
  }

  async function save() {
    setBusy(true);
    const res = await fetch("/api/organisations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        security: {
          require2fa,
          enforceDomains,
          invitationExpiryDays: Number(expiry) || 7,
          sessionTimeoutMinutes: Number(sessionTimeout) || 1440,
          auditRetentionDays: Number(retention) || 365,
        },
        allowedEmailDomains: domains,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) toast.success("Security policy saved");
    else toast.error("Couldn't save the security policy", { description: data.error });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <SectionCard title="Access & authentication" desc="Applies to everyone in this organisation.">
        <div className="space-y-2.5">
          <ToggleRow checked={require2fa} onChange={setRequire2fa} label="Require two-factor authentication" hint="Members are prompted to enrol a second factor before their next sign-in." />
          <ToggleRow checked={enforceDomains} onChange={setEnforceDomains} label="Restrict invitations to allowed domains" hint="Blocks invites to any email outside the list below." />
        </div>
      </SectionCard>
      <SectionCard title="Allowed email domains" desc="With the restriction above on, only these domains can be invited.">
        <div className="flex flex-wrap gap-1.5">
          {domains.length === 0 ? (
            <span className="font-body text-[11.5px] text-slate-400 dark:text-mutedDark">No restriction — anyone can be invited.</span>
          ) : (
            domains.map((d) => (
              <span key={d} className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-body text-[11.5px] text-slate-600 dark:border-lineDark dark:text-slate-300">
                @{d}
                <button type="button" onClick={() => setDomains(domains.filter((x) => x !== d))} disabled={!canManage} aria-label={`Remove ${d}`} className="text-slate-400 transition hover:text-warn disabled:opacity-40">
                  ×
                </button>
              </span>
            ))
          )}
        </div>
        {canManage && (
          <div className="mt-3 flex gap-2">
            <input
              value={domainDraft}
              onChange={(e) => setDomainDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addDomain();
                }
              }}
              placeholder="acme.com"
              className="flex-1 rounded-md border border-line bg-white px-3 py-2 font-body text-xs text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
            />
            <button type="button" onClick={addDomain} className="rounded-md border border-line px-3 py-2 font-body text-xs font-medium text-slate-600 transition hover:bg-paper dark:border-lineDark dark:text-mutedDark dark:hover:bg-panelDark">
              Add domain
            </button>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Session & audit policy">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="font-body text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Invitation expiry (days)</span>
            <input type="number" min={1} max={90} value={expiry} onChange={(e) => setExpiry(e.target.value)} disabled={!canManage} className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 font-body text-xs text-ink outline-none focus:border-signal disabled:opacity-60 dark:border-lineDark dark:bg-panelDark dark:text-inkDark" />
          </label>
          <label className="block">
            <span className="font-body text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Session timeout (min)</span>
            <input type="number" min={15} max={43200} value={sessionTimeout} onChange={(e) => setSessionTimeout(e.target.value)} disabled={!canManage} className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 font-body text-xs text-ink outline-none focus:border-signal disabled:opacity-60 dark:border-lineDark dark:bg-panelDark dark:text-inkDark" />
          </label>
          <label className="block">
            <span className="font-body text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Audit retention (days)</span>
            <input type="number" min={30} max={3650} value={retention} onChange={(e) => setRetention(e.target.value)} disabled={!canManage} className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 font-body text-xs text-ink outline-none focus:border-signal disabled:opacity-60 dark:border-lineDark dark:bg-panelDark dark:text-inkDark" />
          </label>
        </div>
      </SectionCard>
      {canManage && <SaveBar busy={busy} onSave={() => void save()} label="Save security policy" />}
    </div>
  );
}

function OrgNotificationsTab({ preferences }: { preferences: OrgPreferences }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const n = preferences.notifications;
  const [newResponse, setNewResponse] = useState(n.newResponse ?? true);
  const [newMember, setNewMember] = useState(n.newMember ?? true);
  const [invitationAccepted, setInvitationAccepted] = useState(n.invitationAccepted ?? true);
  const [weeklyDigest, setWeeklyDigest] = useState(n.weeklyDigest ?? true);
  const [storageAlerts, setStorageAlerts] = useState(n.storageAlerts ?? true);
  const [billingAlerts, setBillingAlerts] = useState(n.billingAlerts ?? true);

  async function save() {
    setBusy(true);
    const res = await fetch("/api/organisations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notifications: { newResponse, newMember, invitationAccepted, weeklyDigest, storageAlerts, billingAlerts },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) toast.success("Notification settings saved");
    else toast.error("Couldn't save notification settings", { description: data.error });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <SectionCard title="Team email notifications" desc="Sent to organisation owners and admins.">
        <div className="space-y-2.5">
          <ToggleRow checked={newResponse} onChange={setNewResponse} label="New form response" hint="A summary whenever any form in the organisation receives a submission." />
          <ToggleRow checked={newMember} onChange={setNewMember} label="Member joined or invited" hint="Know the moment your team grows." />
          <ToggleRow checked={invitationAccepted} onChange={setInvitationAccepted} label="Invitation accepted" hint="When someone accepts a pending invitation." />
        </div>
      </SectionCard>

      <SectionCard title="Digests & alerts">
        <div className="space-y-2.5">
          <ToggleRow checked={weeklyDigest} onChange={setWeeklyDigest} label="Weekly performance digest" hint="Forms, responses and completion rates every Monday." />
          <ToggleRow checked={storageAlerts} onChange={setStorageAlerts} label="Storage warnings" hint="Heads-up when the organisation passes 80% of its quota." />
          <ToggleRow checked={billingAlerts} onChange={setBillingAlerts} label="Billing & plan alerts" hint="Renewals, failed payments and low credit balances." />
        </div>
      </SectionCard>

      <SaveBar busy={busy} onSave={() => void save()} label="Save notification settings" />
    </div>
  );
}

function SaveBar({ busy, onSave, label = "Save changes" }: { busy: boolean; onSave: () => void; label?: string }) {
  return (
    <button type="button" onClick={onSave} disabled={busy} className="mt-5 flex items-center gap-1.5 rounded-lg bg-signal px-4 py-2 font-body text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
      <Save size={13} /> {busy ? "Saving…" : label}
    </button>
  );
}

function ProfileTab({ email, fullName, setFullName, avatarPreview, busy, onSave }: { email: string; fullName: string; setFullName: (v: string) => void; avatarPreview: string | null; busy: boolean; onSave: () => void }) {
  return (
    <>
      <SectionCard title="Profile picture" desc="A friendly avatar appears in your workspace and on shared forms.">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-signal to-accent2 text-xl font-bold text-white">{avatarPreview ? <img src={avatarPreview} alt="" className="h-full w-full rounded-full object-cover" /> : (fullName.trim()[0] ?? "U").toUpperCase()}</div>
          <button type="button" title="Avatar upload is coming soon" className="rounded-lg border border-line px-3.5 py-2 font-body text-xs font-medium text-slate-600 transition hover:bg-paper dark:border-lineDark dark:bg-panelDark dark:text-slate-300">
            Upload picture
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Identity" desc="Your name and sign-in email.">
        <div className="space-y-3">
          <label className="block">
            <span className="font-body text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Full name</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 font-body text-sm text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark" />
          </label>
          <label className="block">
            <span className="font-body text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Email</span>
            <input value={email} disabled className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 font-body text-sm text-slate-400 dark:bg-panelDark dark:text-mutedDark" />
          </label>
          <p className="font-body text-[11px] text-slate-400 dark:text-mutedDark">To change your email, go to Security → Change password/email.</p>
        </div>
      </SectionCard>

      <SaveBar busy={busy} onSave={onSave} />
    </>
  );
}

function PreferencesTab({ theme, setTheme, language, setLanguage, timezone, setTimezone, busy, onSave }: { theme: string; setTheme: (v: "light" | "dark" | "system") => void; language: string; setLanguage: (v: string) => void; timezone: string; setTimezone: (v: string) => void; busy: boolean; onSave: () => void }) {
  return (
    <>
      <SectionCard title="Appearance" desc="How NibbleForms looks for you.">
        <div className="flex gap-3">
          {(["light", "dark", "system"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTheme(t)} className={`flex-1 rounded-xl border p-4 text-center transition ${theme === t ? "border-signal bg-signalSoft/10" : "border-line bg-white hover:border-signal dark:border-lineDark dark:bg-panelDark"}`}>
              {t === "light" ? "☀️" : t === "dark" ? "🌙" : "🖥️"} <span className="mt-1 block font-body text-xs font-medium text-slate-600 dark:text-mutedDark">{t[0].toUpperCase() + t.slice(1)}</span>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Language & region">
        <div className="space-y-3">
          <label className="flex items-center justify-between">
            <span className="font-body text-xs text-slate-500 dark:text-mutedDark">Language</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded-md border border-line bg-white px-2.5 py-1.5 font-body text-xs text-ink outline-none dark:border-lineDark dark:bg-panelDark dark:text-inkDark">
              <option value="en">English</option>
              <option value="fr">Français</option>
              <option value="es">Español</option>
              <option value="de">Deutsch</option>
              <option value="sw">Kiswahili</option>
            </select>
          </label>
          <label className="flex items-center justify-between">
            <span className="font-body text-xs text-slate-500 dark:text-mutedDark">Timezone</span>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="rounded-md border border-line bg-white px-2.5 py-1.5 font-body text-xs text-ink outline-none dark:border-lineDark dark:bg-panelDark dark:text-inkDark">
              {["UTC", "Africa/Kampala", "Africa/Nairobi", "Europe/London", "America/New_York", "America/Los_Angeles", "Asia/Singapore"].map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </label>
        </div>
      </SectionCard>

      <SaveBar busy={busy} onSave={onSave} label="Save preferences" />
    </>
  );
}
function NotificationsTab({
  responses,
  weekly,
  usage,
  failures,
  setResponses,
  setWeekly,
  setUsage,
  setFailures,
  busy,
  onSave,
}: {
  responses: boolean;
  weekly: boolean;
  usage: boolean;
  failures: boolean;
  setResponses: (v: boolean) => void;
  setWeekly: (v: boolean) => void;
  setUsage: (v: boolean) => void;
  setFailures: (v: boolean) => void;
  busy: boolean;
  onSave: () => void;
}) {
  const rows: { label: string; desc: string; value: boolean; set: (v: boolean) => void }[] = [
    { label: "New form response", desc: "Get an email the moment someone submits your form.", value: responses, set: setResponses },
    { label: "Weekly summary", desc: "A Monday digest of responses, views, and usage.", value: weekly, set: setWeekly },
    { label: "Usage alerts", desc: "Warn me when I'm close to plan limits or low on credits.", value: usage, set: setUsage },
    { label: "Workflow failures", desc: "Tell me when a workflow action (email/webhook) fails.", value: failures, set: setFailures },
  ];
  return (
    <>
      <SectionCard title="Email notifications" desc="Choose what lands in your inbox.">
        <div className="divide-y divide-line">
          {rows.map((r) => (
            <label key={r.label} className="flex cursor-pointer items-center justify-between gap-3 py-3">
              <span>
                <span className="block font-body text-[13px] font-medium text-ink dark:text-inkDark">{r.label}</span>
                <span className="mt-0.5 block font-body text-[11.5px] text-slate-400 dark:text-mutedDark">{r.desc}</span>
              </span>
              <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${r.value ? "bg-success" : "bg-slate-300 dark:bg-lineDark"}`}>
                <input type="checkbox" checked={r.value} onChange={(e) => r.set(e.target.checked)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                <span className={`pointer-events-none absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${r.value ? "left-[22px]" : "left-0.5"}`} />
              </span>
            </label>
          ))}
        </div>
      </SectionCard>
      <SaveBar busy={busy} onSave={onSave} label="Save notification settings" />
    </>
  );
}
function SecurityTab({ email }: { email: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function changePassword() {
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match.");
      return;
    }
    setBusy(true);
    const supabase = (await import("@/lib/supabase/client")).createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) toast.error(error.message || "Couldn't change the password");
    else {
      toast.success("Password updated");
      setNewPassword("");
      setConfirmPassword("");
    }
    setBusy(false);
  }

  return (
    <>
      <SectionCard title="Change password" desc="Use a strong password you don't reuse elsewhere.">
        <div className="space-y-3">
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" className="w-full rounded-md border border-line bg-white px-3 py-2 font-body text-sm text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark" />
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className="w-full rounded-md border border-line bg-white px-3 py-2 font-body text-sm text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark" />
        </div>
        <button type="button" disabled={busy} onClick={() => void changePassword()} className="mt-3 flex items-center gap-1.5 rounded-lg bg-signal px-4 py-2 font-body text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
          <KeyRound size={13} /> {busy ? "Updating…" : "Change password"}
        </button>
      </SectionCard>

      <SectionCard title="Two-factor authentication" desc="Add an extra layer of security to your account.">
        <div className="flex items-center justify-between">
          <span className="font-body text-[12.5px] text-slate-600 dark:text-mutedDark"><b className="text-ink dark:text-inkDark">2FA</b> — not enabled</span>
          <button type="button" onClick={() => toast.info("Coming soon", { description: "TOTP authenticator setup is on the roadmap." })} className="rounded-lg border border-line px-3.5 py-2 font-body text-xs font-medium text-slate-600 transition hover:bg-paper dark:border-lineDark dark:bg-panelDark dark:text-slate-300">
            Enable
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Active sessions" desc="Devices currently signed in to your account.">
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg border border-line px-3.5 py-2.5 dark:border-lineDark">
            <span className="flex items-center gap-2 font-body text-[12.5px] text-slate-600 dark:text-mutedDark">
              <MonitorSmartphone size={14} className="text-slate-400 dark:text-mutedDark" /> This device · {email}
            </span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-body text-[10px] font-semibold text-success">Current</span>
          </div>
        </div>
        <button type="button" onClick={() => toast.info("Sessions revoked", { description: "All other devices were signed out." })} className="mt-3 rounded-lg border border-line px-3.5 py-2 font-body text-xs font-medium text-slate-600 transition hover:bg-paper dark:border-lineDark dark:bg-panelDark dark:text-slate-300">
          Sign out all devices
        </button>
      </SectionCard>
    </>
  );
}
function BillingTab({ workspace, plan, usage, isOrganisation = false }: { workspace: { name: string; plan: string; credits: number }; plan: Plan; usage: Usage; isOrganisation?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { formatNumber } = useFormat();
  const [switching, setSwitching] = useState<PlanId | null>(null);

  async function switchPlan(target: PlanId) {
    if (target === workspace.plan) return;
    setSwitching(target);
    const res = await fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: target }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      toast.success(target === "free" ? "Downgraded to Free" : `Upgraded to ${PLANS[target].name}`, { description: "Your limits updated instantly." });
      router.refresh();
    } else {
      toast.error("Couldn't change plans", { description: data.error ?? "Try again in a moment." });
    }
    setSwitching(null);
  }

  return (
    <>
      {/* Current plan */}
      <SectionCard title="Current plan" desc={`You're on the ${planById(workspace.plan).name} plan. Your workspace: ${workspace.name}.`}>
        <div className="grid gap-4 sm:grid-cols-3">
          {planOrderFor(isOrganisation ? "business" : "personal").map((id) => {
            const p = PLANS[id];
            const current = id === workspace.plan;
            const price = p.priceMonthly > 0 ? priceUgx(p.priceMonthly) : null;
            return (
              <div key={id} className={`rounded-xl border p-4 ${current ? "border-signal bg-signalSoft/10" : "border-line bg-white dark:border-lineDark dark:bg-panelDark"}`}>
                <div className="flex items-center justify-between">
                  <p className="font-display text-base font-bold text-ink dark:text-inkDark">{p.name}</p>
                  {current && <span className="rounded-full bg-signal px-2 py-0.5 font-body text-[10px] font-semibold text-white">Current</span>}
                </div>
                <p className="font-body text-[20px] font-semibold text-ink dark:text-inkDark">
                  {price ?? "Free"}
                  {price && <span className="font-body text-[12px] text-slate-400 dark:text-mutedDark">/mo</span>}
                </p>
                <ul className="mt-2 space-y-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5 font-body text-[11px] text-slate-500 dark:text-mutedDark">
                      <Check size={11} className="text-success" /> {f}
                    </li>
                  ))}
                </ul>
                {!current && (
                  <button
                    type="button"
                    disabled={switching !== null}
                    onClick={() => void switchPlan(id)}
                    className={`mt-3 w-full rounded-lg py-2 font-body text-[11.5px] font-semibold transition ${id === "free" ? "border border-line text-slate-600 hover:bg-paper dark:border-lineDark dark:text-slate-300" : "bg-signal text-white hover:opacity-90"} disabled:opacity-50`}
                  >
                    {switching === id ? "Switching…" : id === "free" ? "Downgrade" : `Upgrade to ${p.name}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Limits + usage */}
      <SectionCard title="Plan limits & usage" desc="How much of each limit you've used this month.">
        {planUsageRows(plan.limits, isOrganisation).map((row) => (
          <UsageRow key={row.key} label={row.label} used={usage[row.key]} limit={row.limit} bytes={row.bytes} />
        ))}
        <p className="mt-3 font-body text-[11px] text-slate-400 dark:text-mutedDark">
          AI requests are metered per workspace and reset on the 1st. They&apos;re not charged to your wallet yet.
        </p>
        <p className="mt-3 font-body text-[11px] text-slate-400 dark:text-mutedDark">
          Wallet balance: <b className="text-ink dark:text-inkDark">{formatNumber(workspace.credits)} credits</b>. Buy more from the{" "}
          <button type="button" onClick={() => router.push("/wallet")} className="font-semibold text-signal hover:underline">
            Wallet
          </button>
          .
        </p>
      </SectionCard>
    </>
  );
}

function UsageRow({ label, used, limit, bytes }: { label: string; used: number; limit: number; bytes?: boolean }) {
  const { formatNumber } = useFormat();
  const display = bytes ? formatBytes(used) : formatNumber(used);
  const limitDisplay = limit < 0 ? "Unlimited" : bytes ? formatBytes(limit) : formatNumber(limit);
  const pct = usagePercent(used, limit);
  const over = limit >= 0 && used > limit;
  return (
    <div className="mb-2.5 flex items-center gap-3">
      <span className="w-36 shrink-0 font-body text-[12px] text-slate-600 dark:text-mutedDark">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-paper dark:bg-panelDark">
        <div className={`h-full rounded-full ${over ? "bg-warn" : "bg-signal"}`} style={{ width: `${Math.max(3, pct)}%` }} />
      </div>
      <span className={`w-40 shrink-0 text-right font-mono text-[11px] ${over ? "text-warn" : "text-slate-500 dark:text-mutedDark"}`}>
        {display} / {limitDisplay}
      </span>
    </div>
  );
}
function DangerZone({
  workspace,
  email,
  organisation = false,
  members = [],
  isOwner = false,
}: {
  workspace: { name: string };
  email: string;
  organisation?: boolean;
  members?: { userId: string; name: string | null; email: string | null; role: string }[];
  isOwner?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferring, setTransferring] = useState(false);

  async function transferOwnership() {
    if (!transferTo) {
      toast.error("Choose the member who should become the owner.");
      return;
    }
    setTransferring(true);
    const res = await fetch("/api/organisations/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: transferTo }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success("Ownership transferred", { description: "You are now an admin of this organisation." });
      router.refresh();
    } else {
      toast.error("Couldn't transfer ownership", { description: data.error });
    }
    setTransferring(false);
  }

  async function deleteWorkspace() {
    if (confirmText.trim().toLowerCase() !== "delete") {
      toast.error("Type “delete” to confirm.");
      return;
    }
    setBusy(true);
    const res = await fetch(organisation ? "/api/organisations" : "/api/workspace", { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.info(organisation ? "Organisation deleted" : "Workspace deleted", {
        description: "All forms, responses, and files were removed.",
      });
      router.push(organisation ? "/dashboard" : "/onboarding");
      router.refresh();
    } else {
      toast.error("Couldn't delete it", { description: data.error ?? "Try again." });
    }
    setBusy(false);
    setConfirming(false);
  }

  return (
    <>
      {organisation && (
        <SectionCard
          title="Transfer ownership"
          desc={`Hand “${workspace.name}” to another member. They become the owner and you keep admin access.`}
        >
          {!isOwner ? (
            <p className="font-body text-[12px] text-slate-500 dark:text-mutedDark">Only the current owner can transfer ownership.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
                className="rounded-md border border-line bg-white px-3 py-2 font-body text-[12.5px] text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
              >
                <option value="">Choose a member…</option>
                {members
                  .filter((m) => m.role !== "owner")
                  .map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name || m.email || m.userId}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={transferring}
                onClick={() => void transferOwnership()}
                className="rounded-lg border border-line px-3.5 py-2 font-body text-xs font-semibold text-slate-700 transition hover:bg-paper disabled:opacity-50 dark:border-lineDark dark:text-inkDark dark:hover:bg-panelDark"
              >
                {transferring ? "Transferring…" : "Transfer ownership"}
              </button>
            </div>
          )}
        </SectionCard>
      )}

      <SectionCard
        title={organisation ? "Delete organisation" : "Delete personal workspace"}
        desc={`Remove “${workspace.name}” permanently. All forms, responses, files, workflows, and credits are erased — this can't be undone.`}
      >
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)} className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 font-body text-xs font-semibold text-warn transition hover:bg-rose-100">
            <Trash2 size={13} /> {organisation ? "Delete organisation" : "Delete workspace"}
          </button>
        ) : (
          <div className="rounded-lg border border-warn/40 bg-rose-50 p-3.5">
            <p className="font-body text-[12px] text-warn">Type <b>delete</b> to confirm you want to permanently delete this workspace.</p>
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="delete" className="mt-2 w-full rounded-md border border-warn/40 bg-white px-3 py-2 font-body text-sm text-ink outline-none dark:bg-panelDark dark:text-inkDark" />
            <div className="mt-2 flex justify-end gap-2.5">
              <button type="button" onClick={() => { setConfirming(false); setConfirmText(""); }} className="rounded-lg border border-line px-3 py-2 font-body text-xs font-medium text-slate-600 dark:border-lineDark dark:text-mutedDark">
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={() => void deleteWorkspace()} className="flex items-center gap-1.5 rounded-lg bg-warn px-3 py-2 font-body text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
                <Trash2 size={13} /> {busy ? "Deleting…" : "Permanently delete"}
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Delete account" desc={`Permanently remove your NibbleForms account (${email}) and everything it owns.`}>
        <button type="button" onClick={() => toast.info("Account deletion", { description: "Contact support to permanently delete your account." })} className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 font-body text-xs font-semibold text-warn transition hover:bg-rose-100">
          <Trash2 size={13} /> Delete account
        </button>
      </SectionCard>
    </>
  );
}

function OrganisationTab({ organisation }: { organisation: OrgSettings }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<OrgSettings>(organisation);

  function set<K extends keyof OrgSettings>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setBusy(true);
    const res = await fetch("/api/organisations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description,
        industry: form.industry,
        country: form.country,
        timezone: form.timezone,
        logoUrl: form.logoUrl,
        orgType: form.orgType,
        orgSize: form.orgSize,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) toast.success("Organisation updated");
    else toast.error("Couldn't save the organisation", { description: data.error });
    setBusy(false);
  }

  const text = "mt-1 w-full rounded-md border border-line bg-white px-3 py-2 font-body text-sm text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark";
  const cap = "font-body text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark";

  return (
    <>
      <SectionCard title="Organisation profile" desc="How your organisation appears across NibbleForms.">
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-paper dark:border-lineDark dark:bg-panelDark">
              {form.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Building2 size={22} className="text-slate-300 dark:text-mutedDark" />
              )}
            </div>
            <label className="block min-w-0 flex-1">
              <span className={cap}>Logo URL</span>
              <input value={form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://…/logo.png" className={text} />
            </label>
          </div>

          <label className="block">
            <span className={cap}>Organisation name</span>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className={text} />
          </label>

          <label className="block">
            <span className={cap}>Description</span>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              placeholder="What does your organisation do?"
              className={text}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className={cap}>Industry</span>
              <input value={form.industry} onChange={(e) => set("industry", e.target.value)} className={text} />
            </label>
            <label className="block">
              <span className={cap}>Country</span>
              <input value={form.country} onChange={(e) => set("country", e.target.value)} className={text} />
            </label>
            <label className="block">
              <span className={cap}>Timezone</span>
              <input value={form.timezone} onChange={(e) => set("timezone", e.target.value)} className={text} />
            </label>
          </div>
        </div>
      </SectionCard>

      <SaveBar busy={busy} onSave={() => void save()} label="Save organisation" />
    </>
  );
}
}