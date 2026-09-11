import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { defaultSettings, DEFAULT_THEME, type FormField, type FormSettings } from "@/lib/schema";
import { resolveActiveWorkspace } from "@/lib/workspace-server";
import { logActivity } from "@/lib/activity";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let query = supabase.from("forms").select("id, title, status, updated_at, created_at").order("updated_at", { ascending: false });
  const { workspace } = await resolveActiveWorkspace();
  if (workspace) query = query.eq("workspace_id", workspace.id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ forms: data });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await resolveActiveWorkspace();
  const workspaceId = workspace?.id;

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Untitled form";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const fields: FormField[] = Array.isArray(body.fields) ? body.fields : [];

  // Optional AI-authored settings. Only the confirmation message is accepted on
  // create — everything else is edited through the builder's Settings tab.
  const confirmationMessage =
    typeof body.confirmationMessage === "string" && body.confirmationMessage.trim()
      ? body.confirmationMessage.trim()
      : defaultSettings.confirmationMessage;
  const settings: FormSettings = { ...defaultSettings, confirmationMessage };

  // Optional folder to create the form in. A folder id is only trusted if it
  // belongs to the current user's workspace (folder ids are not globally
  // unique scopes).
  let folder_id: string | null = null;
  if (typeof body.folderId === "string" && body.folderId) {
    let ownedQuery = supabase.from("folders").select("id").eq("id", body.folderId);
    if (workspaceId) ownedQuery = ownedQuery.eq("workspace_id", workspaceId);
    const { data: owned } = await ownedQuery.maybeSingle();
    if (owned) folder_id = owned.id;
  }

  const insert: Record<string, unknown> = {
    owner_id: user.id,
    title,
    description: description || null,
    schema: { fields },
    settings,
    theme: DEFAULT_THEME,
    folder_id,
  };
  if (workspaceId) insert.workspace_id = workspaceId;

  const { data, error } = await supabase.from("forms").insert(insert).select("id").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit trail (organisation feed). Never blocks the create.
  if (workspaceId) {
    await logActivity({
      workspaceId,
      action: "form.created",
      resourceType: "form",
      resourceId: data.id,
      resourceLabel: title,
    });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
