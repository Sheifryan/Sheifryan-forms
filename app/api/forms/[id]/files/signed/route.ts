import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Owner-only: returns short-lived signed download URLs for file answers.
// The bucket itself stays private — the signed URL is the only way to read an
// object, and it's minted here (auth'd as the form's owner) so anonymous
// visitors can never resolve raw object paths.

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Confirm the caller owns this form (RLS alone can't scope `ids` to it).
  const { data: owned, error: ownerError } = await supabase
    .from("forms")
    .select("id")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (ownerError || !owned) return NextResponse.json({ error: "Form not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  if (ids.length === 0) return NextResponse.json({ files: [] });

  const { data: rows, error } = await supabase
    .from("form_files")
    .select("id, storage_path, original_name, mime_type, size_bytes")
    .eq("form_id", params.id)
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const files: { id: string; url: string; name: string; mimeType: string; sizeBytes: number }[] = [];
  for (const row of rows ?? []) {
    // Short expiry — the URL is only used to open the download link.
    const { data: signed } = await supabase.storage
      .from("form-attachments")
      .createSignedUrl(row.storage_path, 60);
    if (signed?.signedUrl) {
      files.push({
        id: row.id,
        url: signed.signedUrl,
        name: row.original_name,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
      });
    }
  }

  return NextResponse.json({ files });
}