-- -----------------------------------------------------------------------------
-- 0012_org_workspaces.sql
-- Organisation workspaces: multiple orgs per user, membership, RBAC, isolation.
--
-- Builds on 0011 (workspaces, profiles, workflows, credit_transactions).
--   * fixes the unique index that blocked more than one org per user
--   * adds organisation profile columns + an org-friendly plan set
--   * adds workspace_members, workspace_invitations, role_permissions
--   * adds SECURITY DEFINER access helpers (used by every RLS policy)
--   * replaces owner-only RLS with membership + permission based RLS
-- -----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. One personal workspace per user, many organisation workspaces.
--    (0011 created a UNIQUE index on (owner_id, kind) which capped a user at a
--    single 'business' row — that has to go for multi-org support.)
-- ---------------------------------------------------------------------------
drop index if exists workspaces_owner_kind_idx;

create unique index if not exists workspaces_one_personal_idx
  on workspaces(owner_id) where kind = 'personal';

create index if not exists workspaces_owner_idx on workspaces(owner_id);
create index if not exists workspaces_kind_idx on workspaces(kind);

-- ---------------------------------------------------------------------------
-- 2. Organisation profile columns.
-- ---------------------------------------------------------------------------
alter table workspaces add column if not exists slug text;
alter table workspaces add column if not exists logo_url text;
alter table workspaces add column if not exists org_type text;
alter table workspaces add column if not exists org_size text;
alter table workspaces add column if not exists country text;
alter table workspaces add column if not exists industry text;
alter table workspaces add column if not exists description text not null default '';
alter table workspaces add column if not exists timezone text not null default 'UTC';
alter table workspaces add column if not exists created_by uuid references auth.users(id) on delete set null;

-- Slugs are optional but unique (case-insensitive) when present.
create unique index if not exists workspaces_slug_key
  on workspaces(lower(slug)) where slug is not null;

-- Organisation plans: starter | business | enterprise (personal keeps free/pro/premium).
alter table workspaces drop constraint if exists workspaces_plan_check;
alter table workspaces add constraint workspaces_plan_check
  check (plan in ('free', 'starter', 'business', 'enterprise', 'pro', 'premium'));

-- ---------------------------------------------------------------------------
-- 3. workspace_members — the access-control pivot for every resource.
--    status: active | invited | suspended
--    role:   owner | admin | editor | viewer  (custom roles reuse `permissions`)
-- ---------------------------------------------------------------------------
create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'admin', 'editor', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  -- Per-member overrides for future custom roles:
  --   { "grant": ["forms.delete"], "revoke": ["responses.export"] }
  permissions jsonb not null default '{}'::jsonb,
  -- Denormalised so the members table can show emails without the service role
  -- (auth.users is not readable through PostgREST).
  email text,
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists workspace_members_unique on workspace_members(workspace_id, user_id);
create index if not exists workspace_members_user_idx on workspace_members(user_id);
create index if not exists workspace_members_ws_idx on workspace_members(workspace_id);
-- At most one primary Owner per workspace.
create unique index if not exists workspace_members_one_owner
  on workspace_members(workspace_id) where role = 'owner';

-- ---------------------------------------------------------------------------
-- 4. role_permissions — the default role -> permission matrix, stored as data
--    so custom roles are a future data change rather than a code change.
-- ---------------------------------------------------------------------------
create table if not exists role_permissions (
  role text not null,
  permission text not null,
  primary key (role, permission)
);

alter table role_permissions enable row level security;

-- The matrix is public reference data (read-only to signed-in users).
drop policy if exists "authenticated read role permissions" on role_permissions;
create policy "authenticated read role permissions"
  on role_permissions for select
  to authenticated
  using (true);

insert into role_permissions (role, permission) values
  -- OWNER: full access
  ('owner', 'forms.create'), ('owner', 'forms.read'), ('owner', 'forms.update'),
  ('owner', 'forms.delete'), ('owner', 'forms.publish'),
  ('owner', 'responses.read'), ('owner', 'responses.update'),
  ('owner', 'responses.delete'), ('owner', 'responses.export'),
  ('owner', 'members.invite'), ('owner', 'members.remove'), ('owner', 'members.manage_roles'),
  ('owner', 'workflows.create'), ('owner', 'workflows.update'), ('owner', 'workflows.delete'),
  ('owner', 'files.read'), ('owner', 'files.delete'),
  ('owner', 'analytics.view'), ('owner', 'activity.view'),
  ('owner', 'billing.view'), ('owner', 'billing.manage'),
  ('owner', 'organisation.settings'), ('owner', 'organisation.transfer'),
  ('owner', 'organisation.delete'),

  -- ADMIN: high-level management, but no ownership/billing control
  ('admin', 'forms.create'), ('admin', 'forms.read'), ('admin', 'forms.update'),
  ('admin', 'forms.delete'), ('admin', 'forms.publish'),
  ('admin', 'responses.read'), ('admin', 'responses.update'),
  ('admin', 'responses.delete'), ('admin', 'responses.export'),
  ('admin', 'members.invite'), ('admin', 'members.remove'), ('admin', 'members.manage_roles'),
  ('admin', 'workflows.create'), ('admin', 'workflows.update'), ('admin', 'workflows.delete'),
  ('admin', 'files.read'), ('admin', 'files.delete'),
  ('admin', 'analytics.view'), ('admin', 'activity.view'),
  ('admin', 'billing.view'),
  ('admin', 'organisation.settings'),

  -- EDITOR: create and manage content
  ('editor', 'forms.create'), ('editor', 'forms.read'), ('editor', 'forms.update'),
  ('editor', 'forms.publish'),
  ('editor', 'responses.read'), ('editor', 'responses.export'),
  ('editor', 'workflows.create'), ('editor', 'workflows.update'),
  ('editor', 'files.read'),
  ('editor', 'analytics.view'),

  -- VIEWER: read-only
  ('viewer', 'forms.read'),
  ('viewer', 'responses.read'),
  ('viewer', 'files.read'),
  ('viewer', 'analytics.view')
on conflict (role, permission) do nothing;
-- ---------------------------------------------------------------------------
-- 5. Access helpers (SECURITY DEFINER so they can read workspace_members
--    without re-entering that table's RLS — avoids policy recursion).
-- ---------------------------------------------------------------------------
create or replace function is_workspace_member(ws uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

create or replace function workspace_role(ws uuid)
returns text language sql security definer stable as $$
  select m.role from workspace_members m
  where m.workspace_id = ws and m.user_id = auth.uid() and m.status = 'active'
  limit 1;
$$;

create or replace function is_workspace_owner(ws uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
      and m.status = 'active' and m.role = 'owner'
  );
$$;

create or replace function is_workspace_admin(ws uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
      and m.status = 'active' and m.role in ('owner', 'admin')
  );
$$;

-- Permission check: role matrix, with per-member grant/revoke overrides.
create or replace function has_workspace_permission(ws uuid, perm text)
returns boolean language sql security definer stable as $$
  select coalesce((
    select case
      when m.permissions -> 'revoke' ? perm then false
      when m.permissions -> 'grant' ? perm then true
      else exists (
        select 1 from role_permissions rp
        where rp.role = m.role and rp.permission = perm
      )
    end
    from workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.status = 'active'
    limit 1
  ), false);
$$;

-- Resolve a form's workspace without exposing the row to RLS.
create or replace function form_workspace(fid uuid)
returns uuid language sql security definer stable as $$
  select f.workspace_id from forms f where f.id = fid;
$$;

-- Do the caller and `target` share a workspace? Used to let teammates see each
-- other's display name/avatar without exposing every profile in the database.
create or replace function shares_workspace_with(target uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1
    from workspace_members me
    join workspace_members them on them.workspace_id = me.workspace_id
    where me.user_id = auth.uid()
      and me.status = 'active'
      and them.user_id = target
  );
$$;

-- Co-members can read each other's display profile (name/avatar) so member
-- lists, avatars and "created by" labels can render.
drop policy if exists "members read co-member profiles" on profiles;
create policy "members read co-member profiles"
  on profiles for select
  to authenticated
  using (id = auth.uid() or shares_workspace_with(id));

-- ---------------------------------------------------------------------------
-- 6. Backfill: every existing workspace gets an 'owner' membership row, and
--    created_by is set. Runs after the helpers so nothing is left unreachable.
-- ---------------------------------------------------------------------------
insert into workspace_members (workspace_id, user_id, role, status, joined_at)
  select w.id, w.owner_id, 'owner', 'active', coalesce(w.created_at, now())
  from workspaces w
  where not exists (
    select 1 from workspace_members m
    where m.workspace_id = w.id and m.user_id = w.owner_id
  )
  on conflict (workspace_id, user_id) do nothing;

-- Backfill owner emails where auth exposes them (service-side only; harmless
-- when null — the UI falls back to the person's name).
update workspace_members m
  set email = u.email
  from auth.users u
  where u.id = m.user_id and m.email is null;

update workspaces set created_by = owner_id where created_by is null;
-- ---------------------------------------------------------------------------
-- 7. workspaces RLS — membership based.
-- ---------------------------------------------------------------------------
drop policy if exists "owners manage own workspaces" on workspaces;

-- Any signed-in user can create their own workspace (personal or organisation).
drop policy if exists "users create own workspaces" on workspaces;
create policy "users create own workspaces"
  on workspaces for insert
  to authenticated
  with check (owner_id = auth.uid() and created_by = auth.uid());

-- Members can see the workspaces they belong to (active or invited).
drop policy if exists "members read their workspaces" on workspaces;
create policy "members read their workspaces"
  on workspaces for select
  to authenticated
  using (
    exists (
      select 1 from workspace_members m
      where m.workspace_id = workspaces.id
        and m.user_id = auth.uid()
        and m.status in ('active', 'invited')
    )
  );

-- Owners and admins can edit organisation settings.
drop policy if exists "admins update workspaces" on workspaces;
create policy "admins update workspaces"
  on workspaces for update
  to authenticated
  using (is_workspace_admin(id))
  with check (is_workspace_admin(id));

-- Only the owner can delete a workspace.
drop policy if exists "owners delete workspaces" on workspaces;
create policy "owners delete workspaces"
  on workspaces for delete
  to authenticated
  using (is_workspace_owner(id));

-- ---------------------------------------------------------------------------
-- 8. workspace_members RLS.
-- ---------------------------------------------------------------------------
drop policy if exists "members read workspace members" on workspace_members;
create policy "members read workspace members"
  on workspace_members for select
  to authenticated
  using (is_workspace_member(workspace_id) or is_workspace_admin(workspace_id));

drop policy if exists "admins insert workspace members" on workspace_members;
create policy "admins insert workspace members"
  on workspace_members for insert
  to authenticated
  with check (has_workspace_permission(workspace_id, 'members.invite'));

drop policy if exists "admins update workspace members" on workspace_members;
create policy "admins update workspace members"
  on workspace_members for update
  to authenticated
  using (has_workspace_permission(workspace_id, 'members.manage_roles'))
  with check (has_workspace_permission(workspace_id, 'members.manage_roles'));

drop policy if exists "admins remove workspace members" on workspace_members;
create policy "admins remove workspace members"
  on workspace_members for delete
  to authenticated
  using (has_workspace_permission(workspace_id, 'members.remove'));

-- ---------------------------------------------------------------------------
-- 9. workspace_invitations — pending invites by email.
-- ---------------------------------------------------------------------------
create table if not exists workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists workspace_invitations_ws_idx on workspace_invitations(workspace_id);
create index if not exists workspace_invitations_email_idx on workspace_invitations(lower(email));
create unique index if not exists workspace_invitations_pending_unique
  on workspace_invitations(workspace_id, lower(email)) where status = 'pending';

alter table workspace_invitations enable row level security;

drop policy if exists "admins read workspace invitations" on workspace_invitations;
create policy "admins read workspace invitations"
  on workspace_invitations for select
  to authenticated
  using (has_workspace_permission(workspace_id, 'members.invite'));

drop policy if exists "admins create workspace invitations" on workspace_invitations;
create policy "admins create workspace invitations"
  on workspace_invitations for insert
  to authenticated
  with check (has_workspace_permission(workspace_id, 'members.invite'));

drop policy if exists "admins update workspace invitations" on workspace_invitations;
create policy "admins update workspace invitations"
  on workspace_invitations for update
  to authenticated
  using (has_workspace_permission(workspace_id, 'members.invite'))
  with check (has_workspace_permission(workspace_id, 'members.invite'));

-- A signed-in invitee can read the invitation addressed to their own email,
-- so the acceptance page can render without a service-role key.
drop policy if exists "invitees read own invitation" on workspace_invitations;
create policy "invitees read own invitation"
  on workspace_invitations for select
  to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
-- ---------------------------------------------------------------------------
-- 10. Replace owner-only RLS on workspace resources with membership +
--     permission based policies. Personal workspaces are unaffected (their
--     owner holds every permission); organisation members gain access
--     according to their role.
--
-- Feature tables come from different migrations: folders (0004), form_files
-- (0006), webhook_deliveries (0007), payments (0008), form_analyses (0009) and
-- form_ask_cache (0010). If one of those migrations hasn't been applied, the
-- policy below it would abort this whole migration with "relation does not
-- exist" — so each is wrapped in its own guard that skips the missing table and
-- prints a notice naming it.
--
-- IMPORTANT: run the migrations that create those tables (0001 → 0011) BEFORE
-- this file. If you add one later, re-run this file — every policy here is
-- `drop policy if exists` + `create policy`, so re-running is always safe.
--
-- Each guard is a self-contained `do` block: it needs no helper function, so
-- there is no statement-ordering or function-resolution dependency to get
-- wrong. If a table is missing you get, on the Supabase SQL editor's output:
--
--   NOTICE: 0012: skipped form_analyses policies — apply 0009_ai_analysis.sql, then re-run 0012
--
-- …and the rest of this file still applies cleanly.
-- ---------------------------------------------------------------------------

-- forms ---------------------------------------------------------------------
drop policy if exists "owners manage own forms" on forms;

drop policy if exists "members read workspace forms" on forms;
create policy "members read workspace forms"
  on forms for select
  to authenticated
  using (is_workspace_member(workspace_id));

drop policy if exists "members create forms" on forms;
create policy "members create forms"
  on forms for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and is_workspace_member(workspace_id)
    and has_workspace_permission(workspace_id, 'forms.create')
  );

drop policy if exists "members update forms" on forms;
create policy "members update forms"
  on forms for update
  to authenticated
  using (
    is_workspace_member(workspace_id)
    and (has_workspace_permission(workspace_id, 'forms.update') or owner_id = auth.uid())
  )
  with check (
    is_workspace_member(workspace_id)
    and (has_workspace_permission(workspace_id, 'forms.update') or owner_id = auth.uid())
  );

drop policy if exists "members delete forms" on forms;
create policy "members delete forms"
  on forms for delete
  to authenticated
  using (has_workspace_permission(workspace_id, 'forms.delete'));

-- responses ------------------------------------------------------------------
drop policy if exists "owners read own responses" on responses;

drop policy if exists "members read workspace responses" on responses;
create policy "members read workspace responses"
  on responses for select
  to authenticated
  using (
    is_workspace_member(form_workspace(form_id))
    and has_workspace_permission(form_workspace(form_id), 'responses.read')
  );

drop policy if exists "members update responses" on responses;
create policy "members update responses"
  on responses for update
  to authenticated
  using (has_workspace_permission(form_workspace(form_id), 'responses.update'))
  with check (has_workspace_permission(form_workspace(form_id), 'responses.update'));

drop policy if exists "members delete responses" on responses;
create policy "members delete responses"
  on responses for delete
  to authenticated
  using (has_workspace_permission(form_workspace(form_id), 'responses.delete'));

-- folders --------------------------------------------------------------------
-- `folders` arrives in 0004. Self-contained guard: no helper needed, so this
-- cannot fail on statement ordering or function resolution.
do $pol$
begin
  if to_regclass('public.folders') is null then
    raise notice '0012: skipped folders policies — apply 0004_folders.sql, then re-run 0012';
    return;
  end if;
  execute 'drop policy if exists "owners manage own folders" on folders';
  execute 'drop policy if exists "members manage workspace folders" on folders';
  execute 'create policy "members manage workspace folders" on folders for all to authenticated using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id))';
end $pol$;

-- form_files -----------------------------------------------------------------
-- `form_files` arrives in 0006.
do $pol$
begin
  if to_regclass('public.form_files') is null then
    raise notice '0012: skipped form_files policies — apply 0006_file_uploads.sql, then re-run 0012';
    return;
  end if;
  execute 'drop policy if exists "owners read own form files" on form_files';
  execute 'drop policy if exists "members read workspace form files" on form_files';
  execute 'create policy "members read workspace form files" on form_files for select to authenticated using (is_workspace_member(form_workspace(form_id)))';
  execute 'drop policy if exists "members delete form files" on form_files';
  execute 'create policy "members delete form files" on form_files for delete to authenticated using (has_workspace_permission(form_workspace(form_id), ''files.delete''))';
end $pol$;

-- workflows ------------------------------------------------------------------
drop policy if exists "owners manage own workflows" on workflows;

drop policy if exists "members read workspace workflows" on workflows;
create policy "members read workspace workflows"
  on workflows for select
  to authenticated
  using (is_workspace_member(workspace_id));

drop policy if exists "members create workflows" on workflows;
create policy "members create workflows"
  on workflows for insert
  to authenticated
  with check (has_workspace_permission(workspace_id, 'workflows.create'));

drop policy if exists "members update workflows" on workflows;
create policy "members update workflows"
  on workflows for update
  to authenticated
  using (has_workspace_permission(workspace_id, 'workflows.update'))
  with check (has_workspace_permission(workspace_id, 'workflows.update'));

drop policy if exists "members delete workflows" on workflows;
create policy "members delete workflows"
  on workflows for delete
  to authenticated
  using (has_workspace_permission(workspace_id, 'workflows.delete'));

-- credit_transactions --------------------------------------------------------
drop policy if exists "owners read own credit transactions" on credit_transactions;

drop policy if exists "billing users read credit transactions" on credit_transactions;
create policy "billing users read credit transactions"
  on credit_transactions for select
  to authenticated
  using (has_workspace_permission(workspace_id, 'billing.view'));

-- form_analyses (AI insights) ------------------------------------------------
-- `form_analyses` arrives in 0009. Skipped with a notice when that file isn't applied.
do $pol$
begin
  if to_regclass('public.form_analyses') is null then
    raise notice '0012: skipped form_analyses policies — apply 0009_ai_analysis.sql, then re-run 0012';
    return;
  end if;
  execute 'drop policy if exists "owners can read form analyses" on form_analyses';
  execute 'create policy "members can read form analyses" on form_analyses for select to authenticated using (is_workspace_member(form_workspace(form_id)))';
end $pol$;

-- form_ask_cache (Ask your data) ---------------------------------------------
-- `form_ask_cache` arrives in 0010.
do $pol$
begin
  if to_regclass('public.form_ask_cache') is null then
    raise notice '0012: skipped form_ask_cache policies — apply 0010_ask_your_data.sql, then re-run 0012';
    return;
  end if;
  execute 'drop policy if exists "owners can read ask cache" on form_ask_cache';
  execute 'create policy "members can read ask cache" on form_ask_cache for select to authenticated using (is_workspace_member(form_workspace(form_id)))';
end $pol$;

-- webhook_deliveries ---------------------------------------------------------
-- `webhook_deliveries` arrives in 0007.
do $pol$
begin
  if to_regclass('public.webhook_deliveries') is null then
    raise notice '0012: skipped webhook_deliveries policies — apply 0007_webhooks.sql, then re-run 0012';
    return;
  end if;
  execute 'drop policy if exists "owners read own webhook deliveries" on webhook_deliveries';
  execute 'create policy "members read workspace webhook deliveries" on webhook_deliveries for select to authenticated using (is_workspace_member(form_workspace(form_id)))';
end $pol$;

-- payments -------------------------------------------------------------------
-- `payments` arrives in 0008.
do $pol$
begin
  if to_regclass('public.payments') is null then
    raise notice '0012: skipped payments policies — apply 0008_payments.sql, then re-run 0012';
    return;
  end if;
  execute 'drop policy if exists "owners read own payments" on payments';
  execute 'create policy "members read workspace payments" on payments for select to authenticated using (is_workspace_member(form_workspace(form_id)) and has_workspace_permission(form_workspace(form_id), ''responses.read''))';
end $pol$;

-- storage.objects (private attachment bucket) -------------------------------
drop policy if exists "owners access own form attachment objects" on storage.objects;
create policy "members access workspace attachment objects"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'form-attachments'
    and is_workspace_member(form_workspace(((storage.foldername(name))[1])::uuid))
  );
alter table workspace_members enable row level security;
