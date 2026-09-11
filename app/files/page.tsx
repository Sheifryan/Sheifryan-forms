import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { resolveActiveWorkspace, resolveProfile } from "@/lib/workspace-server";
import { FilesClient } from "./FilesClient";

export default async function FilesPage({ searchParams }: { searchParams: { form?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { workspace } = await resolveActiveWorkspace();
  const { profile } = await resolveProfile();

  let query = supabase.from("forms").select("id, title").order("title", { ascending: true });
  if (workspace) query = query.eq("workspace_id", workspace.id);
  const { data: forms } = await query;
  const formRows = forms ?? [];
  const formIds = formRows.map((f) => f.id);

  let fq = supabase
    .from("form_files")
    .select("id, form_id, field_id, original_name, mime_type, size_bytes, created_at, storage_path, uploaded_by")
    .order("created_at", { ascending: false });
  if (formIds.length > 0) fq = fq.in("form_id", formIds);
  else fq = fq.eq("form_id", "00000000-0000-0000-0000-000000000000");

  const activeFormId = searchParams.form && formIds.includes(searchParams.form) ? searchParams.form : null;
  if (activeFormId) fq = fq.eq("form_id", activeFormId);

  type FileData = {
    id: string;
    form_id: string;
    original_name: string;
    mime_type: string;
    size_bytes: number | null;
    created_at: string;
    storage_path: string;
    uploaded_by?: string | null;
  };

  let fileRows: FileData[] = [];
  const withUploader = await fq;
  if (!withUploader.error) {
    fileRows = (withUploader.data ?? []) as FileData[];
  } else {
    // Pre-0013 database: form_files has no uploaded_by column yet.
    let fq2 = supabase
      .from("form_files")
      .select("id, form_id, field_id, original_name, mime_type, size_bytes, created_at, storage_path")
      .order("created_at", { ascending: false });
    fq2 = formIds.length > 0 ? fq2.in("form_id", formIds) : fq2.eq("form_id", "00000000-0000-0000-0000-000000000000");
    if (activeFormId) fq2 = fq2.eq("form_id", activeFormId);
    const fallback = await fq2;
    fileRows = (fallback.data ?? []) as FileData[];
  }
  const files = fileRows;

  // Who uploaded what (organisations only) — drives the "Uploaded by" filter.
  let uploaders: { userId: string; name: string | null; email: string | null }[] = [];
  if (workspace && workspace.kind === "business") {
    const ids = Array.from(new Set(files.map((f) => f.uploaded_by).filter((v): v is string => Boolean(v))));
    if (ids.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      uploaders = ids.map((id) => {
        const p = (profs ?? []).find((x) => x.id === id);
        return { userId: id, name: p?.full_name ?? null, email: p?.email ?? null };
      });
    }
  }

  // Total storage across the workspace (the files we can see, plus the
  // per-form accrual column as a source of truth fallback).
  const sumBytes = files.reduce((acc, f) => acc + Number(f.size_bytes ?? 0), 0);
  const quotaBytes = workspace?.storage_quota_bytes ?? 0;
  const usageBytes = Math.max(sumBytes, files.length > 0 ? sumBytes : 0);

  return (
    <AppShell
      active="files"
      title="Files"
      user={{ email: user.email, fullName: profile?.full_name || (user.user_metadata?.full_name as string) }}
      workspace={{ name: workspace?.name, plan: workspace?.plan }}
    >
      <FilesClient
        files={files.map((f) => ({
          id: f.id,
          formId: f.form_id,
          name: f.original_name,
          mimeType: f.mime_type,
          sizeBytes: Number(f.size_bytes ?? 0),
          createdAt: f.created_at,
          storagePath: f.storage_path,
          uploadedBy: f.uploaded_by ?? null,
        }))}
        forms={formRows}
        activeFormId={activeFormId}
        uploaders={uploaders}
        orgMode={workspace?.kind === "business"}
        usage={usageBytes}
        quota={quotaBytes}
        credits={workspace?.credits_balance ?? 0}
      />
    </AppShell>
  );
}