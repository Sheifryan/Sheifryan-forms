import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { FormSchema, FormSettings, ThemeKey } from "@/lib/schema";
import { THEMES, DEFAULT_THEME } from "@/lib/schema";

// Public embed metadata for the /widgets/form.html widget. Mirrors the
// info the /f/[id] page shows, but as JSON so the static widget can render
// live without an iframe-into-our-app. Only published forms resolve (same
// as the public page) and never includes password_hash, webhooks (or
// signing secrets) or notifyEmail — those never leave the server.
// Revalidate periodically so edits made in the builder show up quickly.
export const revalidate = 60;

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: form } = await supabase
    .from("forms")
    .select("id, title, description, schema, status, settings, theme")
    .eq("id", params.id)
    .single();

  // Same posture as the public /f page: non-published forms 404.
  if (!form || form.status !== "published") {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  const settings = (form.settings as FormSettings) ?? ({} as FormSettings);
  const themeKey = (form.theme as ThemeKey) ?? DEFAULT_THEME;
  const accent = THEMES[themeKey]?.hex ?? THEMES[DEFAULT_THEME].hex;

  // Closure conditions are computed server-side so the widget can show a
  // clear message instead of a form that would reject on submit. Same
  // logic as the /f page and the submit route.
  let closedReason: string | null = null;
  if (settings?.closeOnDate && settings.closeDate) {
    const closeAt = new Date(settings.closeDate + "T23:59:59");
    if (Date.now() > closeAt.getTime()) closedReason = "This form is no longer accepting responses.";
  }
  if (!closedReason && settings?.limitResponses && settings.maxResponses) {
    const { count } = await supabase
      .from("responses")
      .select("id", { count: "exact", head: true })
      .eq("form_id", form.id);
    if ((count ?? 0) >= settings.maxResponses) closedReason = "This form has reached its response limit.";
  }

  // Only the display-level settings the widget needs. Duplicated here
  // (it's not worth crossing a shared serialization helper for two spots).
  const publicSettings = {
    confirmationMessage: settings?.confirmationMessage ?? "",
    redirectUrl: settings?.redirectUrl || undefined,
  };

  return NextResponse.json({
    id: form.id,
    title: form.title,
    description: form.description ?? "",
    schema: (form.schema as FormSchema) ?? { fields: [] },
    theme: themeKey,
    accent,
    passwordProtected: Boolean(settings?.passwordProtected),
    closedReason,
    settings: publicSettings,
  });
}
