import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WORKSPACE_COOKIE } from "@/lib/workspace-server";
import { authorize } from "@/lib/authz";
import { PERMISSION } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { missingSchemaMessage } from "@/lib/schema-errors";

// POST /api/organisations — create an organisation workspace.
//
// The insert runs through the `create_organisation` RPC because creating the
// workspace and its first (owner) membership row atomically is a bootstrap the
// membership RLS cannot express.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Organisation name is required" }, { status: 400 });

  const { data, error } = await supabase.rpc("create_organisation", {
    p_name: name,
    p_org_type: typeof body.orgType === "string" ? body.orgType : null,
    p_org_size: typeof body.orgSize === "string" ? body.orgSize : null,
    p_country: typeof body.country === "string" ? body.country : null,
    p_industry: typeof body.industry === "string" ? body.industry : null,
    p_slug: typeof body.slug === "string" ? body.slug : null,
    p_logo_url: typeof body.logoUrl === "string" ? body.logoUrl : null,
  });

  if (error) {
    // "Could not find the function public.create_organisation(...) in the schema
    // cache" means the migrations haven't been applied. Say so instead of
    // handing back a raw PostgREST string — 503 marks it as "server not ready",
    // distinguishable from a genuine 400 bad request.
    const friendly = missingSchemaMessage(error);
    return NextResponse.json({ error: friendly ?? error.message }, { status: friendly ? 503 : 400 });
  }

  const workspaceId = data as string;

  // Drop straight into the new organisation.
  const res = NextResponse.json({ ok: true, workspaceId }, { status: 201 });
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

// PATCH /api/organisations — update organisation settings (General tab).
export async function PATCH(request: Request) {
  const auth = await authorize(PERMISSION.ORGANISATION_SETTINGS);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createClient();
  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim().slice(0, 120);
  if (typeof body.description === "string") update.description = body.description.slice(0, 2000);
  if (typeof body.industry === "string") update.industry = body.industry;
  if (typeof body.country === "string") update.country = body.country;
  if (typeof body.timezone === "string") update.timezone = body.timezone;
  if (typeof body.logoUrl === "string") update.logo_url = body.logoUrl;
  if (typeof body.orgType === "string") update.org_type = body.orgType;
  if (typeof body.orgSize === "string") update.org_size = body.orgSize;

  // Security + notification preferences (jsonb, whitelisted keys only — an
  // unknown key would otherwise let a client stuff arbitrary data in here).
  if (body.security && typeof body.security === "object") {
    const s = body.security as Record<string, unknown>;
    const clean: Record<string, unknown> = {};
    if (typeof s.require2fa === "boolean") clean.require2fa = s.require2fa;
    if (typeof s.enforceDomains === "boolean") clean.enforceDomains = s.enforceDomains;
    if (Number.isFinite(Number(s.invitationExpiryDays))) {
      clean.invitationExpiryDays = Math.min(90, Math.max(1, Math.round(Number(s.invitationExpiryDays))));
    }
    if (Number.isFinite(Number(s.sessionTimeoutMinutes))) {
      clean.sessionTimeoutMinutes = Math.min(43200, Math.max(15, Math.round(Number(s.sessionTimeoutMinutes))));
    }
    if (Number.isFinite(Number(s.auditRetentionDays))) {
      clean.auditRetentionDays = Math.min(3650, Math.max(30, Math.round(Number(s.auditRetentionDays))));
    }
    update.security_settings = clean;
  }

  if (body.notifications && typeof body.notifications === "object") {
    const n = body.notifications as Record<string, unknown>;
    const clean: Record<string, unknown> = {};
    for (const key of ["newResponse", "newMember", "invitationAccepted", "weeklyDigest", "storageAlerts", "billingAlerts"]) {
      if (typeof n[key] === "boolean") clean[key] = n[key];
    }
    update.notification_settings = clean;
  }

  // Allowed email domains drive invitation enforcement, so normalise them:
  // lowercase, no "@", no protocol, deduped.
  if (Array.isArray(body.allowedEmailDomains)) {
    const source = body.allowedEmailDomains as unknown[];
    const domains = Array.from(
      new Set(
        source
          .filter((d): d is string => typeof d === "string")
          .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^@/, "").replace(/\/.*$/, ""))
          .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))
      )
    ).slice(0, 50);
    update.allowed_email_domains = domains;
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true });

  const { error } = await supabase.from("workspaces").update(update).eq("id", auth.ctx.workspace.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const securityChanged = "security_settings" in update || "allowed_email_domains" in update;
  await logActivity({
    workspaceId: auth.ctx.workspace.id,
    action: securityChanged ? "workspace.security_updated" : "workspace.updated",
    resourceType: "workspace",
    resourceId: auth.ctx.workspace.id,
    resourceLabel: (update.name as string) ?? auth.ctx.workspace.name,
  });
  return NextResponse.json({ ok: true });
}

// DELETE /api/organisations — owner-only, cascades every resource away.
export async function DELETE() {
  const auth = await authorize(PERMISSION.ORGANISATION_DELETE);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createClient();
  const { error } = await supabase.rpc("delete_organisation", { p_workspace: auth.ctx.workspace.id });
  if (error) {
    const friendly = missingSchemaMessage(error);
    return NextResponse.json({ error: friendly ?? error.message }, { status: friendly ? 503 : 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: WORKSPACE_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
}