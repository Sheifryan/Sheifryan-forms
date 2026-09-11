import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WORKSPACE_COOKIE, resolveMembership } from "@/lib/workspace-server";

// Switches the active workspace by setting the `nibble_ws` cookie.
//
// The cookie is only a hint: every subsequent request re-validates an ACTIVE
// membership before honouring it, so a forged cookie can never reach another
// workspace's data.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : null;
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });

  const membership = await resolveMembership(workspaceId);
  if (!membership || membership.status !== "active") {
    return NextResponse.json({ error: "You don't have access to that workspace." }, { status: 403 });
  }

  // Best-effort "last active" stamp via the safe SECURITY DEFINER helper —
  // never blocks the switch.
  try {
    await supabase.rpc("touch_my_membership", { ws: workspaceId });
  } catch {
    // ignore (pre-0013 databases have no such RPC)
  }

  const res = NextResponse.json({ ok: true, workspaceId });
  res.cookies.set({
    name: WORKSPACE_COOKIE,
    value: workspaceId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  return res;
}

/** Clears the active-workspace hint (falls back to the personal workspace). */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: WORKSPACE_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
}