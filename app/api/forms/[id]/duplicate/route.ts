import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Duplicates a form within the same workspace: fresh id, "Copy of" title,
// reset to draft with a bumped schema version so past responses stay tied to
// the original's schema.
export async function POST(_: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: source, error } = await supabase
    .from("forms")
    .select("owner_id, workspace_id, title, description, schema, settings, theme, folder_id, status")
    .eq("id", params.id)
    
    .single();

  if (error || !source) return NextResponse.json({ error: "Form not found" }, { status: 404 });

  const { data, error: insertError } = await supabase
    .from("forms")
    .insert({
      owner_id: user.id,
      workspace_id: source.workspace_id,
      title: `${source.title} (copy)`.slice(0, 120) || "Untitled form (copy)",
      description: source.description,
      schema: source.schema,
      schema_version: 1,
      settings: source.settings,
      theme: source.theme,
      folder_id: source.folder_id,
      status: "draft",
    })
    .select("id")
    .single();

  if (insertError || !data) return NextResponse.json({ error: insertError?.message ?? "Couldn't duplicate form" }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}