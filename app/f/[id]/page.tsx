import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { FormSchema, FormSettings, ThemeKey } from "@/lib/schema";
import { THEMES, DEFAULT_THEME } from "@/lib/schema";
import { PublicFormClient } from "./PublicFormClient";
import { PasswordGate } from "./PasswordGate";

// ISR: public forms don't need to be regenerated on every request. Revalidate
// periodically so edits made in the builder show up within a minute.
export const revalidate = 60;

export default async function PublicFormPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: form } = await supabase
    .from("forms")
    // Deliberately excludes password_hash — that column's SELECT is revoked
    // for anon/authenticated at the DB level anyway (migration 0003), but
    // listing columns explicitly here means this query still works even if
    // that revoke were ever loosened by mistake.
    .select("id, title, description, schema, status, settings, theme")
    .eq("id", params.id)
    .single();

  if (!form || form.status !== "published") notFound();

  const settings = form.settings as FormSettings;
  const themeKey = (form.theme as ThemeKey) ?? DEFAULT_THEME;
  const accent = THEMES[themeKey]?.hex ?? THEMES[DEFAULT_THEME].hex;

  // Password gate: compare the visitor's cookie (if any) against the real
  // hash, which only the service client is allowed to read.
  if (settings?.passwordProtected) {
    const cookieValue = cookies().get(`easyform_pw_${params.id}`)?.value;
    let verified = false;
    if (cookieValue) {
      const service = createServiceClient();
      const { data: hashRow } = await service.from("forms").select("password_hash").eq("id", params.id).single();
      verified = Boolean(hashRow?.password_hash) && hashRow.password_hash === cookieValue;
    }
    if (!verified) {
      return (
        <div className="min-h-screen bg-paper px-6 py-14" style={{ "--accent": accent } as React.CSSProperties}>
          <div className="mx-auto max-w-sm">
            <h1 className="mb-6 text-center font-display text-xl text-ink">{form.title}</h1>
            <PasswordGate formId={form.id} />
          </div>
        </div>
      );
    }
  }

  // Check closure conditions up front so visitors see a clear message
  // instead of filling out a form that will reject them on submit.
  let closedReason: string | null = null;
  if (settings?.closeOnDate && settings.closeDate) {
    const closeAt = new Date(settings.closeDate + "T23:59:59");
    if (Date.now() > closeAt.getTime()) closedReason = "This form is no longer accepting responses.";
  }
  if (!closedReason && settings?.limitResponses && settings.maxResponses) {
    const { count } = await supabase
      .from("responses")
      .select("id", { count: "exact", head: true })
      .eq("form_id", form.id);
    if ((count ?? 0) >= settings.maxResponses) closedReason = "This form has reached its response limit.";
  }

  return (
    <div className="min-h-screen bg-paper px-6 py-14" style={{ "--accent": accent } as React.CSSProperties}>
      <div className="mx-auto max-w-xl">
        <h1 className="mb-1 font-display text-2xl text-ink">{form.title}</h1>
        {form.description && <p className="mb-8 font-body text-sm text-muted">{form.description}</p>}
        <div className="rounded-lg border border-line bg-white p-6">
          {closedReason ? (
            <p className="font-body text-sm text-muted">{closedReason}</p>
          ) : (
            <PublicFormClient
              formId={form.id}
              schema={(form.schema as FormSchema) ?? { fields: [] }}
              settings={settings}
            />
          )}
        </div>
      </div>
    </div>
  );
}
