"use client";

import { nanoid } from "nanoid";
import {
  defaultFileConfig,
  defaultPaymentConfig,
  type FormField,
  type ConditionRule,
  type PaymentCurrency,
  type PaymentFieldConfig,
} from "@/lib/schema";

interface Props {
  field: FormField;
  allFields: FormField[];
  onChange: (patch: Partial<FormField>) => void;
}

const inputCls =
  "w-full rounded border border-line bg-white px-2.5 py-1.5 font-body text-sm text-ink outline-none focus:border-signal focus:ring-1 focus:ring-signal";
const labelCls = "mb-1 block font-mono text-[11px] uppercase tracking-wide text-muted";

export function FieldEditor({ field, allFields, onChange }: Props) {
  if (field.type === "page_break") {
    return (
      <div className="space-y-5">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Page break</p>
        <div>
          <label className={labelCls}>Page title</label>
          <input className={inputCls} value={field.label} onChange={(e) => onChange({ label: e.target.value })} />
        </div>
        <p className="rounded border border-line bg-paper p-2.5 font-body text-[11px] text-muted">
          Everything below this marker (until the next page break) becomes its own page in the live form.
        </p>
      </div>
    );
  }

  const hasOptions = field.type === "single_select" || field.type === "multi_select" || field.type === "dropdown";
  const otherFields = allFields.filter((f) => f.id !== field.id && f.type !== "page_break");

  function updateOption(id: string, label: string) {
    onChange({ options: field.options?.map((o) => (o.id === id ? { ...o, label } : o)) });
  }

  function addOption() {
    onChange({
      options: [...(field.options ?? []), { id: nanoid(6), label: `Option ${(field.options?.length ?? 0) + 1}` }],
    });
  }

  function removeOption(id: string) {
    onChange({ options: field.options?.filter((o) => o.id !== id) });
  }

  function addRule() {
    const target = otherFields[0];
    if (!target) return;
    const rule: ConditionRule = { fieldId: target.id, operator: "equals", value: "" };
    onChange({ showIf: [...(field.showIf ?? []), rule] });
  }

  function updateRule(index: number, patch: Partial<ConditionRule>) {
    const rules = [...(field.showIf ?? [])];
    rules[index] = { ...rules[index], ...patch };
    onChange({ showIf: rules });
  }

  function removeRule(index: number) {
    onChange({ showIf: (field.showIf ?? []).filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-5">
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Field settings</p>

      <div>
        <label className={labelCls}>Label</label>
        <input className={inputCls} value={field.label} onChange={(e) => onChange({ label: e.target.value })} />
      </div>

      <div>
        <label className={labelCls}>Help text</label>
        <input
          className={inputCls}
          value={field.helpText ?? ""}
          placeholder="Optional"
          onChange={(e) => onChange({ helpText: e.target.value })}
        />
      </div>

      {(field.type === "short_text" ||
        field.type === "long_text" ||
        field.type === "email" ||
        field.type === "phone" ||
        field.type === "url" ||
        field.type === "number") && (
        <div>
          <label className={labelCls}>Placeholder</label>
          <input
            className={inputCls}
            value={field.placeholder ?? ""}
            onChange={(e) => onChange({ placeholder: e.target.value })}
          />
        </div>
      )}

      <label className="flex items-center gap-2 font-body text-sm text-ink">
        <input
          type="checkbox"
          checked={field.required}
          onChange={(e) => onChange({ required: e.target.checked })}
          className="h-4 w-4 rounded border-line accent-signal"
        />
        Required
      </label>

      {hasOptions && (
        <div>
          <label className={labelCls}>Options</label>
          <div className="space-y-2">
            {(field.options ?? []).map((opt) => (
              <div key={opt.id} className="flex items-center gap-2">
                <input className={inputCls} value={opt.label} onChange={(e) => updateOption(opt.id, e.target.value)} />
                <button onClick={() => removeOption(opt.id)} className="font-body text-xs text-warn">
                  ✕
                </button>
              </div>
            ))}
            <button onClick={addOption} className="font-body text-xs text-signal hover:underline">
              + Add option
            </button>
          </div>
        </div>
      )}

      {field.type === "file" && <FileConfigEditor field={field} onChange={onChange} />}

      {field.type === "payment" && (
        <PaymentConfigEditor field={field} allFields={allFields} onChange={onChange} />
      )}

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className={labelCls + " mb-0"}>Show this field if</label>
          {otherFields.length > 0 && (
            <button onClick={addRule} className="font-body text-xs text-signal hover:underline">
              + Add rule
            </button>
          )}
        </div>
        {(field.showIf ?? []).length === 0 && <p className="font-body text-xs text-muted">Always shown.</p>}
        <div className="space-y-2">
          {(field.showIf ?? []).map((rule, i) => (
            <div key={i} className="rounded border border-line p-2">
              <div className="mb-1.5 flex items-center gap-1.5">
                <select
                  className={inputCls}
                  value={rule.fieldId}
                  onChange={(e) => updateRule(i, { fieldId: e.target.value })}
                >
                  {otherFields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <button onClick={() => removeRule(i)} className="font-body text-xs text-warn">
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  className={inputCls}
                  value={rule.operator}
                  onChange={(e) => updateRule(i, { operator: e.target.value as ConditionRule["operator"] })}
                >
                  <option value="equals">equals</option>
                  <option value="not_equals">does not equal</option>
                  <option value="contains">contains</option>
                </select>
                <input
                  className={inputCls}
                  value={rule.value}
                  onChange={(e) => updateRule(i, { value: e.target.value })}
                  placeholder="value"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Payment config */

const numOr = (v: string, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

function PaymentConfigEditor({
  field,
  allFields,
  onChange,
}: {
  field: FormField;
  allFields: FormField[];
  onChange: (patch: Partial<FormField>) => void;
}) {
  const cfg = field.paymentConfig ?? defaultPaymentConfig();
  const set = (patch: Partial<PaymentFieldConfig>) =>
    onChange({ paymentConfig: { ...cfg, ...patch } });

  const phoneFields = allFields.filter((f) => f.type === "phone" && f.id !== field.id);

  return (
    <div className="rounded-lg border border-line bg-paper p-3">
      <p className="mb-2 font-mono text-[10.5px] font-bold uppercase tracking-wide text-muted">Payment settings</p>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Amount mode</label>
          <select
            className={inputCls}
            value={cfg.amountMode}
            onChange={(e) => set({ amountMode: e.target.value as PaymentFieldConfig["amountMode"] })}
          >
            <option value="fixed">Fixed amount</option>
            <option value="user_entered">Respondent enters amount</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Currency</label>
          <select className={inputCls} value={cfg.currency} onChange={(e) => set({ currency: e.target.value as PaymentCurrency })}>
            <option value="UGX">UGX (Uganda Shillings)</option>
            <option value="USD">USD (US Dollars)</option>
          </select>
        </div>
      </div>

      {cfg.amountMode === "fixed" && (
        <div className="mb-3">
          <label className={labelCls}>Fixed amount</label>
          <input
            type="number"
            min={1}
            className={inputCls}
            value={cfg.fixedAmount}
            onChange={(e) => set({ fixedAmount: numOr(e.target.value, cfg.fixedAmount) })}
          />
        </div>
      )}

      {cfg.currency === "USD" && (
        <div className="mb-3">
          <label className={labelCls}>USD → UGX rate</label>
          <input
            type="number"
            min={1}
            step="any"
            className={inputCls}
            value={cfg.usdToUgxRate}
            onChange={(e) => set({ usdToUgxRate: numOr(e.target.value, cfg.usdToUgxRate) })}
          />
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Tax rate (%)</label>
          <input
            type="number"
            min={0}
            step="any"
            className={inputCls}
            value={cfg.taxRate}
            onChange={(e) => {
              const n = Number(e.target.value);
              set({ taxRate: Number.isFinite(n) && n >= 0 ? n : 0 });
            }}
          />
        </div>
        <div>
          <label className={labelCls}>Min amount</label>
          <input
            type="number"
            min={0}
            className={inputCls}
            value={cfg.minAmount ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              set({ minAmount: v === "" ? undefined : Math.max(0, Number(v)) });
            }}
          />
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Max amount</label>
          <input
            type="number"
            min={0}
            className={inputCls}
            value={cfg.maxAmount ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              set({ maxAmount: v === "" ? undefined : Math.max(0, Number(v)) });
            }}
          />
        </div>
        <div>
          <label className={labelCls}>Phone field</label>
          <select
            className={inputCls}
            value={cfg.phoneFieldId ?? ""}
            onChange={(e) => set({ phoneFieldId: e.target.value || undefined })}
          >
            <option value="">Ask on this payment field</option>
            {phoneFields.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Description (optional)</label>
        <input className={inputCls} value={cfg.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
      </div>

      <p className="mt-3 font-body text-[10.5px] leading-relaxed text-muted">
        Payments are mobile-money collections via MarzPay (UGX). USD amounts
        are converted using the configured rate before charging.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- File config */

const ACCEPT_PRESETS: { label: string; values: string[] }[] = [
  { label: "Images", values: ["image/*"] },
  {
    label: "Documents",
    values: [
      "application/pdf",
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  },
  {
    label: "Spreadsheets",
    values: [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
  },
  { label: "Any file", values: [] },
];

function FileConfigEditor({ field, onChange }: { field: FormField; onChange: (patch: Partial<FormField>) => void }) {
  const cfg = field.fileConfig ?? defaultFileConfig();

  function setAccept(values: string[]) {
    onChange({ fileConfig: { ...cfg, accept: values } });
  }

  return (
    <div className="rounded-lg border border-line bg-paper p-3">
      <p className="mb-2 font-mono text-[10.5px] font-bold uppercase tracking-wide text-muted">File upload settings</p>

      <div className="mb-3">
        <label className={labelCls}>Allowed file types</label>
        <input
          className={inputCls}
          value={cfg.accept.filter((a) => a.trim()).join(", ")}
          placeholder="e.g. image/*, .pdf, .docx — empty means any"
          onChange={(e) =>
            setAccept(
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
        />
        <div className="mt-1.5 flex flex-wrap gap-1">
          {ACCEPT_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setAccept(p.values)}
              className={`rounded-full border px-2 py-0.5 font-body text-[10px] font-semibold transition ${
                JSON.stringify(cfg.accept) === JSON.stringify(p.values)
                  ? "border-[var(--accent)] bg-white text-[var(--accent)]"
                  : "border-line bg-white text-muted hover:border-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Max size (MB)</label>
          <input
            type="number"
            min={1}
            max={512}
            className={inputCls}
            value={cfg.maxSizeMb}
            onChange={(e) => {
              const v = Number(e.target.value);
              onChange({ fileConfig: { ...cfg, maxSizeMb: Number.isFinite(v) && v > 0 ? v : 1 } });
            }}
          />
        </div>
        <div>
          <label className={labelCls}>Max files</label>
          <input
            type="number"
            min={1}
            max={20}
            className={inputCls}
            value={cfg.maxFiles}
            onChange={(e) => {
              const v = Number(e.target.value);
              onChange({ fileConfig: { ...cfg, maxFiles: Number.isFinite(v) && v > 0 ? v : 1 } });
            }}
          />
        </div>
      </div>

      <p className="font-body text-[10.5px] leading-relaxed text-muted">
        Files are uploaded straight to your Supabase Storage (S3) bucket when the respondent picks them, and each
        file&rsquo;s metadata (name, type, size) is saved as part of the response.
      </p>
    </div>
  );
}
