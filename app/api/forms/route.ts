import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { defaultSettings, DEFAULT_THEME, type FormField } from "@/lib/schema";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("forms")
    .select("id, title, status, updated_at, created_at")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ forms: data });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Untitled form";
  const fields: FormField[] = Array.isArray(body.fields) ? body.fields : [];

  const { data, error } = await supabase
    .from("forms")
    .insert({
      owner_id: user.id,
      title,
      schema: { fields },
      settings: defaultSettings,
      theme: DEFAULT_THEME,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
