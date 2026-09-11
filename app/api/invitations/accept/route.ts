import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WORKSPACE_COOKIE } from "@/lib/workspace-server";
import { missingSchemaMessage } from "@/lib/schema-errors";

// POST /api/invitations/accept — joins the signed-in user to the workspace.
//
// The membership write happens inside the `accept_invitation` RPC because the
// membership RLS requires `members.invite`, which an invitee does not yet hold.
// The RPC re-validates the token, expiry and that the invitation email matches
// the caller before writing anything.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : null;
  if (!token) return NextResponse.json({ error: "Invitation token is required" }, { status: 400 });

  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) {
    const friendly = missingSchemaMessage(error);
    return NextResponse.json({ error: friendly ?? error.message }, { status: friendly ? 503 : 400 });
  }

  const workspaceId = data as string;
  const res = NextResponse.json({ ok: true, workspaceId });
  res.cookies.set({
    name: WORKSPACE_COOKIE,
    value: workspaceId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}