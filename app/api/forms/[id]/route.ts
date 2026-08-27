import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashFormPassword } from "@/lib/password";
import type { FormSchema, FormSettings } from "@/lib/schema";

interface UpdateBody {
  title?: string;
  description?: string;
  schema?: FormSchema;
  settings?: FormSettings;
  status?: "draft" | "published" | "closed";
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

  const { data, error } = await supabase
    .from("forms")
    .select("id, owner_id, title, description, schema, schema_version, settings, status, theme, created_at, updated_at")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ form: data });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    const { data: current } = await supabase.from("forms").select("schema_version").eq("id", params.id).eq("owner_id", user.id).single();
    update.schema_version = (current?.schema_version ?? 1) + 1;
  }

  const { error } = await supabase.from("forms").update(update).eq("id", params.id).eq("owner_id", user.id); // RLS also enforces this, belt-and-suspenders

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("forms").delete().eq("id", params.id).eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
