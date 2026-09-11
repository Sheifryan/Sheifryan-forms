import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorize } from "@/lib/authz";
import { PERMISSION } from "@/lib/permissions";
import { missingSchemaMessage } from "@/lib/schema-errors";

// POST /api/organisations/transfer — hand ownership to another active member.
//
// Runs through the `transfer_ownership` RPC: the workspace has a partial unique
// index allowing one owner, so the incumbent must be demoted in the same
// transaction as the successor is promoted.
export async function POST(request: Request) {
  const auth = await authorize(PERMISSION.ORGANISATION_TRANSFER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createClient();
  const body = await request.json().catch(() => ({}));
  const toUserId = typeof body.userId === "string" ? body.userId : null;
  if (!toUserId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const { error } = await supabase.rpc("transfer_ownership", {
    p_workspace: auth.ctx.workspace.id,
    p_to_user: toUserId,
  });
  if (error) {
    const friendly = missingSchemaMessage(error);
    return NextResponse.json({ error: friendly ?? error.message }, { status: friendly ? 503 : 400 });
  }

  return NextResponse.json({ ok: true });
}