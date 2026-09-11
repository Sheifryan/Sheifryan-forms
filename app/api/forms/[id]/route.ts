import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { hashFormPassword } from "@/lib/password";
import type { FormSchema, FormSettings } from "@/lib/schema";
import { resolveActiveWorkspace } from "@/lib/workspace-server";
import { logActivity } from "@/lib/activity";

interface UpdateBody {
  title?: string;
  description?: string;
  schema?: FormSchema;
  settings?: FormSettings;
  status?: "draft" | "published" | "closed" | "archived";
  theme?: string;
  folderId?: string | null;
  password?: string; // write-only — never read back; hashed before storage
  bumpVersion?: boolean;
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await resolveActiveWorkspace();

  // RLS restricts this row to forms in workspaces the caller belongs to; the
  // active-workspace filter additionally stops cross-workspace mixing.
  let getQuery = supabase
    .from("forms")
    .select("id, owner_id, workspace_id, title, description, schema, schema_version, settings, status, theme, created_at, updated_at")
    .eq("id", params.id);
  if (workspace?.id) getQuery = getQuery.eq("workspace_id", workspace.id);
  const { data, error } = await getQuery.single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ form: data });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await resolveActiveWorkspace();

  const body: UpdateBody = await request.json().catch(() => ({}));

  const update: Record<string, unknown> = {};
  if (body.title !== undefined) update.title = body.title;
  if (body.description !== undefined) update.description = body.description;
  if (body.schema !== undefined) update.schema = body.schema;
  if (body.settings !== undefined) update.settings = body.settings;
  if (body.status !== undefined) update.status = body.status;
  if (body.theme !== undefined) update.theme = body.theme;
  if (body.folderId !== undefined) update.folder_id = body.folderId;

  // Password is write-only: hash it here so the plaintext never touches the
  // database (or this response). An empty string is treated as "no change"
  // — clearing the password happens by turning settings.passwordProtected
  // off, not by wiping the stored hash.
  if (body.password) {
    update.password_hash = hashFormPassword(params.id, body.password);
  }

  // Bump schema_version whenever the field structure changes, so existing
  // responses stay tied to the shape they were actually submitted against.
  if (body.bumpVersion) {
    let currentQuery = supabase.from("forms").select("schema_version").eq("id", params.id);
    if (workspace?.id) currentQuery = currentQuery.eq("workspace_id", workspace.id);
    const { data: current } = await currentQuery.single();
    update.schema_version = (current?.schema_version ?? 1) + 1;
  }

  let updateQuery = supabase.from("forms").update(update).eq("id", params.id);
  if (workspace?.id) updateQuery = updateQuery.eq("workspace_id", workspace.id);
  const { error } = await updateQuery; // RLS enforces workspace membership + permission

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Record status transitions in the organisation activity feed.
  if (body.status && workspace?.id) {
    const action =
      body.status === "published" ? "form.published" : body.status === "draft" ? "form.unpublished" : "form.updated";
    await logActivity({
      workspaceId: workspace.id,
      action,
      resourceType: "form",
      resourceId: params.id,
      resourceLabel: typeof body.title === "string" ? body.title : null,
      metadata: { status: body.status },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await resolveActiveWorkspace();

  // Remove the actual S3 objects before dropping the form — the DB rows
  // cascade away with the form, but the storage bucket won't clean itself.
  const service = createServiceClient();
  const { data: files } = await service
    .from("form_files")
    .select("storage_path")
    .eq("form_id", params.id);
  const paths = ((files ?? []) as { storage_path: string }[]).map((f) => f.storage_path);
  if (paths.length > 0) {
    await service.storage.from("form-attachments").remove(paths).catch((e: unknown) => {
      console.error(`[forms] Couldn't remove storage objects for form ${params.id}:`, e);
    });
  }

  let deleteQuery = supabase.from("forms").delete().eq("id", params.id);
  if (workspace?.id) deleteQuery = deleteQuery.eq("workspace_id", workspace.id);
  const { error } = await deleteQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (workspace?.id) {
    await logActivity({ workspaceId: workspace.id, action: "form.deleted", resourceType: "form", resourceId: params.id });
  }
  return NextResponse.json({ ok: true });
}
