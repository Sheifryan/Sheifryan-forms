import { createClient } from "@/lib/supabase/server";

/**
 * "Is a visitor signed in?" — for the public marketing pages.
 *
 * Deliberately total: a deployment with missing Supabase env vars, or a
 * Supabase outage, must still render the landing page to an anonymous visitor
 * rather than throwing a 500 on the one page a stranger sees first.
 * (lib/supabase/server.ts throws when the env vars are absent, and the
 * middleware only guards its own session refresh.)
 */
export async function isSignedIn(): Promise<boolean> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return false;
  }
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}
