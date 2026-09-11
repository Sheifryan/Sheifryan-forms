import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Profile + settings update endpoint.
//   PATCH /api/profile  – update full_name, avatar_url, preferences.{theme,language,timezone,notifications}
export async function PATCH(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  const prefs: Record<string, unknown> = {};

  if (typeof body.fullName === "string" && body.fullName.trim()) update.full_name = body.fullName.trim().slice(0, 120);

  // Merge preferences so partial updates don't clobber other settings.
  const { data: existing } = await supabase.from("profiles").select("preferences").eq("id", user.id).maybeSingle();
  const currentPrefs = (existing?.preferences && typeof existing.preferences === "object" ? existing.preferences : {}) as Record<string, unknown>;
  Object.assign(prefs, currentPrefs);

  if (body.preferences && typeof body.preferences === "object") {
    const incoming = body.preferences as Record<string, unknown>;
    if (incoming.theme === "light" || incoming.theme === "dark" || incoming.theme === "system") prefs.theme = incoming.theme;
    if (typeof incoming.language === "string") prefs.language = incoming.language;
    if (typeof incoming.timezone === "string") prefs.timezone = incoming.timezone;
    if (incoming.notifications && typeof incoming.notifications === "object") {
      const notif = (prefs.notifications && typeof prefs.notifications === "object" ? prefs.notifications : {}) as Record<string, unknown>;
      Object.assign(notif, incoming.notifications as Record<string, unknown>);
      prefs.notifications = notif;
    }
  }
  update.preferences = prefs;

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true });

  const { data, error } = await supabase.from("profiles").update(update).eq("id", user.id).select("id, full_name, avatar_url, preferences").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}

// GET returns the current profile + auth email.
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("id, full_name, avatar_url, preferences").eq("id", user.id).maybeSingle();
  return NextResponse.json({ profile, email: user.email, authUser: { id: user.id, email: user.email } });
}