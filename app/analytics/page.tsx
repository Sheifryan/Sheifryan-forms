import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { AnalyticsClient } from "./AnalyticsClient";

export default async function AnalyticsPage({ searchParams }: { searchParams: { form?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: forms } = await supabase
    .from("forms")
    .select("id, title, schema")
    .order("updated_at", { ascending: false });

  const activeFormId = searchParams.form ?? forms?.[0]?.id ?? null;

  let responses: { id: string; answers: Record<string, unknown>; created_at: string }[] = [];
  if (activeFormId) {
    const { data } = await supabase
      .from("responses")
      .select("id, answers, created_at")
      .eq("form_id", activeFormId)
      .order("created_at", { ascending: false });
    responses = data ?? [];
  }

  return (
    <AppShell active="analytics" userEmail={user.email}>
      <AnalyticsClient forms={forms ?? []} activeFormId={activeFormId} responses={responses} />
    </AppShell>
  );
}
