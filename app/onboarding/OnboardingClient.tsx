"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Briefcase,
  CalendarCheck,
  CheckSquare,
  ClipboardList,
  HeartHandshake,
  LayoutTemplate,
  MessageSquare,
  Plus,
  Sparkles,
  StickyNote,
} from "lucide-react";
import { useToast } from "@/components/Toast";

const PURPOSES: { id: string; label: string; icon: typeof Plus; hint: string }[] = [
  { id: "surveys", label: "Surveys", icon: BarChart3, hint: "Measure opinions and satisfaction" },
  { id: "feedback", label: "Customer feedback", icon: MessageSquare, hint: "Understand what people think" },
  { id: "events", label: "Event registration", icon: CalendarCheck, hint: "Sign-ups and RSVPs" },
  { id: "contact", label: "Contact forms", icon: StickyNote, hint: "Let people reach you" },
  { id: "applications", label: "Applications", icon: Briefcase, hint: "Collect applications cleanly" },
  { id: "quizzes", label: "Quizzes", icon: CheckSquare, hint: "Engage with fun questions" },
  { id: "data", label: "Data collection", icon: ClipboardList, hint: "Gather any kind of data" },
  { id: "other", label: "Other", icon: HeartHandshake, hint: "Something else entirely" },
];

export function OnboardingClient({
  email,
  suggestedName,
  workspaceName,
  isNew,
  initialOpen,
}: {
  email?: string | null;
  suggestedName: string;
  workspaceName: string;
  isNew: boolean;
  initialOpen?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(isNew ? 1 : 3);
  const [purpose, setPurpose] = useState<string | null>(initialOpen === "templates" ? "templates" : null);
  const [name, setName] = useState(workspaceName);

  async function saveName(): Promise<string> {
    const final = name.trim() || suggestedName;
    await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: final }),
    }).catch(() => {});
    return final;
  }

  async function finish() {
    await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completeOnboarding: true }),
    }).catch(() => {});
    router.push("/dashboard?onboarded=1");
    router.refresh();
  }

  async function createBlank() {
    const res = await fetch("/api/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled form" }),
    });
    const data = await res.json();
    if (data.id) {
      await finish();
      router.push(`/builder/${data.id}`);
    } else {
      toast.error("Couldn't create the form, try again.");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper dark:bg-night">
      <div className="flex items-center justify-between border-b border-line px-7 py-4 dark:border-lineDark">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-signal to-accent2 text-white">
            <Sparkles size={14} />
          </div>
          <span className="font-display text-[15px] font-bold text-ink dark:text-inkDark">
            Nibble<span className="text-signal">Forms</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => void finish()}
          className="rounded-full px-4 py-1.5 font-body text-[12px] font-medium text-slate-500 transition hover:bg-paper dark:text-mutedDark dark:hover:bg-panelDark"
        >
          Skip for now →
        </button>
      </div>

      <div className="mx-auto mt-3 flex items-center gap-1.5">
        {[1, 2, 3].map((s) => (
          <span key={s} className={`h-1.5 w-6 rounded-full transition ${s <= step ? "bg-signal" : "bg-line dark:bg-lineDark"}`} />
        ))}
      </div>

      {step === 1 && (
        <StepOne
          email={email}
          onPick={(id) => {
            setPurpose(id);
            setStep(2);
          }}
        />
      )}
      {step === 2 && (
        <StepTwo
          name={name}
          suggestedName={suggestedName}
          onChange={setName}
          onUseSuggested={async () => {
            setName(suggestedName);
            await saveName();
            setStep(3);
          }}
          onContinue={async () => {
            await saveName();
            setStep(3);
          }}
        />
      )}
      {step === 3 && (
        <StepThree
          purpose={purpose}
          onBlank={() => void createBlank()}
          onTemplate={() => {
            void finish();
            router.push("/dashboard?open=templates");
          }}
          onExplore={() => void finish()}
        />
      )}
    </div>
  );
function StepOne({ email, onPick }: { email?: string | null; onPick: (id: string) => void }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <p className="font-body text-[12px] text-slate-400 dark:text-mutedDark">Welcome, {email ?? "friend"} 👋</p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink dark:text-inkDark">What will you use NibbleForms for?</h1>
      <p className="mt-1.5 font-body text-sm text-slate-500 dark:text-mutedDark">
        Pick what fits best — you can build any kind of form either way. It helps us tailor a few starting templates.
      </p>
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-4">
        {PURPOSES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p.id)}
            className="group flex flex-col items-start gap-2 rounded-xl border border-line bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-signal hover:shadow-md dark:border-lineDark dark:bg-panelDark dark:hover:border-signal"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-signalSoft/20 text-signal">
              <p.icon size={16} />
            </span>
            <span className="font-body text-[12.5px] font-semibold text-ink dark:text-inkDark">{p.label}</span>
            <span className="font-body text-[10.5px] leading-snug text-slate-400 dark:text-mutedDark">{p.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepTwo({
  name,
  suggestedName,
  onChange,
  onUseSuggested,
  onContinue,
}: {
  name: string;
  suggestedName: string;
  onChange: (v: string) => void;
  onUseSuggested: () => Promise<void>;
  onContinue: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <p className="font-body text-[12px] text-slate-400 dark:text-mutedDark">Step 2 of 3</p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink dark:text-inkDark">Name your workspace</h1>
      <p className="mt-1.5 font-body text-sm text-slate-500 dark:text-mutedDark">
        We created a personal workspace for you. Everything you build — forms, responses, files, credits — lives inside it.{" "}
        <span className="font-semibold text-signal">{suggestedName}</span> is ready to go — keep it or rename it.
      </p>
      <label className="mt-6 block font-body text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-mutedDark">Workspace name</label>
      <input
        value={name}
        onChange={(e) => onChange(e.target.value)}
        autoFocus
        className="mt-2 w-full rounded-lg border border-line bg-white px-3.5 py-2.5 font-body text-sm text-ink outline-none transition focus:border-signal focus:ring-1 focus:ring-signal dark:border-lineDark dark:bg-panelDark dark:text-inkDark"
        placeholder={suggestedName}
      />
      <p className="mt-1.5 font-body text-[11.5px] text-slate-400 dark:text-mutedDark">You can rename it anytime from Settings.</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onContinue();
          }}
          className="rounded-lg bg-signal px-5 py-2.5 font-body text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          Continue with this name
        </button>
        <button
          type="button"
          onClick={() => void onUseSuggested()}
          className="rounded-lg border border-line px-4 py-2 font-body text-[12.5px] font-medium text-slate-500 transition hover:bg-paper dark:border-lineDark dark:text-mutedDark dark:hover:bg-panelDark"
        >
          Use suggested name
        </button>
      </div>
    </div>
  );
}
function StepThree({
  purpose,
  onBlank,
  onTemplate,
  onExplore,
}: {
  purpose: string | null;
  onBlank: () => void;
  onTemplate: () => void;
  onExplore: () => void;
}) {
  const Cards = [
    { icon: Plus, title: "Create a blank form", desc: "Start from scratch and craft the exact form you have in mind.", cta: onBlank },
    { icon: LayoutTemplate, title: "Use a template", desc: "Kick off with a proven layout and tweak it to fit.", cta: onTemplate },
    { icon: BarChart3, title: "Explore the dashboard", desc: "Look around first — your workspace is ready when you are.", cta: onExplore },
  ] as const;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      {purpose && purpose !== "templates" && (
        <p className="mb-6 inline-block rounded-full bg-signalSoft/20 px-3 py-1 font-body text-[11.5px] font-medium text-signal">
          {PURPOSES.find((p) => p.id === purpose)?.label ?? purpose} — great pick, let&apos;s get you building.
        </p>
      )}
      <h1 className="font-display text-2xl font-semibold text-ink dark:text-inkDark">What would you like to do first?</h1>
      <p className="mt-1.5 font-body text-sm text-slate-500 dark:text-mutedDark">All three options are one click away — you can always change your mind.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {Cards.map((c) => (
          <button
            key={c.title}
            type="button"
            onClick={c.cta}
            className="group flex flex-col items-start gap-2.5 rounded-xl border border-line bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-signal hover:shadow-md dark:border-lineDark dark:bg-panelDark dark:hover:border-signal"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-signal to-accent2 text-white">
              <c.icon size={18} />
            </span>
            <span className="font-body text-[14px] font-semibold text-ink dark:text-inkDark">{c.title}</span>
            <span className="font-body text-[11.5px] leading-snug text-slate-400 dark:text-mutedDark">{c.desc}</span>
            <span className="mt-auto flex items-center gap-1 font-body text-[11.5px] font-semibold text-signal">
              Get started <ArrowRight size={12} />
            </span>
          </button>
        ))}
      </div>
      <p className="mt-8 text-center font-body text-[11.5px] text-slate-400 dark:text-mutedDark">
        Prefer to look around?{" "}
        <button type="button" onClick={onExplore} className="font-semibold text-signal hover:underline">
          Explore the dashboard
        </button>
      </p>
    </div>
  );
}
}