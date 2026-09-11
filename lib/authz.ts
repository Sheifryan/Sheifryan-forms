import { resolveActiveWorkspace, type MembershipRow, type WorkspaceRow } from "@/lib/workspace-server";
import { can, type MemberLike, type Permission } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Server-side authorization.
//
// Every API route resolves the active workspace and asserts a permission key
// BEFORE touching data. UI gating is cosmetic; this is the enforcement point
// (RLS backs it at the database).
//
// Order, as specified:
//   1. authenticate
//   2. resolve the active workspace
//   3. confirm membership (active)
//   4. confirm the permission
// ---------------------------------------------------------------------------

export interface AuthContext {
  userId: string;
  workspace: WorkspaceRow;
  membership: MembershipRow | null;
  /** Membership presented to the permission engine. */
  member: MemberLike;
}

export type AuthResult = { ok: true; ctx: AuthContext } | { ok: false; status: number; error: string };

/**
 * Authenticate + authorize the current request.
 *
 * Pre-0012 databases have no workspace_members rows; a user's own personal
 * workspace is then treated as owner-equivalent so existing flows keep working.
 */
export async function authorize(permission?: Permission): Promise<AuthResult> {
  const { workspace, membership } = await resolveActiveWorkspace();

  // No workspace at all means either not signed in or nothing provisioned yet.
  if (!workspace) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  // Organisation workspaces require a real, active membership.
  if (!membership && workspace.kind !== "personal") {
    return { ok: false, status: 403, error: "You don't have access to this workspace." };
  }

  if (membership && membership.status !== "active") {
    return { ok: false, status: 403, error: "Your access to this workspace is suspended." };
  }

  // Pre-migration personal workspace: the owner holds every permission.
  const member: MemberLike = membership
    ? { role: membership.role, status: membership.status, permissions: membership.permissions }
    : { role: "owner", status: "active" };

  if (permission && !can(member, permission)) {
    return { ok: false, status: 403, error: "You don't have permission to do that." };
  }

  // Best-effort "last active" stamp (never blocks the request).
  return {
    ok: true,
    ctx: {
      userId: membership?.user_id ?? workspace.owner_id ?? "",
      workspace,
      membership,
      member,
    },
  };
}

/** True when the supplied workspace id is the one this request is acting in. */
export function isActiveWorkspace(ctx: AuthContext, workspaceId: string | null | undefined): boolean {
  return Boolean(workspaceId) && ctx.workspace.id === workspaceId;
}
