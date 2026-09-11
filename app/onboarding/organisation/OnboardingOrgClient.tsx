"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ClipboardList, LayoutTemplate, Sparkles, UserPlus, X } from "lucide-react";
import { useToast } from "@/components/Toast";

const ORG_TYPES = ["Company", "Startup", "NGO", "School / University", "Government Institution", "Community", "Other"];
const ORG_SIZES = ["Just me", "2–10 employees", "11–50 employees", "51–200 employees", "200+ employees"];
const INDUSTRIES = ["Construction", "Education", "Healthcare", "Technology", "Finance", "Retail", "Non-profit", "Government", "Hospitality", "Other"];
const COUNTRIES = ["Uganda", "Kenya", "Tanzania", "Rwanda", "Nigeria", "South Africa", "United Kingdom", "United States", "India", "Other"];

interface InviteDraft {
  id: number;
  email: string;
  role: "admin" | "editor" | "viewer";
}

export function OnboardingOrgClient({ fullName }: { email: string; fullName: string }) {
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [orgType, setOrgType] = useState("Company");
  const [orgSize, setOrgSize] = useState("2–10 employees");
  const [country, setCountry] = useState("Uganda");
  const [industry, setIndustry] = useState("Technology");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [invites, setInvites] = useState<InviteDraft[]>([{ id: 1, email: "", role: "editor" }]);

  async function createOrganisation() {
    if (!name.trim()) {
      toast.error("Enter your organisation name");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/organisations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), orgType, orgSize, country, industry }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.workspaceId) {
      setWorkspaceId(data.workspaceId);
      setWorkspaceName(name.trim());
      setStep(2);
    } else {
      toast.error("Couldn't create the organisation", { description: data.error });
    }
    setBusy(false);
  }

  async function saveWorkspace() {
    if (!workspaceId) return;
    setBusy(true);
    const res = await fetch("/api/organisations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: workspaceName.trim() || name.trim(), logoUrl: logoUrl.trim() || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error("Couldn't save the workspace", { description: data.error });
      return;
    }
    setStep(3);
  }

  async function sendInvites() {
    const valid = invites.filter((i) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email.trim()));
    if (valid.length === 0) {
      setStep(4);
      return;
    }
    setBusy(true);
    for (const invite of valid) {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: invite.email.trim(), role: invite.role }),
      });
      if (res.ok) {
        toast.success(`Invitation ready for ${invite.email.trim()}`, { description: "Share the link from Members." });
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(`Couldn't invite ${invite.email.trim()}`, { description: data.error });
      }
    }
    setBusy(false);
    setStep(4);
  }

  function finish(path: string) {
    router.push(path);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex items-center justify-between border-b border-line px-7 py-4 dark:border-lineDark">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-signal to-accent2 text-white">
            <Sparkles size={14} />
          </div>
          <span className="font-display text-[15px] font-bold text-ink dark:text-inkDark">
            Nibble<span className="text-signal">Forms</span> for Business
          </span>
        </div>
        <button
          type="button"
          onClick={() => finish("/dashboard")}
          className="rounded-full px-4 py-1.5 font-body text-[12px] font-medium text-slate-500 transition hover:bg-paper dark:text-mutedDark dark:hover:bg-panelDark"
        >
          Skip for now →
        </button>
      </div>

      <div className="mx-auto mt-3 flex items-center gap-1.5">
        {[1, 2, 3, 4].map((s) => (
          <span key={s} className={`h-1.5 w-6 rounded-full transition ${s <= step ? "bg-signal" : "bg-line dark:bg-lineDark"}`} />
        ))}
      </div>

      {step === 1 && (
        <StepDetails
          name={name}
          setName={setName}
          orgType={orgType}
          setOrgType={setOrgType}
          orgSize={orgSize}
          setOrgSize={setOrgSize}
          country={country}
          setCountry={setCountry}
          industry={industry}
          setIndustry={setIndustry}
          busy={busy}
          onContinue={() => void createOrganisation()}
        />
      )}
      {step === 2 && (
        <StepWorkspace name={workspaceName} setName={setWorkspaceName} logoUrl={logoUrl} setLogoUrl={setLogoUrl} busy={busy} onContinue={() => void saveWorkspace()} onSkip={() => setStep(3)} />
      )}
      {step === 3 && <StepInvite invites={invites} setInvites={setInvites} busy={busy} onContinue={() => void sendInvites()} onSkip={() => setStep(4)} />}
      {step === 4 && (
        <StepDone
          orgName={name || "your organisation"}
          fullName={fullName}
          onCreateForm={() => finish("/forms")}
          onTemplates={() => finish("/dashboard?open=templates")}
          onInvite={() => finish("/members")}
          onExplore={() => finish("/dashboard")}
        />
      )}
    </div>
  );
}

function StepDetails({
  name,
  setName,
  orgType,
  setOrgType,
  orgSize,
  setOrgSize,
  country,
  setCountry,
  industry,
  setIndustry,
  busy,
  onContinue,
}: {
  name: string;
  setName: (v: string) => void;
  orgType: string;
  setOrgType: (v: string) => void;
  orgSize: string;
  setOrgSize: (v: string) => void;
  country: string;
  setCountry: (v: string) => void;
  industry: string;
  setIndustry: (v: string) => void;
  busy: boolean;
  onContinue: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <p className="font-body text-[12px] text-slate-400 dark:text-mutedDark">Step 1 of 4</p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink dark:text-inkDark">Tell us about your organisation</h1>
      <p className="mt-1.5 font-body text-sm text-slate-500 dark:text-mutedDark">
        This shapes your workspace, defaults and reporting. You can change everything later in Settings.
      </p>

      <div className="mt-6 space-y-4">
        <Field label="Organisation name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="ABC Construction Ltd"
            className={inputClass}
          />
        </Field>

        <Field label="Organisation type">
          <div className="flex flex-wrap gap-2">
            {ORG_TYPES.map((t) => (
              <Chip key={t} active={orgType === t} onClick={() => setOrgType(t)}>
                {t}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="Organisation size">
          <select value={orgSize} onChange={(e) => setOrgSize(e.target.value)} className={inputClass}>
            {ORG_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Country">
            <select value={country} onChange={(e) => setCountry(e.target.value)} className={inputClass}>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Industry">
            <select value={industry} onChange={(e) => setIndustry(e.target.value)} className={inputClass}>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={busy}
        className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-lg bg-signal px-4 py-2.5 font-body text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Creating…" : "Continue"} <ArrowRight size={14} />
      </button>
    </div>
  );
}

function StepWorkspace({
  name,
  setName,
  logoUrl,
  setLogoUrl,
  busy,
  onContinue,
  onSkip,
}: {
  name: string;
  setName: (v: string) => void;
  logoUrl: string;
  setLogoUrl: (v: string) => void;
  busy: boolean;
  onContinue: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <p className="font-body text-[12px] text-slate-400 dark:text-mutedDark">Step 2 of 4</p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink dark:text-inkDark">Your organisation workspace</h1>
      <p className="mt-1.5 font-body text-sm text-slate-500 dark:text-mutedDark">
        We created your organisation workspace. Give it the name and logo your team will recognise.
      </p>

      <div className="mt-6 space-y-4">
        <Field label="Workspace name">
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus className={inputClass} />
        </Field>
        <Field label="Logo URL (optional)">
          <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" className={inputClass} />
        </Field>
        <p className="font-body text-[11px] text-slate-400 dark:text-mutedDark">
          File upload for logos arrives with the storage phase — paste a URL for now.
        </p>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onContinue}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-signal px-5 py-2.5 font-body text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Continue"} <ArrowRight size={14} />
        </button>
        <button type="button" onClick={onSkip} className="rounded-lg border border-line px-4 py-2 font-body text-[12.5px] font-medium text-slate-500 transition hover:bg-paper dark:border-lineDark dark:text-mutedDark dark:hover:bg-panelDark">
          Skip
        </button>
      </div>
    </div>
  );
}

function StepInvite({
  invites,
  setInvites,
  busy,
  onContinue,
  onSkip,
}: {
  invites: InviteDraft[];
  setInvites: (v: InviteDraft[]) => void;
  busy: boolean;
  onContinue: () => void;
  onSkip: () => void;
}) {
  function update(id: number, patch: Partial<InviteDraft>) {
    setInvites(invites.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <p className="font-body text-[12px] text-slate-400 dark:text-mutedDark">Step 3 of 4</p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink dark:text-inkDark">Invite your team</h1>
      <p className="mt-1.5 font-body text-sm text-slate-500 dark:text-mutedDark">
        Add the people who should work in this organisation. You&apos;ll get a shareable link for each one — and you can invite more later from Members.
      </p>

      <div className="mt-6 space-y-3">
        {invites.map((invite) => (
          <div key={invite.id} className="flex items-center gap-2">
            <input
              type="email"
              value={invite.email}
              onChange={(e) => update(invite.id, { email: e.target.value })}
              placeholder="teammate@company.com"
              className={`${inputClass} flex-1`}
            />
            <select
              value={invite.role}
              onChange={(e) => update(invite.id, { role: e.target.value as InviteDraft["role"] })}
              className="rounded-md border border-line bg-white px-2 py-2 font-body text-[12px] text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
            >
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            {invites.length > 1 && (
              <button
                type="button"
                onClick={() => setInvites(invites.filter((i) => i.id !== invite.id))}
                aria-label="Remove invite"
                className="rounded-md p-2 text-slate-400 transition hover:bg-rose-50 hover:text-warn dark:hover:bg-panelDark"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setInvites([...invites, { id: Date.now(), email: "", role: "editor" }])}
        className="mt-3 flex items-center gap-1.5 font-body text-[12px] font-semibold text-signal hover:underline"
      >
        <UserPlus size={13} /> Add another
      </button>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onContinue}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-signal px-5 py-2.5 font-body text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send invitations"} <ArrowRight size={14} />
        </button>
        <button type="button" onClick={onSkip} className="rounded-lg border border-line px-4 py-2 font-body text-[12.5px] font-medium text-slate-500 transition hover:bg-paper dark:border-lineDark dark:text-mutedDark dark:hover:bg-panelDark">
          Skip
        </button>
      </div>
    </div>
  );
}

function StepDone({
  orgName,
  fullName,
  onCreateForm,
  onTemplates,
  onInvite,
  onExplore,
}: {
  orgName: string;
  fullName: string;
  onCreateForm: () => void;
  onTemplates: () => void;
  onInvite: () => void;
  onExplore: () => void;
}) {
  const cards = [
    { icon: ClipboardList, title: "Create a Form", desc: "Start collecting data with your team.", onClick: onCreateForm },
    { icon: LayoutTemplate, title: "Browse Templates", desc: "Start from a proven layout.", onClick: onTemplates },
    { icon: UserPlus, title: "Invite Team", desc: "Add more people to this organisation.", onClick: onInvite },
    { icon: ArrowRight, title: "Explore Dashboard", desc: "See your organisation overview.", onClick: onExplore },
  ];

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <p className="font-body text-[12px] text-slate-400 dark:text-mutedDark">Step 4 of 4</p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink dark:text-inkDark">
        {orgName} is ready{fullName ? `, ${fullName.split(/\s+/)[0]}` : ""} 🎉
      </h1>
      <p className="mt-1.5 font-body text-sm text-slate-500 dark:text-mutedDark">Your organisation workspace is live. What would you like to do first?</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <button
            key={c.title}
            type="button"
            onClick={c.onClick}
            className="flex flex-col items-start gap-2.5 rounded-xl border border-line bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-signal hover:shadow-md dark:border-lineDark dark:bg-panelDark dark:hover:border-signal"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-signal to-accent2 text-white">
              <c.icon size={18} />
            </span>
            <span className="font-body text-[14px] font-semibold text-ink dark:text-inkDark">{c.title}</span>
            <span className="font-body text-[11.5px] leading-snug text-slate-400 dark:text-mutedDark">{c.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-line bg-white px-3 py-2 font-body text-sm text-ink outline-none focus:border-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-body text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">{label}</span>
      {children}
    </label>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 font-body text-[12px] font-medium transition ${
        active ? "border-signal bg-signalSoft/20 text-signal" : "border-line text-slate-600 hover:border-signal dark:border-lineDark dark:text-mutedDark"
      }`}
    >
      {children}
    </button>
  );
}
