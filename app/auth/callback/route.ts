import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase's post-confirmation redirect lands here with ?code=xxxxx. This
// route exchanges the one-time code for a real session (setting the auth
// cookies), then redirects into the app. Without this, the code sits in
// the URL unused and every page still sees the visitor as logged out.
// It's used for the email-confirmation (signup) flow and password resets.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Code missing or invalid/expired — send back to login with a flag the
  // login page can use to show a "link expired, try again" message.
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
