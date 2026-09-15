import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Workspace resolution for Personal Accounts (server-only).
// Every authenticated user owns exactly one Personal Workspace. These helpers
// fetch it (auto-creating when a pre-migration user shows up) and expose the
// wallet/billing fields the shell + pages need.
//
// `available` is false when the deployed database hasn't been migrated yet —
// callers then fall back to owner-scoped queries so nothing crashes.
// ---------------------------------------------------------------------------

export interface WorkspaceRow {
  id: string;
  name: string;
  kind: "personal" | "business";
  plan: "free" | "pro" | "premium" | "starter" | "business" | "enterprise";
  credits_balance: number;
  storage_quota_bytes: number;
  onboarded_at: string | null;
  created_at: string;
  // Organisation profile (null for personal workspaces)
  slug?: string | null;
  logo_url?: string | null;
  org_type?: string | null;
  org_size?: string | null;
  country?: string | null;
  industry?: string | null;
  description?: string | null;
  timezone?: string | null;
  created_by?: string | null;
  owner_id?: string | null;
}

/** A workspace plus the caller's role in it, for the workspace switcher. */
export interface WorkspaceSummary {
  id: string;
  name: string;
  kind: "personal" | "business";
  slug: string | null;
  logo_url: string | null;
  plan: string;
  role: string;
  status: string;
  credits_balance: number;
}

/** Membership row for the active workspace. */
export interface MembershipRow {
  id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  status: string;
  permissions: { grant?: string[]; revoke?: string[] } | null;
  joined_at: string | null;
  last_active_at: string | null;
}

/** Cookie holding the active workspace id (a hint — always re-validated). */
export const WORKSPACE_COOKIE = "nibble_ws";

export function isOrganisation(workspace: { kind?: string | null } | null | undefined): boolean {
  return workspace?.kind === "business";
}

export interface ProfileRow {
  id: string;
  full_name: string;
  avatar_url: string | null;
  preferences: {
    theme?: "light" | "dark" | "system";
    language?: string;
    timezone?: string;
    notifications?: {
      responses?: boolean;
      weekly?: boolean;
      usage?: boolean;
      workflowFailures?: boolean;
    };
    [key: string]: unknown;
  };
}

export async function resolveWorkspace(): Promise<{ workspace: WorkspaceRow | null; available: boolean }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { workspace: null, available: false };

  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, kind, plan, credits_balance, storage_quota_bytes, onboarded_at, created_at")
    .eq("owner_id", user.id)
    .eq("kind", "personal")
    .maybeSingle();

  if (error) return { workspace: null, available: false }; // migration not applied yet
  if (data) return { workspace: data as WorkspaceRow, available: true };

  // Pre-migration user without a workspace row — provision one now.
  const rawName = ((user.user_metadata?.full_name as string) ?? "").trim();
  const first = rawName.split(/\s+/)[0] || "My";
  const name = `${first}'s Workspace`;
  const { data: created, error: createError } = await supabase
    .from("workspaces")
    .insert({
      owner_id: user.id,
      // created_by is required by 0012's `users create own workspaces` check
      // (owner_id = auth.uid() and created_by = auth.uid()). Without it this
      // insert could never succeed and provisioning relied purely on a heal.
      created_by: user.id,
      name,
      kind: "personal",
      plan: "free",
      credits_balance: 500,
      storage_quota_bytes: 5368709120,
    })
    .select("id, name, kind, plan, credits_balance, storage_quota_bytes, onboarded_at, created_at")
    .single();

  if (created) {
    // Give the new workspace its owner membership immediately. Without one it is
    // invisible to resolveWorkspaces() and unreadable under 0012's
    // membership-based policy — see migration 0017.
    await healOwnMemberships(supabase);
    return { workspace: created as WorkspaceRow, available: true };
  }

  // A failed insert here is expected, not exceptional: the partial unique index
  // workspaces_one_personal_idx allows only ONE personal workspace per owner, so
  // an existing-but-unreadable workspace (its membership row is missing, which
  // RLS turns into "row not found") blocks provisioning. Heal it, then re-read.
  if (createError) {
    await healOwnMemberships(supabase);
    const { data: healed } = await supabase
      .from("workspaces")
      .select("id, name, kind, plan, credits_balance, storage_quota_bytes, onboarded_at, created_at")
      .eq("owner_id", user.id)
      .eq("kind", "personal")
      .maybeSingle();
    if (healed) return { workspace: healed as WorkspaceRow, available: true };
  }

  return { workspace: null, available: true };
}

/**
 * Best-effort repair of an owner membership row that is missing or not active
 * (migrations 0017 + 0018).
 *
 * Deliberately tolerant: on a database where 0017 hasn't been applied the RPC
 * doesn't exist, so this returns an error which we swallow — the caller still
 * resolves whatever it could, exactly as before. Never allowed to block
 * workspace resolution.
 */
export async function healOwnMemberships(supabase: ReturnType<typeof createClient>): Promise<void> {
  try {
    // `.rpc()` RESOLVES with an `{ error }` instead of throwing, so a bare
    // try/catch silently ignored a missing RPC (pre-0017 databases) and left the
    // workspace unreachable. Inspect the error explicitly.
    const { error } = await supabase.rpc("ensure_own_memberships");
    if (error) return; // pre-0017 DB, or the self-heal doesn't apply.
  } catch {
    // Network/transport failure — never blocks resolution.
  }
}

export async function resolveProfile(): Promise<{ profile: ProfileRow | null; available: boolean }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { profile: null, available: false };

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, preferences")
    .eq("id", user.id)
    .maybeSingle();

  if (error) return { profile: null, available: false };
  if (data) return { profile: data as ProfileRow, available: true };

  const { data: created } = await supabase
    .from("profiles")
    .insert({ id: user.id, full_name: (user.user_metadata?.full_name as string) ?? "" })
    .select("id, full_name, avatar_url, preferences")
    .single();
  return { profile: (created ?? null) as ProfileRow | null, available: true };
}

// ---------------------------------------------------------------------------
// Organisation-aware resolution.
//
// Every lookup tolerates a database where 0012 has not been applied yet: the
// membership queries simply error out and return null, and callers fall back
// to the personal workspace — i.e. exactly today's behaviour.
// ---------------------------------------------------------------------------

/** The caller's membership row in a workspace, or null (also pre-0012). */
export async function resolveMembership(workspaceId: string): Promise<MembershipRow | null> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("workspace_members")
      .select("id, workspace_id, user_id, role, status, permissions, joined_at, last_active_at")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return null;
    return (data as MembershipRow) ?? null;
  } catch {
    return null;
  }
}

/** Every workspace the caller belongs to (active or invited), for the switcher. */
export async function resolveWorkspaces(): Promise<WorkspaceSummary[]> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("workspace_members")
      .select("role, status, workspace:workspaces(id, name, kind, plan, credits_balance, storage_quota_bytes, onboarded_at, created_at, owner_id)")
      .eq("user_id", user.id)
      .in("status", ["active", "invited"]);

    if (error) return [];

    interface Joined {
      role: string;
      status: string;
      workspace: Record<string, unknown> | Record<string, unknown>[] | null;
    }

    const rows = (data ?? []) as unknown as Joined[];
    const out: WorkspaceSummary[] = [];
    for (const row of rows) {
      const w = (Array.isArray(row.workspace) ? row.workspace[0] : row.workspace) as Record<string, unknown> | null;
      if (!w) continue;
      out.push({
        id: String(w.id),
        name: String(w.name ?? "Workspace"),
        kind: (w.kind as "personal" | "business") ?? "business",
        slug: (w.slug as string | null) ?? null,
        logo_url: (w.logo_url as string | null) ?? null,
        plan: String(w.plan ?? "free"),
        role: row.role,
        status: row.status,
        credits_balance: Number(w.credits_balance ?? 0),
      });
    }

    // Personal workspace first, then organisations alphabetically.
    out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "personal" ? -1 : 1));
    return out;
  } catch {
    return [];
  }
}

export interface ActiveWorkspace {
  workspace: WorkspaceRow | null;
  membership: MembershipRow | null;
  available: boolean;
}

/**
 * Resolve the workspace the current request is acting in.
 *
 * The `nibble_ws` cookie is only a *hint*: it is honoured only when an active
 * membership for the signed-in user exists. Otherwise we fall back to the
 * personal workspace, so a stale or forged cookie can never reach data.
 */
export async function resolveActiveWorkspace(): Promise<ActiveWorkspace> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { workspace: null, membership: null, available: false };

  const cookieStore = cookies();
  const cookieId = cookieStore.get(WORKSPACE_COOKIE)?.value ?? null;

  if (cookieId) {
    let membership = await resolveMembership(cookieId);
    // The cookie names a workspace we can't currently access. That is expected
    // when the caller owns it but its owner membership row is missing or not
    // active (the pre-0018 failure mode) — heal once, then re-check.
    if (!membership || membership.status !== "active") {
      await healOwnMemberships(supabase);
      membership = await resolveMembership(cookieId);
    }
    if (membership && membership.status === "active") {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name, kind, plan, credits_balance, storage_quota_bytes, onboarded_at, created_at, owner_id")
        .eq("id", cookieId)
        .maybeSingle();
      if (!error && data) {
        return { workspace: data as WorkspaceRow, membership, available: true };
      }
    }
  }

  // Fall back to the personal workspace (provisioning it if this is a
  // pre-migration user).
  const personal = await resolveWorkspace();
  if (personal.workspace) {
    let membership = await resolveMembership(personal.workspace.id);
    // A missing row, or one that is 'invited'/'suspended', is the same lockout:
    // self-heal and re-read before handing the workspace back.
    if (!membership || membership.status !== "active") {
      await healOwnMemberships(supabase);
      membership = await resolveMembership(personal.workspace.id);
    }
    return { workspace: personal.workspace, membership: membership ?? null, available: personal.available };
  }

  return { workspace: null, membership: null, available: personal.available };
}

/**
 * True when the organisation schema (0012 and later) is installed.
 *
 * `workspace_members` arrives with 0012, so a failed probe means the org
 * features aren't in the database yet. The UI uses this to explain the degraded
 * workspace switcher — without it, a missing schema is indistinguishable from
 * "you only have one workspace".
 */
export async function workspaceSchemaReady(): Promise<boolean> {
  try {
    const supabase = createClient();
    const { error } = await supabase.from("workspace_members").select("id", { count: "exact", head: true });
    return !error;
  } catch {
    return false;
  }
}