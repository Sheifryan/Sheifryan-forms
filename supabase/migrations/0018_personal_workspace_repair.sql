-- -----------------------------------------------------------------------------
-- 0018_personal_workspace_repair.sql
--
-- Repairs the failure mode where a personal workspace exists but its owner has
-- no ACTIVE `workspace_members` row. Because 0012 replaced every owner-based RLS
-- policy with a membership-based one, that leaves the owner locked out of their
-- own workspace, which surfaces as:
--
--   * "Couldn't create the form"      — forms INSERT requires is_workspace_member
--   * the onboarding banner returning — workspaces UPDATE requires is_workspace_admin
--   * switching to Personal doing nothing — /api/workspace/switch requires an
--     active membership, and resolveWorkspaces() can't even list the workspace
--
-- Two root causes are fixed here:
--
--   1. handle_new_user() (0011) provisioned a workspace WITHOUT its owner
--      membership row — so every account created after 0012 was born broken.
--   2. 0017 promised "an owner can always read their own workspace" but shipped
--      only the comment, never the policy. The owner arms are added below.
--
-- Everything is idempotent (`create or replace` / `drop policy if exists`), so
-- re-running is always safe. Requires 0012 (workspace_members) and 0017.
-- -----------------------------------------------------------------------------

do $pre$
begin
  if to_regclass('public.workspace_members') is null then
    raise exception '0018_personal_workspace_repair.sql requires 0012_org_workspaces.sql (workspace_members is missing). Apply 0012 first, then re-run this file.'
      using errcode = 'undefined_table';
  end if;
end $pre$;

-- ---------------------------------------------------------------------------
-- 1. owns_workspace(ws) — does the caller own this workspace?
--
-- SECURITY DEFINER so the owner arms on `forms`/`folders`/`responses` can test
-- ownership without re-entering the `workspaces` RLS policies (which, before
-- the fix below, could not even be read by an owner without a membership).
-- ---------------------------------------------------------------------------
create or replace function owns_workspace(ws uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from workspaces w
    where w.id = ws and w.owner_id = auth.uid()
  );
$$;

revoke execute on function owns_workspace(uuid) from anon;
grant execute on function owns_workspace(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. handle_new_user() — provision the workspace AND its owner membership.
--
-- The old body inserted `workspaces` and `profiles` but never a
-- `workspace_members` row, so the very first authenticated request had to rely
-- on a self-heal that only fires when the workspace is unreadable. Create the
-- row up front instead; an account can never be born locked out again.
--
-- `created_by` is set so the insert satisfies 0012's
-- `users create own workspaces` check (owner_id = auth.uid() and created_by =
-- auth.uid()); without it the app-side provisioning insert could never succeed.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer as $$
declare
  v_ws uuid;
begin
  insert into public.workspaces (owner_id, created_by, name, kind, plan, credits_balance)
  values (
    new.id,
    new.id,
    coalesce(
      nullif(split_part(new.raw_user_meta_data ->> 'full_name', ' ', 1), ''),
      split_part(new.email, '@', 1)
    ) || '''s Workspace',
    'personal',
    'free',
    500
  )
  -- Untargeted ON CONFLICT also absorbs the partial unique index
  -- workspaces_one_personal_idx (one personal workspace per owner).
  on conflict do nothing
  returning id into v_ws;

  -- Insert skipped because a personal workspace already existed — reuse it.
  if v_ws is null then
    select w.id into v_ws
    from public.workspaces w
    where w.owner_id = new.id and w.kind = 'personal'
    limit 1;
  end if;

  if v_ws is not null then
    insert into public.workspace_members (workspace_id, user_id, role, status, joined_at, email)
    values (v_ws, new.id, 'owner', 'active', now(), lower(coalesce(new.email, '')))
    on conflict (workspace_id, user_id) do nothing;
  end if;

  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. Backfill — every workspace must have an owner membership row.
--    (Same repair 0017 runs; re-running it catches anything created since.)
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

update workspaces set created_by = owner_id where created_by is null;

-- ---------------------------------------------------------------------------
-- 4. workspaces RLS — restore the owner arms 0017 intended.
-- ---------------------------------------------------------------------------

-- An owner can always read their own workspace, membership row or not.
drop policy if exists "members read their workspaces" on workspaces;
create policy "members read their workspaces"
  on workspaces for select
  to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from workspace_members m
      where m.workspace_id = workspaces.id
        and m.user_id = auth.uid()
        and m.status in ('active', 'invited')
    )
  );

-- An owner can always update their own workspace (name, onboarding, plan).
drop policy if exists "admins update workspaces" on workspaces;
create policy "admins update workspaces"
  on workspaces for update
  to authenticated
  using (owner_id = auth.uid() or is_workspace_admin(id))
  with check (owner_id = auth.uid() or is_workspace_admin(id));

-- ---------------------------------------------------------------------------
-- 5. forms INSERT — an owner can always create a form in their own workspace.
--
-- The membership + permission arm is kept for organisation members; the owner
-- arm removes the "my own workspace rejects my own form" failure mode.
-- ---------------------------------------------------------------------------
drop policy if exists "members create forms" on forms;
create policy "members create forms"
  on forms for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and (
      owns_workspace(workspace_id)
      or (is_workspace_member(workspace_id) and has_workspace_permission(workspace_id, 'forms.create'))
    )
  );

-- ---------------------------------------------------------------------------
-- 6. folders — same owner arm for the folder CRUD policy (0012).
-- ---------------------------------------------------------------------------
do $pol$
begin
  if to_regclass('public.folders') is null then
    raise notice '0018: skipped folders policies — apply 0004_folders.sql, then re-run 0018';
    return;
  end if;
  execute 'drop policy if exists "members manage workspace folders" on folders';
  execute 'create policy "members manage workspace folders" on folders for all to authenticated using (owns_workspace(workspace_id) or is_workspace_member(workspace_id)) with check (owns_workspace(workspace_id) or is_workspace_member(workspace_id))';
end $pol$;

-- ---------------------------------------------------------------------------
-- 7. responses SELECT — an owner can read responses to their own forms even
--    before a membership row exists.
-- ---------------------------------------------------------------------------
drop policy if exists "members read workspace responses" on responses;
create policy "members read workspace responses"
  on responses for select
  to authenticated
  using (
    owns_workspace(form_workspace(form_id))
    or (is_workspace_member(form_workspace(form_id)) and has_workspace_permission(form_workspace(form_id), 'responses.read'))
  );

-- ---------------------------------------------------------------------------
-- 8. ensure_own_memberships() — also repair an EXISTING non-active row.
--
-- 0017's version only inserted a row when none existed; an owner whose row was
-- 'invited'/'suspended', or held a non-owner role, stayed locked out. This
-- version normalises any row the caller holds in a workspace they own.
-- ---------------------------------------------------------------------------
create or replace function ensure_own_memberships()
returns void language plpgsql security definer as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Missing row → create it.
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

  -- Existing but not an active owner → normalise it.
  update workspace_members m
     set role = 'owner', status = 'active'
   from workspaces w
   where w.id = m.workspace_id
     and w.owner_id = auth.uid()
     and m.user_id = auth.uid()
     and (m.role <> 'owner' or m.status <> 'active');
end;
$$;

revoke execute on function ensure_own_memberships() from anon;
grant execute on function ensure_own_memberships() to authenticated;
