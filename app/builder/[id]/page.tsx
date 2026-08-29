import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormBuilder } from "@/components/builder/FormBuilder";
import type { FormSchema, FormSettings, ThemeKey } from "@/lib/schema";
import { defaultSettings, DEFAULT_THEME } from "@/lib/schema";

export default async function BuilderPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: form } = await supabase
    .from("forms")
    .select("id, title, schema, owner_id, status, settings, theme, storage_used_bytes")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .single();

  if (!form || form.owner_id !== user.id) notFound();

  // File storage stats for the Settings tab's storage card.
  const { count: fileCount } = await supabase
    .from("form_files")
    .select("id", { count: "exact", head: true })
    .eq("form_id", params.id);

  return (
    <FormBuilder
      formId={form.id}
      initialTitle={form.title}
      initialSchema={(form.schema as FormSchema) ?? { fields: [] }}
      initialStatus={form.status}
      initialSettings={(form.settings as FormSettings) ?? defaultSettings}
      initialTheme={(form.theme as ThemeKey) ?? DEFAULT_THEME}
      storageBytes={(form.storage_used_bytes as number) ?? 0}
      fileCount={fileCount ?? 0}
    />
  );
}
