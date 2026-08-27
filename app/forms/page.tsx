import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { AllFormsClient } from "./AllFormsClient";

export default async function AllFormsPage({ searchParams }: { searchParams: { folder?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: forms } = await supabase
    .from("forms")
    .select("id, title, status, schema, theme, folder_id, updated_at")
    .eq("owner_id", user.id)
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

  // Resolve the active folder from ?folder= ("all" | "none" | valid folder id).
  const raw = searchParams.folder ?? "all";
  const folderIds = new Set(folderRows.map((f) => f.id));
  const activeFolderId = raw === "all" || raw === "none" || folderIds.has(raw) ? raw : "all";

  const headingTitle =
    activeFolderId === "all"
      ? "All forms"
      : activeFolderId === "none"
        ? "Uncategorized"
        : folderRows.find((f) => f.id === activeFolderId)?.name ?? "Folder";

  // Per-view form counts for the sidebar badges.
  const folderCounts: { all: number; none: number; [folderId: string]: number } = {
    all: formRows.length,
    none: formRows.filter((f) => !f.folder_id).length,
  };
  for (const f of folderRows) folderCounts[f.id] = formRows.filter((x) => x.folder_id === f.id).length;

  return (
    <AppShell
      active="forms"
      title={headingTitle}
      userEmail={user.email}
      activeFolderId={activeFolderId}
      folderCounts={folderCounts}
    >
      <AllFormsClient
        forms={formRows}
        folders={folderRows}
        responseCounts={responseCounts}
        activeFolderId={activeFolderId}
      />
    </AppShell>
  );
}