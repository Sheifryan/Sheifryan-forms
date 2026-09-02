import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  defaultFileConfig,
  fileMatchesAccept,
  type FormSchema,
  type FormSettings,
  type FileFieldConfig,
} from "@/lib/schema";

// Uploads go straight into the private "form-attachments" (S3) bucket as soon
// as the respondent picks a file, so the metadata is recorded even if the
// response is never submitted (those rows stay orphaned with
// response_id = null and can be swept later).

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    return await handleUpload(request, params.id);
  } catch (err) {
    console.error(`[upload] Unexpected error for form ${params.id}:`, err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 500 });
  }
}

async function handleUpload(request: Request, id: string) {
  const supabase = createClient();
  const { data: form, error: formError } = await supabase
    .from("forms")
    .select("id, schema, schema_version, status, settings")
    .eq("id", id)
    .single();

  if (formError || !form) return NextResponse.json({ error: "Form not found" }, { status: 404 });
  if (form.status !== "published") {
    return NextResponse.json({ error: "This form is not accepting responses" }, { status: 403 });
  }

  const settings = form.settings as FormSettings;

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });

  // Password-protected forms: same cookie check as the submit route, so the
  // upload endpoint can't be used to bypass the gate. Embedded widgets forward
  // the hash as an `accessToken` form part instead (SameSite blocks cookies in
  // a third-party iframe).
  if (settings?.passwordProtected) {
    const cookieValue = cookies().get(`easyform_pw_${id}`)?.value;
    const bodyToken = typeof formData.get("accessToken") === "string" ? (formData.get("accessToken") as string) : "";
    formData.delete("accessToken");
    const service = createServiceClient();
    const { data: hashRow } = await service.from("forms").select("password_hash").eq("id", id).single();
    const verified = Boolean(hashRow?.password_hash) &&
      (cookieValue === hashRow.password_hash || bodyToken === hashRow.password_hash);
    if (!verified) return NextResponse.json({ error: "This form requires a password." }, { status: 401 });
  }

  const file = formData.get("file");
  const fieldId = formData.get("fieldId");
  const session = typeof formData.get("session") === "string" ? (formData.get("session") as string) : "";

  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  if (typeof fieldId !== "string" || !fieldId) return NextResponse.json({ error: "Missing fieldId" }, { status: 400 });

  const schema = form.schema as FormSchema;
  const field = schema.fields.find((f) => f.id === fieldId);
  if (!field || field.type !== "file") {
    return NextResponse.json({ error: "Unknown file upload field" }, { status: 400 });
  }

  const cfg: FileFieldConfig = field.fileConfig ?? defaultFileConfig();
  const service = createServiceClient();

  // Allowed file types (authoritative server-side check).
  if (!fileMatchesAccept(cfg.accept, file.type, file.name)) {
    return NextResponse.json({ error: `${file.name} isn't an allowed file type on this form.` }, { status: 400 });
  }

  // Per-file size limit.
  const maxBytes = cfg.maxSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `${file.name} is larger than the ${cfg.maxSizeMb} MB limit.` },
      { status: 400 }
    );
  }
// Maximum number of files per field visit. The client supplies a random
  // `session` token per field mount; the count across that session is checked
  // live so concurrent selects can't exceed the cap.
  if (cfg.maxFiles > 0) {
    const { count } = await service
      .from("form_files")
      .select("id", { count: "exact", head: true })
      .eq("form_id", form.id)
      .eq("field_id", fieldId)
      .eq("upload_session", session);
    if ((count ?? 0) >= cfg.maxFiles) {
      return NextResponse.json(
        { error: `You can attach at most ${cfg.maxFiles} file${cfg.maxFiles === 1 ? "" : "s"}.` },
        { status: 400 }
      );
    }
  }

  const fileName = sanitizeFileName(file.name);
  const storagePath = `${form.id}/${fieldId}/${nanoid(12)}-${fileName}`;
  const contentType = file.type || "application/octet-stream";

  const { error: uploadError } = await service.storage
    .from("form-attachments")
    .upload(storagePath, file, { contentType, cacheControl: "3600" });

  if (uploadError) {
    console.error(`[upload] storage upload failed:`, uploadError);
    return NextResponse.json({ error: "Couldn't store the file. Try again." }, { status: 500 });
  }

  const { data: row, error: insertError } = await service
    .from("form_files")
    .insert({
      form_id: form.id,
      field_id: fieldId,
      upload_session: session,
      storage_path: storagePath,
      original_name: file.name,
      mime_type: contentType,
      size_bytes: file.size,
    })
    .select("id")
    .single();

  if (insertError || !row) {
    console.error(`[upload] metadata insert failed:`, insertError);
    await service.storage.from("form-attachments").remove([storagePath]).catch(() => {});
    return NextResponse.json({ error: insertError?.message ?? "Couldn't record the file." }, { status: 500 });
  }

  return NextResponse.json({
    id: row.id,
    name: file.name,
    mimeType: contentType,
    sizeBytes: file.size,
  });
}

// Remove a file that hasn't been attached to a response yet. The `id` plus the
// originating `session` token act as the ownership proof — once a file is
// linked to a response it can no longer be deleted through this endpoint.
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const fileId = typeof body?.id === "string" ? body.id : "";
  const session = typeof body?.session === "string" ? body.session : "";
  if (!fileId || !session) return NextResponse.json({ error: "Missing id or session" }, { status: 400 });

  const service = createServiceClient();
  const { data: row } = await service
    .from("form_files")
    .select("id, storage_path")
    .eq("id", fileId)
    .eq("form_id", params.id)
    .eq("upload_session", session)
    .is("response_id", null)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "File not found" }, { status: 404 });

  await service.storage.from("form-attachments").remove([row.storage_path]).catch(() => {});
  await service.from("form_files").delete().eq("id", row.id);
  return NextResponse.json({ ok: true });
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return cleaned || "file";
}