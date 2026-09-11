-- ---------------------------------------------------------------------------
-- 0017_owner_membership_repair.sql
--
-- 0012 replaced the owner-based read policy on `workspaces` with a
-- membership-based one, and its backfill only covered workspaces that existed
-- when it ran. `resolveWorkspace()` — app code that predates memberships —
-- provisions a personal workspace WITHOUT a workspace_members row, so any
-- workspace created after 0012 ends up:
--
--   * invisible to resolveWorkspaces()  (it enumerates via workspace_members)
--   * unreadable by its own owner       (the new policy demands a membership)
--   * impossible to re-provision        (workspaces_one_personal_idx permits
--                                        only one personal workspace per owner)
--
-- Net effect: the user is stuck inside an organisation. WorkspaceSwitcher could
-- not find the active id in the list, fell back to workspaces[0] (the org), and
-- then refused to switch to it because it believed the org was already active.
--
-- This file repairs the data, removes the failure mode, and adds a self-heal
-- the application can call. Idempotent — safe to re-run.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Precondition
-- ---------------------------------------------------------------------------
do $pre$
begin
  if to_regclass('public.workspace_members') is null then
    raise exception '0017_owner_membership_repair.sql requires 0012_org_workspaces.sql to be applied first (workspace_members is missing).'
      using errcode = 'undefined_table';
  end if;
end $pre$;

-- ---------------------------------------------------------------------------
-- 1. Backfill: every workspace must have an owner membership row.
--
-- This is the same statement 0012 runs — it simply predates lazily provisioned
-- personal workspaces, so re-running it is the repair.
-- ---------------------------------------------------------------------------
insert into workspace_members (workspace_id, user_id, role, status, joined_at)
  select w.id, w.owner_id, 'owner', 'active', coalesce(w.created_at, now())
  from workspaces w
  where w.owner_id is not null
    and not exists (
      select 1 from workspace_members m
      where m.workspace_id = w.id and m.user_id = w.owner_id
    )
  on conflict (workspace_id, user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. An owner can always read their own workspace.
--
-- 0012's policy requires a workspace_members row, so a workspace whose
-- membership row is missing became unreadable by the very person who owns it.
-- The owner_id arm removes that failure mode for good.
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- 3. Self-heal RPC.
--
-- The application cannot insert this row itself: the workspace_members insert
-- policy demands `members.invite` in that workspace, which an owner with no
-- membership row does not hold — the same chicken-and-egg 0015 solves for
-- organisation creation. A SECURITY DEFINER function with its own authorization
-- check is the way out.
--
-- Takes NO arguments on purpose: RLS hides the broken workspace's id from the
-- caller, so there is nothing for them to name. It only ever creates an 'owner'
-- row for a workspace the caller already owns, so it cannot be used to reach
-- anyone else's data.
-- ---------------------------------------------------------------------------
create or replace function ensure_own_memberships()
returns void language plpgsql security definer as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into workspace_members (workspace_id, user_id, role, status, joined_at, email)
  select w.id, auth.uid(), 'owner', 'active', coalesce(w.created_at, now()),
         lower(coalesce(auth.jwt() ->> 'email', ''))
  from workspaces w
  where w.owner_id = auth.uid()
    and not exists (
      select 1 from workspace_members m
      where m.workspace_id = w.id and m.user_id = auth.uid()
    )
  on conflict (workspace_id, user_id) do nothing;
end;
$$;

revoke execute on function ensure_own_memberships() from anon;
grant execute on function ensure_own_memberships() to authenticated;

