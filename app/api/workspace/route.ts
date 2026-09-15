import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveWorkspace } from "@/lib/workspace-server";
import { planById } from "@/lib/plans";

// Current personal workspace + profile. GET returns the pair; PATCH updates
// workspace-level fields (name, plan, onboarding completion).
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("id, name, kind, plan, credits_balance, storage_quota_bytes, onboarded_at, created_at")
    .eq("owner_id", user.id)
    .eq("kind", "personal")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: profile } = await supabase.from("profiles").select("id, full_name, avatar_url, preferences").eq("id", user.id).maybeSingle();

  return NextResponse.json({ workspace, profile, user: { email: user.email, fullName: user.user_metadata?.full_name } });
}

export async function PATCH(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  if (typeof body.name === "string" && body.name.trim() && body.name.trim().length <= 80) {
    update.name = body.name.trim();
  }
  if (typeof body.plan === "string" && ["free", "pro", "premium"].includes(body.plan)) {
    const limits = planById(body.plan).limits;
    if (limits.forms >= 0) {
      // Protected downgrades are handled by the billing route (usage check).
      // Here we accept owner-initiated plan changes directly.
    }
    update.plan = body.plan;
  }
  if (body.completeOnboarding === true) {
    update.onboarded_at = new Date().toISOString();
  }

  // Onboarding must complete for the workspace the user is actually in. The
  // dashboard banner is driven by THAT workspace's onboarded_at, so writing only
  // the personal workspace (the old behaviour) left the banner stuck forever
  // inside an organisation, with no way to dismiss it. Fall back to the personal
  // workspace when nothing is resolved (pre-migration databases).
  const { workspace: activeWs } = await resolveActiveWorkspace();
  const targetId = activeWs?.id ?? null;

  const applyUpdate = () => {
    const q = supabase
      .from("workspaces")
      .update(update)
      .select("id, name, kind, plan, credits_balance, storage_quota_bytes, onboarded_at, created_at");
    return (targetId ? q.eq("id", targetId) : q.eq("owner_id", user.id).eq("kind", "personal")).single();
  };

  let { data, error } = await applyUpdate();

  // RLS rejects the update when the caller's owner membership row is missing or
  // inactive (the pre-0018 lockout), which is why "complete onboarding" used to
  // look like it saved and then reappear. Self-heal once, then retry.
  if (error) {
    try {
      await supabase.rpc("ensure_own_memberships");
    } catch {
      // pre-0017 databases have no such RPC
    }
    ({ data, error } = await applyUpdate());
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workspace: data });
}

// Danger zone: wipe the personal workspace (all its resources cascade away).
export async function DELETE() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("workspaces")
    .delete()
    .eq("owner_id", user.id)
    .eq("kind", "personal")
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: Boolean(data) });
}