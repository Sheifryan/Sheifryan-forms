import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: forms } = await supabase
    .from("forms")
    .select("id, title, status, schema, theme, folder_id, updated_at")
    .order("updated_at", { ascending: false });

  const { data: folders } = await supabase.from("folders").select("id, name").order("created_at", { ascending: true });

  // Response counts per form, in one query rather than N+1.
  const { data: responseRows } = await supabase.from("responses").select("form_id");
  const responseCounts: Record<string, number> = {};
  (responseRows ?? []).forEach((r) => {
    responseCounts[r.form_id] = (responseCounts[r.form_id] ?? 0) + 1;
  });

  const formRows = forms ?? [];
  const folderRows = folders ?? [];

  // Per-view form counts for the sidebar badges.
  const folderCounts: { all: number; none: number; [folderId: string]: number } = {
    all: formRows.length,
    none: formRows.filter((f) => !f.folder_id).length,
  };
  for (const f of folderRows) folderCounts[f.id] = formRows.filter((x) => x.folder_id === f.id).length;

  return (
    <AppShell
      active="dashboard"
      title="Home"
      greeting
      userEmail={user.email}
      activeFolderId="all"
      folderCounts={folderCounts}
    >
      <DashboardClient forms={formRows} folders={folderRows} responseCounts={responseCounts} />
    </AppShell>
  );
}
