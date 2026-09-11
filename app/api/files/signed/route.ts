import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Workspace-scoped signed URLs for a batch of file ids. Ownership is verified
// by joining the file to its form and checking the form's owner.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  if (ids.length === 0) return NextResponse.json({ files: [] });

  const { data: rows, error } = await supabase.from("form_files").select("id, form_id, storage_path, original_name, mime_type, size_bytes").in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep only files attached to forms the caller owns.
  interface FileRowAttrs {
    id: string;
    form_id: string;
    storage_path: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
  }
  const rowsTyped = (rows ?? []) as FileRowAttrs[];
  const owned: FileRowAttrs[] = [];
  if (rowsTyped.length > 0) {
    const formIds = Array.from(new Set(rowsTyped.map((r) => r.form_id)));
    const { data: ownedForms } = await supabase.from("forms").select("id").in("id", formIds);
    const ownedIds = new Set((ownedForms ?? []).map((f) => f.id));
    owned.push(...rowsTyped.filter((r) => ownedIds.has(r.form_id)));
  }

  const files: { id: string; url: string; name: string; mimeType: string; sizeBytes: number }[] = [];
  for (const r of owned) {
    const { data: signed } = await supabase.storage.from("form-attachments").createSignedUrl(r.storage_path, 3600);
    if (signed?.signedUrl) {
      files.push({ id: r.id, url: signed.signedUrl, name: r.original_name, mimeType: r.mime_type, sizeBytes: r.size_bytes });
    }
  }

  return NextResponse.json({ files });
}