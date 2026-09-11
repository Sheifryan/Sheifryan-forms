// ---------------------------------------------------------------------------
// Permission-based access control.
//
// UI components must NEVER branch on role names — they branch on permissions
// (e.g. `can(member, PERMISSION.FORMS_DELETE)`), so custom roles and per-member
// overrides work without touching any component.
//
// This mirrors the `role_permissions` table seeded in migration
// 0012_org_workspaces.sql. Keep the two in sync.
//
// Client-safe: no server-only imports here (lib/authz.ts holds the server
// guards, lib/workspace-server.ts the DB access).
// ---------------------------------------------------------------------------

export const PERMISSION = {
  FORMS_CREATE: "forms.create",
  FORMS_READ: "forms.read",
  FORMS_UPDATE: "forms.update",
  FORMS_DELETE: "forms.delete",
  FORMS_PUBLISH: "forms.publish",

  RESPONSES_READ: "responses.read",
  RESPONSES_UPDATE: "responses.update",
  RESPONSES_DELETE: "responses.delete",
  RESPONSES_EXPORT: "responses.export",

  MEMBERS_INVITE: "members.invite",
  MEMBERS_REMOVE: "members.remove",
  MEMBERS_MANAGE_ROLES: "members.manage_roles",

  WORKFLOWS_CREATE: "workflows.create",
  WORKFLOWS_UPDATE: "workflows.update",
  WORKFLOWS_DELETE: "workflows.delete",

  FILES_READ: "files.read",
  FILES_DELETE: "files.delete",

  ANALYTICS_VIEW: "analytics.view",
  ACTIVITY_VIEW: "activity.view",

  BILLING_VIEW: "billing.view",
  BILLING_MANAGE: "billing.manage",

  ORGANISATION_SETTINGS: "organisation.settings",
  ORGANISATION_TRANSFER: "organisation.transfer",
  ORGANISATION_DELETE: "organisation.delete",
} as const;

export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION];

export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

export const WORKSPACE_ROLES: WorkspaceRole[] = ["owner", "admin", "editor", "viewer"];

export const ADMIN_ROLES: WorkspaceRole[] = ["owner", "admin"];

/** The permission each built-in role grants. Mirrors `role_permissions` (0012). */
export const ROLE_PERMISSIONS: Record<WorkspaceRole, Permission[]> = {
  owner: Object.values(PERMISSION),
  admin: [
    PERMISSION.FORMS_CREATE,
    PERMISSION.FORMS_READ,
    PERMISSION.FORMS_UPDATE,
    PERMISSION.FORMS_DELETE,
    PERMISSION.FORMS_PUBLISH,
    PERMISSION.RESPONSES_READ,
    PERMISSION.RESPONSES_UPDATE,
    PERMISSION.RESPONSES_DELETE,
    PERMISSION.RESPONSES_EXPORT,
    PERMISSION.MEMBERS_INVITE,
    PERMISSION.MEMBERS_REMOVE,
    PERMISSION.MEMBERS_MANAGE_ROLES,
    PERMISSION.WORKFLOWS_CREATE,
    PERMISSION.WORKFLOWS_UPDATE,
    PERMISSION.WORKFLOWS_DELETE,
    PERMISSION.FILES_READ,
    PERMISSION.FILES_DELETE,
    PERMISSION.ANALYTICS_VIEW,
    PERMISSION.ACTIVITY_VIEW,
    PERMISSION.BILLING_VIEW,
    PERMISSION.ORGANISATION_SETTINGS,
  ],
  editor: [
    PERMISSION.FORMS_CREATE,
    PERMISSION.FORMS_READ,
    PERMISSION.FORMS_UPDATE,
    PERMISSION.FORMS_PUBLISH,
    PERMISSION.RESPONSES_READ,
    PERMISSION.RESPONSES_EXPORT,
    PERMISSION.WORKFLOWS_CREATE,
    PERMISSION.WORKFLOWS_UPDATE,
    PERMISSION.FILES_READ,
    PERMISSION.ANALYTICS_VIEW,
  ],
  viewer: [
    PERMISSION.FORMS_READ,
    PERMISSION.RESPONSES_READ,
    PERMISSION.FILES_READ,
    PERMISSION.ANALYTICS_VIEW,
  ],
};

/** Extra grants / revocations stored per member (custom-role groundwork). */
export interface MemberPermissionsOverride {
  grant?: string[];
  revoke?: string[];
}

/** The minimum shape needed to evaluate access for a member. */
export interface MemberLike {
  role: string;
  status?: string;
  permissions?: MemberPermissionsOverride | null;
}

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === "string" && (WORKSPACE_ROLES as string[]).includes(value);
}

/** Permissions a role grants, before per-member overrides. */
export function rolePermissions(role: string): Permission[] {
  return isWorkspaceRole(role) ? ROLE_PERMISSIONS[role] : [];
}

export function roleHasPermission(role: string, permission: Permission): boolean {
  return rolePermissions(role).includes(permission);
}

/**
 * Evaluate a permission for a member, honouring:
 *   1. suspended/invited members hold nothing
 *   2. per-member `revoke` beats everything
 *   3. per-member `grant` adds to the role
 *   4. otherwise the role matrix applies
 */
export function can(member: MemberLike | null | undefined, permission: Permission): boolean {
  if (!member) return false;
  if (member.status && member.status !== "active") return false;

  const override = member.permissions ?? undefined;
  if (override?.revoke?.includes(permission)) return false;
  if (override?.grant?.includes(permission)) return true;

  return roleHasPermission(member.role, permission);
}

export function canAny(member: MemberLike | null | undefined, permissions: Permission[]): boolean {
  return permissions.some((p) => can(member, p));
}

// ---------------------------------------------------------------------------
// Per-form access (form_members, 0013_org_collaboration.sql).
//
// The organisation role still applies on top; a form-level row only ever
// *narrows* access (a viewer in the org can't become an editor on one form).
// The four booleans are denormalised onto form_members so RLS helpers can
// answer without a join.
// ---------------------------------------------------------------------------

export type FormAccessLevel = "viewer" | "editor" | "owner";

export const FORM_ACCESS_LEVELS: FormAccessLevel[] = ["viewer", "editor", "owner"];

export const FORM_ACCESS_LABELS: Record<FormAccessLevel, string> = {
  viewer: "Viewer",
  editor: "Editor",
  owner: "Manager",
};

export const FORM_ACCESS_FLAGS: Record<
  FormAccessLevel,
  { can_edit: boolean; can_view_responses: boolean; can_manage: boolean; can_view_analytics: boolean }
> = {
  viewer: { can_edit: false, can_view_responses: true, can_manage: false, can_view_analytics: true },
  editor: { can_edit: true, can_view_responses: true, can_manage: false, can_view_analytics: true },
  owner: { can_edit: true, can_view_responses: true, can_manage: true, can_view_analytics: true },
};

export function isFormAccessLevel(value: unknown): value is FormAccessLevel {
  return typeof value === "string" && (FORM_ACCESS_LEVELS as string[]).includes(value);
}

/** The per-form flags implied by each access level, ready for an upsert. */
export function formAccessFlags(level: FormAccessLevel) {
  return FORM_ACCESS_FLAGS[level];
}

/**
 * True when a form-level row grants at least this level. Used in the UI to
 * decide whether "Manage access" is offered.
 */
export function formLevelAtLeast(level: string | null | undefined, required: FormAccessLevel): boolean {
  const order: FormAccessLevel[] = ["viewer", "editor", "owner"];
  const have = order.indexOf(isFormAccessLevel(level) ? level : "viewer");
  return have >= order.indexOf(required);
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** Display metadata for role chips/selects. */
export const ROLE_META: Record<WorkspaceRole, { label: string; description: string; chip: string }> = {
  owner: {
    label: "Owner",
    description: "Full access, including billing, ownership transfer and deletion.",
    chip: "bg-accent2/15 text-accent2",
  },
  admin: {
    label: "Admin",
    description: "Manages members, forms, responses and workflows. No billing control.",
    chip: "bg-signalSoft/25 text-signal",
  },
  editor: {
    label: "Editor",
    description: "Creates and edits forms, views responses, builds workflows.",
    chip: "bg-sky-100 text-sky-700",
  },
  viewer: {
    label: "Viewer",
    description: "Read-only access to forms, responses and analytics.",
    chip: "bg-paper text-slate-500 dark:bg-panelDark dark:text-mutedDark",
  },
};