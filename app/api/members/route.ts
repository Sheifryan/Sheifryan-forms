import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { authorize } from "@/lib/authz";
import { PERMISSION } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

const INVITABLE_ROLES = ["admin", "editor", "viewer"] as const;

function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// GET /api/members — members + pending invitations for the active workspace.
export async function GET() {
  const auth = await authorize(PERMISSION.MEMBERS_INVITE);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createClient();
  const workspaceId = auth.ctx.workspace.id;

  const { data: members, error } = await supabase
    .from("workspace_members")
    .select("id, user_id, role, status, permissions, joined_at, last_active_at, email")
    .eq("workspace_id", workspaceId)
    .order("joined_at", { ascending: true, nullsFirst: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with display profiles (allowed by the co-member RLS policy).
  const userIds = (members ?? []).map((m) => m.user_id);
  const profileById: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
  if (userIds.length > 0) {
    const { data: profs } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds);
    (profs ?? []).forEach((p) => {
      profileById[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url };
    });
  }

  const { data: invitations } = await supabase
    .from("workspace_invitations")
    .select("id, email, role, status, expires_at, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    members: (members ?? []).map((m) => ({
      id: m.id,
      userId: m.user_id,
      email: m.email,
      name: profileById[m.user_id]?.full_name ?? null,
      avatarUrl: profileById[m.user_id]?.avatar_url ?? null,
      role: m.role,
      status: m.status,
      joinedAt: m.joined_at,
      lastActiveAt: m.last_active_at,
    })),
    invitations: invitations ?? [],
  });
}

// POST /api/members — invite someone by email.
export async function POST(request: Request) {
  const auth = await authorize(PERMISSION.MEMBERS_INVITE);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createClient();
  const workspaceId = auth.ctx.workspace.id;
  const body = await request.json().catch(() => ({}));
  const email = isEmail(body.email) ? body.email.trim().toLowerCase() : null;
  const role = INVITABLE_ROLES.includes(body.role) ? (body.role as string) : "viewer";

  if (!email) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });

  // Domain allow-list (Settings → Security). Empty means "no restriction".
  // Enforced here rather than in the UI so the rule holds for direct API use.
  const domain = email.split("@")[1] ?? "";
  const { data: domainRow } = await supabase.from("workspaces").select("allowed_email_domains").eq("id", workspaceId).maybeSingle();
  const allowed = ((domainRow?.allowed_email_domains ?? []) as string[]).filter(Boolean);
  if (allowed.length > 0 && !allowed.includes(domain)) {
    return NextResponse.json({ error: `Only ${allowed.join(", ")} addresses can be invited to this organisation.` }, { status: 403 });
  }

  const { data: existingMember } = await supabase.from("workspace_members").select("id").eq("workspace_id", workspaceId).eq("email", email).maybeSingle();
  if (existingMember) return NextResponse.json({ error: "That person is already a member" }, { status: 409 });

  const { data: existingInvite } = await supabase
    .from("workspace_invitations")
    .select("id")
    .eq("workspace_id", workspaceId)
    .ilike("email", email)
    .eq("status", "pending")
    .maybeSingle();
  if (existingInvite) return NextResponse.json({ error: "There's already a pending invitation for that email" }, { status: 409 });

  const { data: created, error } = await supabase
    .from("workspace_invitations")
    .insert({ workspace_id: workspaceId, email, role, token: randomUUID(), invited_by: auth.ctx.userId })
    .select("id, email, role, token, expires_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    workspaceId,
    action: "member.invited",
    resourceType: "member",
    resourceId: created.id,
    resourceLabel: email,
    metadata: { role },
  });

  // The invite link is what the UI shares (no email provider is wired up yet).
  return NextResponse.json({ ok: true, invitation: created, inviteUrl: `/invite/${created.token}` }, { status: 201 });
}

// PATCH /api/members — change a member's role/status, or resend an invitation.
export async function PATCH(request: Request) {
  const auth = await authorize(PERMISSION.MEMBERS_MANAGE_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createClient();
  const workspaceId = auth.ctx.workspace.id;
  const body = await request.json().catch(() => ({}));

  // Resend an invitation → extend its expiry.
  if (typeof body.invitationId === "string") {
    const { error } = await supabase
      .from("workspace_invitations")
      .update({ expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() })
      .eq("id", body.invitationId)
      .eq("workspace_id", workspaceId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (typeof body.memberId !== "string") return NextResponse.json({ error: "memberId is required" }, { status: 400 });

  const { data: target } = await supabase
    .from("workspace_members")
    .select("id, user_id, role, status")
    .eq("id", body.memberId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Guard rails: ownership never changes here, and only the owner may promote
  // someone to admin.
  if (target.role === "owner" || body.role === "owner") {
    return NextResponse.json({ error: "Ownership changes go through Transfer ownership." }, { status: 409 });
  }
  if (body.role === "admin" && auth.ctx.member.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can promote someone to admin." }, { status: 403 });
  }

  const update: Record<string, unknown> = {};
  if (INVITABLE_ROLES.includes(body.role)) update.role = body.role;
  if (body.status === "active" || body.status === "suspended") update.status = body.status;

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true });

  const { error } = await supabase.from("workspace_members").update(update).eq("id", target.id).eq("workspace_id", workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    workspaceId,
    action: update.status === "suspended" ? "member.suspended" : update.status === "active" ? "member.reactivated" : "member.role_changed",
    resourceType: "member",
    resourceId: target.id,
    metadata: update,
  });
  return NextResponse.json({ ok: true });
}

// DELETE /api/members?memberId=… | ?invitationId=…
export async function DELETE(request: Request) {
  const auth = await authorize(PERMISSION.MEMBERS_REMOVE);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createClient();
  const workspaceId = auth.ctx.workspace.id;
  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get("memberId");
  const invitationId = searchParams.get("invitationId");

  if (invitationId) {
    const { error } = await supabase.from("workspace_invitations").update({ status: "revoked" }).eq("id", invitationId).eq("workspace_id", workspaceId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!memberId) return NextResponse.json({ error: "memberId or invitationId is required" }, { status: 400 });

  const { data: target } = await supabase.from("workspace_members").select("id, user_id, role").eq("id", memberId).eq("workspace_id", workspaceId).maybeSingle();
  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (target.role === "owner") return NextResponse.json({ error: "The owner can't be removed. Transfer ownership first." }, { status: 409 });

  const { error } = await supabase.from("workspace_members").delete().eq("id", target.id).eq("workspace_id", workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({ workspaceId, action: "member.removed", resourceType: "member", resourceId: target.id });
  return NextResponse.json({ ok: true });
}