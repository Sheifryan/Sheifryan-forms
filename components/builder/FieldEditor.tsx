"use client";

import { nanoid } from "nanoid";
import type { FormField, ConditionRule } from "@/lib/schema";

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
