import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { PermissionDenied } from "@/components/PermissionDenied";
import { resolveActiveWorkspace, resolveProfile, isOrganisation } from "@/lib/workspace-server";
import { can, PERMISSION, type MemberLike } from "@/lib/permissions";
import { MembersClient } from "./MembersClient";

export default async function MembersPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { workspace, membership } = await resolveActiveWorkspace();
  const { profile } = await resolveProfile();

  // Members management only exists inside an organisation workspace.
  if (!workspace || !isOrganisation(workspace)) redirect("/dashboard");

  const member: MemberLike = membership
    ? { role: membership.role, status: membership.status, permissions: membership.permissions }
    : { role: "owner", status: "active" };

  const shellUser = { email: user.email, fullName: profile?.full_name || (user.user_metadata?.full_name as string) };
  const shellWs = { name: workspace.name, plan: workspace.plan };

  // Viewers/editors can't manage members — show a clear, non-punitive state.
  if (!can(member, PERMISSION.MEMBERS_INVITE)) {
    return (
      <AppShell active="members" title="Members" user={shellUser} workspace={shellWs}>
        <PermissionDenied
          title="Member management is restricted"
          description="Only owners and admins can view or change team membership in this organisation."
        />
      </AppShell>
    );
  }

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("id, user_id, role, status, joined_at, last_active_at, email")
    .eq("workspace_id", workspace.id)
    .order("joined_at", { ascending: true, nullsFirst: false });

  const userIds = (memberRows ?? []).map((m) => m.user_id);
  const profileById: Record<string, string | null> = {};
  if (userIds.length > 0) {
    const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
    (profs ?? []).forEach((p) => {
      profileById[p.id] = p.full_name;
    });
  }

  const { data: invitations } = await supabase
    .from("workspace_invitations")
    .select("id, email, role, status, expires_at, created_at")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false });

  return (
    <AppShell active="members" title="Members" user={shellUser} workspace={shellWs}>
      <MembersClient
        members={(memberRows ?? []).map((m) => ({
          id: m.id,
          userId: m.user_id,
          name: profileById[m.user_id] ?? null,
          email: m.email,
          role: m.role,
          status: m.status,
          joinedAt: m.joined_at,
          lastActiveAt: m.last_active_at,
        }))}
        invitations={(invitations ?? []).map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          status: i.status,
          expiresAt: i.expires_at,
          createdAt: i.created_at,
        }))}
        currentUserId={user.id}
        currentRole={member.role}
      />
    </AppShell>
  );
}