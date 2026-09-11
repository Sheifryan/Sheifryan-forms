import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveWorkspace } from "@/lib/workspace-server";

// Workspace-scoped file operations.
//   GET  /api/files?form=<id>        – list file metadata
//   DELETE /api/files?id=<file id>   – remove the object + metadata row
export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await resolveActiveWorkspace();
  if (!workspace) return NextResponse.json({ files: [] });

  const { searchParams } = new URL(request.url);
  const formId = searchParams.get("form");

  // Only ever return files attached to forms in the caller's workspace.
  let ownedFormsQuery = supabase.from("forms").select("id").eq("workspace_id", workspace.id);
  if (formId) ownedFormsQuery = ownedFormsQuery.eq("id", formId);
  const { data: ownedForms } = await ownedFormsQuery;
  const formIds = (ownedForms ?? []).map((f) => f.id);

  const { data: files, error } = await supabase
    .from("form_files")
    .select("id, form_id, original_name, mime_type, size_bytes, created_at, storage_path")
    .in("form_id", formIds.length > 0 ? formIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ files: files ?? [] });
}

export async function DELETE(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get("id");
  if (!fileId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // The file must belong to one of the caller's forms (scoped through the
  // forms table rather than trusting the client to scope correctly).
  const { data: file } = await supabase
    .from("form_files")
    .select("id, form_id, storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const { data: owned } = await supabase.from("forms").select("id").eq("id", file.form_id).maybeSingle();
  if (!owned) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const { error: removeError } = await supabase.storage.from("form-attachments").remove([file.storage_path]);
  if (removeError) console.error(`[files] Couldn't remove storage object ${file.storage_path}:`, removeError);

  const { error } = await supabase.from("form_files").delete().eq("id", fileId).eq("form_id", owned.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}