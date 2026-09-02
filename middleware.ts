import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Missing env vars are a deployment misconfiguration (e.g. they weren't
  // added in the hosting dashboard). Never take the whole site down with an
  // unhandled throw here — pass the request through untouched instead so the
  // page can load. Auth-gated routes will handle the missing session on their
  // own. The dashboard logs will show exactly which variable is missing.
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      `[middleware] Supabase env vars missing (URL: ${Boolean(supabaseUrl)}, ANON_KEY: ${Boolean(
        supabaseAnonKey
      )}). Request passed through without session refresh. Add both to Vercel → Settings → Environment Variables.`
    );
    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: Record<string, unknown>) {
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|widgets/|f/).*)"],
};
