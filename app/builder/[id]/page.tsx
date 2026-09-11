import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveProfile } from "@/lib/workspace-server";
import { FormBuilder } from "@/components/builder/FormBuilder";
import { FormatProvider } from "@/components/FormatProvider";
import type { FormSchema, FormSettings, ThemeKey, WebhookDelivery } from "@/lib/schema";
import { defaultSettings, DEFAULT_THEME } from "@/lib/schema";

export default async function BuilderPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: form } = await supabase
    .from("forms")
    .select("id, title, description, schema, owner_id, status, settings, theme, storage_used_bytes")
    .eq("id", params.id)
    
    .single();

  if (!form) notFound();

  // File storage stats for the Settings tab's storage card.
  const { count: fileCount } = await supabase
    .from("form_files")
    .select("id", { count: "exact", head: true })
    .eq("form_id", params.id);

  // Latest webhook delivery log for the Integrations tab.
  const { data: deliveryRows } = await supabase
    .from("webhook_deliveries")
    .select("id, webhook_id, event, url, success, status_code, duration_ms, error, created_at")
    .eq("form_id", params.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const deliveries: WebhookDelivery[] = (deliveryRows ?? []).map((r) => ({
    id: r.id,
    webhookId: r.webhook_id,
    event: r.event,
    url: r.url,
    success: r.success,
    statusCode: r.status_code,
    durationMs: r.duration_ms,
    error: r.error,
    createdAt: r.created_at,
  }));

  // Who this form is shared with (migration 0013). Absent before that
  // migration — the avatar stack simply renders empty.
  let collaborators: { userId: string; name: string | null; email: string | null; avatarUrl: string | null }[] = [];
  const { data: memberRows, error: memberError } = await supabase
    .from("form_members")
    .select("user_id, role")
    .eq("form_id", params.id);
  if (!memberError && (memberRows ?? []).length > 0) {
    const ids = (memberRows ?? []).map((m) => m.user_id);
    const { data: profs } = await supabase.from("profiles").select("id, full_name, email, avatar_url").in("id", ids);
    collaborators = (memberRows ?? []).map((m) => {
      const p = (profs ?? []).find((x) => x.id === m.user_id);
      return {
        userId: m.user_id,
        name: p?.full_name ?? null,
        email: p?.email ?? null,
        avatarUrl: p?.avatar_url ?? null,
      };
    });
  }

  // The builder sits outside AppShell, so it needs its own formatting context
  // (the Integrations tab renders delivery timestamps).
  const { profile } = await resolveProfile();
  const prefs = profile?.preferences ?? {};

  return (
    <FormatProvider locale={prefs.language ?? null} timeZone={prefs.timezone ?? null}>
      <FormBuilder
        formId={form.id}
        initialTitle={form.title}
        initialDescription={(form.description as string) ?? ""}
        initialSchema={(form.schema as FormSchema) ?? { fields: [] }}
        initialStatus={form.status}
        initialSettings={(form.settings as FormSettings) ?? defaultSettings}
        initialTheme={(form.theme as ThemeKey) ?? DEFAULT_THEME}
        storageBytes={(form.storage_used_bytes as number) ?? 0}
        fileCount={fileCount ?? 0}
        deliveries={deliveries}
        collaborators={collaborators}
      />
    </FormatProvider>
  );
}
