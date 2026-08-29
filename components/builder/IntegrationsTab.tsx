"use client";

import { useState } from "react";
import { nanoid } from "nanoid";
import {
  Webhook as WebhookIcon,
  Plus,
  Trash2,
  Send,
  Eye,
  EyeOff,
  KeyRound,
  ChevronDown,
  ChevronUp,
  Loader2,
  Info,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { FormSettings, WebhookConfig, WebhookDelivery, WebhookEvent } from "@/lib/schema";
import { WEBHOOK_EVENT_LABELS, WEBHOOK_EVENT_SHORT } from "@/lib/schema";

interface Props {
  formId: string;
  settings: FormSettings;
  onChange: (patch: Partial<FormSettings>) => void;
  deliveries: WebhookDelivery[];
}

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; statusCode: number; durationMs: number }
  | { status: "fail"; message: string };

const EMPTY_DRAFT = {
  name: "",
  url: "",
  secret: "",
  events: ["submission"] as WebhookEvent[],
  enabled: true,
};

function isObjectUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function IntegrationsTab({ formId, settings, onChange, deliveries: initialDeliveries }: Props) {
  const webhooks = settings.webhooks ?? [];
  const [editingId, setEditingId] = useState<string | null>(null); // null | "new" | existing id
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
  const [showSecret, setShowSecret] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [testStates, setTestStates] = useState<Record<string, TestState>>({});
  const [localDeliveries, setLocalDeliveries] = useState(initialDeliveries);
  const [showHelp, setShowHelp] = useState(false);

  function persist(next: WebhookConfig[]) {
    onChange({ webhooks: next });
  }

  function startAdd() {
    setEditingId("new");
    setDraft({ ...EMPTY_DRAFT });
    setDraftError(null);
    setShowSecret(false);
  }

  function startEdit(w: WebhookConfig) {
    setEditingId(w.id);
    setDraft({ name: w.name ?? "", url: w.url, secret: w.secret ?? "", events: [...w.events], enabled: w.enabled });
    setDraftError(null);
    setShowSecret(false);
  }

  function saveDraft() {
    const url = draft.url.trim();
    if (!isObjectUrl(url)) {
      setDraftError("Enter a valid http(s) endpoint URL.");
      return;
    }
    if (draft.events.length === 0) {
      setDraftError("Pick at least one trigger event.");
      return;
    }
    const existing = webhooks.find((w) => w.id === editingId);
    const w: WebhookConfig = {
      id: existing?.id ?? nanoid(10),
      name: draft.name.trim() || undefined,
      url,
      events: [...draft.events],
      secret: draft.secret.trim() ? draft.secret.trim() : undefined,
      enabled: existing ? existing.enabled : draft.enabled,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    if (existing) {
      persist(webhooks.map((h) => (h.id === existing.id ? w : h)));
    } else {
      persist([...webhooks, w]);
    }
    setEditingId(null);
    setDraftError(null);
  }

  function removeWebhook(id: string) {
    persist(webhooks.filter((w) => w.id !== id));
    setTestStates((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function testWebhook(w: WebhookConfig) {
    setTestStates((prev) => ({ ...prev, [w.id]: { status: "testing" } }));
    try {
      const res = await fetch(`/api/forms/${formId}/webhooks/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookId: w.id }),
      });
      const data = await res.json().catch(() => ({}));
      const durationMs = typeof data.durationMs === "number" ? data.durationMs : 0;
      if (data.ok) {
        const statusCode = typeof data.statusCode === "number" ? data.statusCode : 200;
        setTestStates((prev) => ({ ...prev, [w.id]: { status: "ok", statusCode, durationMs } }));
        setLocalDeliveries((prev) => [
          {
            id: nanoid(12),
            webhookId: w.id,
            event: "test",
            url: w.url,
            success: true,
            statusCode,
            durationMs,
            error: null,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      } else {
        const message = typeof data.error === "string" ? data.error : `Endpoint returned ${data.statusCode ?? "an error"}`;
        setTestStates((prev) => ({ ...prev, [w.id]: { status: "fail", message } }));
        setLocalDeliveries((prev) => [
          {
            id: nanoid(12),
            webhookId: w.id,
            event: "test",
            url: w.url,
            success: false,
            statusCode: typeof data.statusCode === "number" ? data.statusCode : null,
            durationMs,
            error: message,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
    } catch {
      setTestStates((prev) => ({
        ...prev,
        [w.id]: { status: "fail", message: "Couldn't reach the test endpoint from this device." },
      }));
    }
  }

  function toggleEvent(ev: WebhookEvent) {
    setDraft((d) => {
      const has = d.events.includes(ev);
      return { ...d, events: has ? d.events.filter((e) => e !== ev) : [...d.events, ev] };
    });
  }
return (
    <div className="flex-1 overflow-y-auto bg-paper p-8">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WebhookIcon size={16} className="text-muted" />
            <h2 className="font-display text-[15px] font-semibold text-ink">Integrations</h2>
          </div>
          <button
            type="button"
            onClick={startAdd}
            disabled={editingId !== null}
            className="flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3.5 py-1.5 font-body text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            <Plus size={12} /> Add webhook
          </button>
        </div>

        <HelpSection
          show={showHelp}
          onToggle={() => setShowHelp((v) => !v)}
          hasCloseDate={Boolean(settings.closeOnDate && settings.closeDate)}
        />

        {webhooks.length === 0 && editingId !== "new" && (
          <div className="rounded-xl border border-dashed border-line bg-white p-8 text-center">
            <WebhookIcon className="mx-auto mb-2 text-stone-300" size={22} />
            <p className="font-body text-xs text-muted">
              No webhooks yet. Add one to push submissions to Slack, Zapier, Make, a custom API, or anything that
              accepts a POST request.
            </p>
          </div>
        )}

        {/* Webhook cards */}
        <div className="space-y-3">
          {webhooks.map((w) => (
            <div key={w.id} className="rounded-xl border border-line bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                    w.enabled ? "bg-[var(--accent)] text-white" : "bg-paper text-muted"
                  }`}
                >
                  <WebhookIcon size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-body text-sm font-semibold text-ink">{w.name || w.url}</p>
                  <p className="truncate font-body text-[11px] text-muted">
                    {w.events.map((e) => WEBHOOK_EVENT_SHORT[e]).join(" · ")}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <TestStateView state={testStates[w.id] ?? { status: "idle" }} onTest={() => testWebhook(w)} />
                  <button
                    type="button"
                    onClick={() => startEdit(w)}
                    className="rounded border border-line px-2 py-1 font-body text-[11px] font-semibold text-muted hover:border-muted hover:text-ink"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => removeWebhook(w.id)}
                    className="rounded border border-line p-1 text-muted hover:border-warn hover:text-warn"
                    aria-label="Remove webhook"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add / edit form */}
        {editingId !== null && (
          <WebhookEditor
            editingId={editingId}
            draft={draft}
            setDraft={setDraft}
            showSecret={showSecret}
            setShowSecret={setShowSecret}
            toggleEvent={toggleEvent}
            settings={settings}
            saveDraft={saveDraft}
            draftError={draftError}
            onCancel={() => {
              setEditingId(null);
              setDraftError(null);
            }}
          />
        )}

        {/* Recent deliveries */}
        <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
          <p className="mb-3 font-mono text-[11px] font-bold uppercase tracking-wide text-muted">Recent deliveries</p>
          {localDeliveries.length === 0 ? (
            <p className="font-body text-xs text-muted">
              No deliveries yet. Send a test from a webhook card above to see results here.
            </p>
          ) : (
            <div className="divide-y divide-line">
              {localDeliveries.slice(0, 12).map((d) => (
                <div key={d.id} className="flex items-center gap-2 py-2">
                  {d.success ? (
                    <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle size={14} className="shrink-0 text-warn" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-body text-xs text-ink">{d.url}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${
                      d.event === "test"
                        ? "bg-paper text-muted"
                        : "bg-[color-mix(in_srgb,var(--accent)_12%,white)] text-[var(--accent)]"
                    }`}
                  >
                    {d.event}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted">
                    {d.statusCode ?? "—"} {d.durationMs != null ? `· ${d.durationMs}ms` : ""}
                  </span>
                  <span className="shrink-0 font-body text-[10px] text-muted">
                    {new Date(d.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
/* ------------------------------------------------------------- Sub-components */

function TestStateView({
  state,
  onTest,
}: {
  state: TestState;
  onTest: () => void;
}) {
  if (state.status === "testing") {
    return (
      <span className="flex items-center gap-1 rounded border border-line px-2 py-1 font-body text-[11px] text-muted">
        <Loader2 size={11} className="animate-spin" /> Testing
      </span>
    );
  }
  if (state.status === "ok") {
    return (
      <span className="flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 font-body text-[11px] font-semibold text-emerald-700">
        <CheckCircle2 size={11} /> {state.statusCode} · {state.durationMs}ms
      </span>
    );
  }
  return (
    <span title={state.status === "fail" ? state.message : ""} className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onTest}
        className="flex items-center gap-1 rounded border border-line px-2 py-1 font-body text-[11px] font-semibold text-muted hover:border-muted hover:text-ink"
      >
        <Send size={11} /> Test
      </button>
      {state.status === "fail" && (
        <span className="flex items-center gap-1 font-body text-[10.5px] font-semibold text-warn">
          <XCircle size={11} /> Failed
        </span>
      )}
    </span>
  );
}

const editorInput =
  "w-full rounded-md border border-line bg-white px-3 py-2 font-body text-xs text-ink outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]";
const editorLabel = "mb-1 block font-mono text-[11px] uppercase tracking-wide text-muted";
function WebhookEditor({
  editingId,
  draft,
  setDraft,
  showSecret,
  setShowSecret,
  toggleEvent,
  settings,
  saveDraft,
  draftError,
  onCancel,
}: {
  editingId: string;
  draft: typeof EMPTY_DRAFT;
  setDraft: React.Dispatch<React.SetStateAction<typeof EMPTY_DRAFT>>;
  showSecret: boolean;
  setShowSecret: React.Dispatch<React.SetStateAction<boolean>>;
  toggleEvent: (ev: WebhookEvent) => void;
  settings: FormSettings;
  saveDraft: () => void;
  draftError: string | null;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
      <p className="mb-4 font-mono text-[11px] font-bold uppercase tracking-wide text-muted">
        {editingId === "new" ? "New webhook" : "Edit webhook"}
      </p>

      <div className="mb-3">
        <label className={editorLabel}>Name (optional)</label>
        <input
          className={editorInput}
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder="e.g. Slack, CRM, my-notifier"
        />
      </div>

      <div className="mb-3">
        <label className={editorLabel}>Endpoint URL *</label>
        <input
          className={editorInput + " font-mono"}
          value={draft.url}
          onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
          placeholder="https://hooks.example.com/formcraft"
        />
      </div>

      <div className="mb-3">
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-muted">Trigger when</p>
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 font-body text-xs text-ink">
            <input
              type="checkbox"
              checked={draft.events.includes("submission")}
              onChange={() => toggleEvent("submission")}
              className="h-4 w-4 rounded border-line accent-[var(--accent)]"
            />
            {WEBHOOK_EVENT_LABELS.submission}
          </label>
          <label className="flex items-center gap-2 font-body text-xs text-ink">
            <input
              type="checkbox"
              checked={draft.events.includes("deadline")}
              onChange={() => toggleEvent("deadline")}
              className="h-4 w-4 rounded border-line accent-[var(--accent)]"
            />
            {WEBHOOK_EVENT_LABELS.deadline}
          </label>
          {!settings.closeOnDate && draft.events.includes("deadline") && (
            <p className="pl-6 font-body text-[10.5px] text-warn">
              No close date is set — set one in Settings so the deadline webhook has something to fire on.
            </p>
          )}
        </div>
      </div>

      <div className="mb-4">
        <label className={editorLabel}>Signing secret (optional)</label>
        <div className="flex gap-2">
          <input
            type={showSecret ? "text" : "password"}
            className={editorInput + " font-mono"}
            value={draft.secret}
            onChange={(e) => setDraft((d) => ({ ...d, secret: e.target.value }))}
            placeholder="Shared secret for HMAC signing"
          />
          <button
            type="button"
            onClick={() => setShowSecret((v) => !v)}
            className="shrink-0 rounded-md border border-line px-2.5 text-muted hover:text-ink"
            aria-label={showSecret ? "Hide secret" : "Show secret"}
          >
            {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, secret: nanoid(24) }))}
            className="flex shrink-0 items-center gap-1 rounded-md border border-line px-2.5 font-body text-[11px] font-semibold text-muted hover:text-ink"
            title="Generate a random secret"
          >
            <KeyRound size={12} /> Generate
          </button>
        </div>
        <p className="mt-1 font-body text-[10.5px] text-muted">
          If set, every request carries an <b>X-FormCraft-Signature</b> header so your endpoint can verify it came from
          us. See the help section for verification code.
        </p>
      </div>

      {draftError && <p className="mb-3 rounded-md bg-rose-50 px-3 py-2 font-body text-xs text-warn">{draftError}</p>}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-line px-3 py-2 font-body text-xs font-semibold text-muted hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={saveDraft}
          className="rounded-md bg-[var(--accent)] px-4 py-2 font-body text-xs font-semibold text-white transition hover:opacity-90"
        >
          Save webhook
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Help / docs */

function HelpSection({
  show,
  onToggle,
  hasCloseDate,
}: {
  show: boolean;
  onToggle: () => void;
  hasCloseDate: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <span className="flex items-center gap-2 font-body text-sm font-semibold text-ink">
          <Info size={14} className="text-muted" /> How to integrate
        </span>
        {show ? <ChevronUp size={15} className="text-muted" /> : <ChevronDown size={15} className="text-muted" />}
      </button>

      {show && (
        <div className="space-y-5 border-t border-line px-5 py-4">
          <div>
            <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wide text-muted">Quick start</p>
            <ol className="list-inside list-decimal space-y-1.5 font-body text-xs leading-relaxed text-ink">
              <li>Pick the endpoint you want to receive events. It must accept HTTPS POST requests.</li>
              <li>
                Click <b>Add webhook</b>, paste the URL, and choose when to trigger it.
              </li>
              <li>
                Add a <b>signing secret</b> if you want to verify requests really come from this form (recommended).
              </li>
              <li>
                Click <b>Test</b> on the webhook card to send a sample payload and confirm delivery.
              </li>
            </ol>
          </div>

          <div>
            <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wide text-muted">Triggers</p>
            <ul className="space-y-1.5 font-body text-xs leading-relaxed text-ink">
              <li>
                <b>{WEBHOOK_EVENT_LABELS.submission}</b> — fires once for every response, as soon as the response is
                recorded. Best for real-time notifications and CRM pushes.
              </li>
              <li>
                <b>{WEBHOOK_EVENT_LABELS.deadline}</b> — fires once, after the form&rsquo;s close date passes and the
                form is auto-closed.{" "}
                {hasCloseDate
                  ? "Your form has a close date set."
                  : "Set a close date in Settings to use this trigger."}{" "}
                If delivery fails, it retries hourly until success (never twice for the same deadline).
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wide text-muted">
              Payload — submission
            </p>
            <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 font-mono text-[10.5px] leading-relaxed text-slate-100">
{`{
  "event": "submission",
  "form": { "id": "...", "title": "Event registration", "schemaVersion": 3 },
  "response": {
    "id": "...",
    "createdAt": "2025-08-29T10:00:00.000Z",
    "answers": { "fieldId1": "Ada Lovelace", "fieldId2": "ada@example.com" }
  },
  "fields": [
    { "id": "fieldId1", "label": "Full name", "value": "Ada Lovelace" },
    { "id": "fieldId2", "label": "Email", "value": "ada@example.com" }
  ],
  "meta": { "userAgent": "Mozilla/5.0 ..." }
}`}
            </pre>
          </div>

          <div>
            <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wide text-muted">Payload — deadline</p>
            <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 font-mono text-[10.5px] leading-relaxed text-slate-100">
{`{
  "event": "deadline",
  "form": { "id": "...", "title": "Event registration", "closeDate": "2025-09-30" },
  "responseCount": 128,
  "createdAt": "2025-10-01T00:00:00.000Z"
}`}
            </pre>
          </div>
<div>
            <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wide text-muted">
              Verify the signature (Node.js)
            </p>
            <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 font-mono text-[10.5px] leading-relaxed text-slate-100">
{`// Header: X-FormCraft-Signature: sha256=<hex>
import { createHmac, timingSafeEqual } from "crypto";

const secret = process.env.FORMCRAFT_WEBHOOK_SECRET;
const signature = req.headers["x-formcraft-signature"].replace("sha256=", "");
const expected = createHmac("sha256", secret)
  .update(rawBody)    // the EXACT raw request body
  .digest("hex");
if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
  res.status(401).end(); // not from us — reject
}`}
            </pre>
            <p className="mt-1.5 font-body text-[10.5px] leading-relaxed text-muted">
              Every request also carries <b>X-FormCraft-Event</b> (<code>submission</code>, <code>deadline</code> or{" "}
              <code>test</code>) and <b>X-FormCraft-Webhook-Id</b>. Sign with the exact raw body (don&rsquo;t
              re-stringify it).
            </p>
          </div>

          <div>
            <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wide text-muted">Try it with curl</p>
            <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 font-mono text-[10.5px] leading-relaxed text-slate-100">
{`curl -X POST https://your-endpoint.example.com/hook \\
  -H "Content-Type: application/json" \\
  -H "X-FormCraft-Event: submission" \\
  -d '{"event":"submission","form":{"title":"Event registration"}}'`}
            </pre>
          </div>

          <div>
            <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wide text-muted">Delivery behavior</p>
            <ul className="list-inside list-disc space-y-1.5 font-body text-xs leading-relaxed text-ink">
              <li>Requests time out after 8 seconds. A 2xx status code counts as success.</li>
              <li>Submission webhooks are fire-once — a failed attempt is logged but not retried.</li>
              <li>Deadline webhooks are retried hourly by the scheduler until they succeed.</li>
              <li>All attempts appear under <b>Recent deliveries</b> with status code and latency.</li>
              <li>Configured secrets are only ever sent outbound — they&rsquo;re never exposed on the public form.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}