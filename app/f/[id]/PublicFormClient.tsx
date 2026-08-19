"use client";

import { useToast } from "@/components/Toast";
import { FormRenderer } from "@/components/renderer/FormRenderer";
import type { FormSchema, FormSettings } from "@/lib/schema";

export function PublicFormClient({
  formId,
  schema,
  settings,
}: {
  formId: string;
  schema: FormSchema;
  settings?: FormSettings;
}) {
  const toast = useToast();

  async function handleSubmit(answers: Record<string, unknown>) {
    const res = await fetch(`/api/forms/${formId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        toast.success("Response submitted");
      }
      return { ok: true, confirmationMessage: data.confirmationMessage as string | undefined };
    }

    const data = await res.json().catch(() => ({}));
    return { ok: false, fieldErrors: data.fieldErrors ?? {}, error: data.error as string | undefined };
  }

  return <FormRenderer schema={schema} onSubmit={handleSubmit} settings={settings} />;
}
