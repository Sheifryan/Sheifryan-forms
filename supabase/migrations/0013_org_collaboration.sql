-- -----------------------------------------------------------------------------
-- 0013_org_collaboration.sql
-- Form-level collaboration, response assignment, internal notes, activity log.
-- Depends on 0012 (workspace_members, permission helpers).
-- -----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Precondition: this file extends the organisation model from 0012. Without it,
-- every form_workspace() / has_workspace_permission() call below fails with a
-- bare "function ... does not exist" (42883) that says nothing about the cause.
-- Note the Supabase SQL editor sends a pasted script as ONE implicit
-- transaction, so an error anywhere in 0012 rolls back the entire file —
-- helpers included. Fail with an actionable message instead.
-- ---------------------------------------------------------------------------
do $pre$
begin
  if to_regclass('public.workspace_members') is null
     or to_regprocedure('public.form_workspace(uuid)') is null
     or to_regprocedure('public.has_workspace_permission(uuid,text)') is null then
    raise exception '0013_org_collaboration.sql requires 0012_org_workspaces.sql to be applied first (workspace_members / form_workspace() are missing). Apply 0012 successfully, then re-run this file.'
      using errcode = 'undefined_function';
  end if;
end $pre$;

-- ---------------------------------------------------------------------------
-- 1. form_members — per-form access for organisation members.
--    Organisation-level role still applies; form_members can grant/limit
--    access to an individual form (e.g. an outside contractor for one form).
-- ---------------------------------------------------------------------------
create table if not exists form_members (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  can_edit boolean not null default false,
  can_view_responses boolean not null default true,
  can_manage boolean not null default false,
  can_view_analytics boolean not null default true,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists form_members_unique on form_members(form_id, user_id);
create index if not exists form_members_form_idx on form_members(form_id);
create index if not exists form_members_user_idx on form_members(user_id);

alter table form_members enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Form access helpers (SECURITY DEFINER — used by policies below).
-- ---------------------------------------------------------------------------
create or replace function is_form_collaborator(fid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from form_members fm
    where fm.form_id = fid and fm.user_id = auth.uid()
  );
$$;

create or replace function can_edit_form(fid uuid)
returns boolean language sql security definer stable as $$
  select
    has_workspace_permission(form_workspace(fid), 'forms.update')
    or exists (
      select 1 from form_members fm
      where fm.form_id = fid and fm.user_id = auth.uid() and fm.can_edit
    );
$$;

create or replace function can_view_form_responses(fid uuid)
returns boolean language sql security definer stable as $$
  select
    has_workspace_permission(form_workspace(fid), 'responses.read')
    or exists (
      select 1 from form_members fm
      where fm.form_id = fid and fm.user_id = auth.uid() and fm.can_view_responses
    );
$$;

create or replace function can_manage_form(fid uuid)
returns boolean language sql security definer stable as $$
  select
    has_workspace_permission(form_workspace(fid), 'forms.update')
    or exists (
      select 1 from form_members fm
      where fm.form_id = fid and fm.user_id = auth.uid() and fm.can_manage
    );
$$;

-- form_members RLS: collaborators can see the roster; managers can change it.
drop policy if exists "collaborators read form members" on form_members;
create policy "collaborators read form members"
  on form_members for select
  to authenticated
  using (is_form_collaborator(form_id) or can_manage_form(form_id));

drop policy if exists "managers insert form members" on form_members;
create policy "managers insert form members"
  on form_members for insert
  to authenticated
  with check (can_manage_form(form_id));

drop policy if exists "managers update form members" on form_members;
create policy "managers update form members"
  on form_members for update
  to authenticated
  using (can_manage_form(form_id))
  with check (can_manage_form(form_id));

drop policy if exists "managers delete form members" on form_members;
create policy "managers delete form members"
  on form_members for delete
  to authenticated
  using (can_manage_form(form_id));

-- ---------------------------------------------------------------------------
-- 3. Response assignment + status (organisation response management).
--    Internal notes live in a separate table so respondents can never see them.
-- ---------------------------------------------------------------------------
alter table responses add column if not exists assigned_to uuid references auth.users(id) on delete set null;
alter table responses add column if not exists status text not null default 'new'
  check (status in ('new', 'in_progress', 'completed', 'archived'));

create index if not exists responses_assigned_to_idx on responses(assigned_to);
create index if not exists responses_status_idx on responses(status);

create table if not exists response_notes (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references responses(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists response_notes_response_idx on response_notes(response_id, created_at desc);

alter table response_notes enable row level security;

-- Internal notes: readable/writable only by members who can view responses.
-- There is deliberately NO anonymous or public policy on this table.
drop policy if exists "members read response notes" on response_notes;
create policy "members read response notes"
  on response_notes for select
  to authenticated
  using (
    exists (
      select 1 from responses r
      where r.id = response_notes.response_id
        and is_workspace_member(form_workspace(r.form_id))
        and can_view_form_responses(r.form_id)
    )
  );

drop policy if exists "members add response notes" on response_notes;
create policy "members add response notes"
  on response_notes for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from responses r
      where r.id = response_notes.response_id
        and is_workspace_member(form_workspace(r.form_id))
        and can_view_form_responses(r.form_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4. form_files — record who uploaded and which workspace owns the file.
--
-- `form_files` itself arrives in 0006_file_uploads.sql. Guarded so a database
-- missing that migration skips these changes instead of aborting the whole
-- org rollout. Re-run this file after applying 0006.
-- ---------------------------------------------------------------------------
do $ff$
begin
  if to_regclass('public.form_files') is null then
    raise notice '0013: skipped form_files changes — apply 0006_file_uploads.sql, then re-run 0013';
    return;
  end if;

  execute 'alter table form_files add column if not exists uploaded_by uuid references auth.users(id) on delete set null';
  execute 'alter table form_files add column if not exists workspace_id uuid references workspaces(id) on delete set null';

  -- Backfill: every existing file inherits its form's workspace.
  execute $sql$
    update form_files ff
      set workspace_id = f.workspace_id
      from forms f
      where f.id = ff.form_id and ff.workspace_id is null
  $sql$;

  execute 'create index if not exists form_files_workspace_idx on form_files(workspace_id)';
  execute 'create index if not exists form_files_uploaded_by_idx on form_files(uploaded_by)';
end $ff$;

-- ---------------------------------------------------------------------------
-- 5. activity_logs — organisation audit trail.
-- ---------------------------------------------------------------------------
create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,               -- e.g. form.published, member.invited
  resource_type text,                 -- form | response | member | workflow | billing
  resource_id uuid,
  resource_label text,                -- human-readable snapshot (form title, email…)
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_ws_idx on activity_logs(workspace_id, created_at desc);
create index if not exists activity_logs_user_idx on activity_logs(user_id);

alter table activity_logs enable row level security;

-- Owners/Admins (activity.view) and any member can read their own actions.
drop policy if exists "authorised members read activity log" on activity_logs;
create policy "authorised members read activity log"
  on activity_logs for select
  to authenticated
  using (
    is_workspace_member(workspace_id)
    and (has_workspace_permission(workspace_id, 'activity.view') or user_id = auth.uid())
  );

-- Writes go through the server (lib/activity.ts) as the signed-in user, so the
-- row is always attributed to a real member of the workspace.
drop policy if exists "members write own activity" on activity_logs;
create policy "members write own activity"
  on activity_logs for insert
  to authenticated
  with check (user_id = auth.uid() and is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- 6. "Last active" tracking.
--    A self-update RLS policy on workspace_members would let a member rewrite
--    their own `role` through a crafted request, so instead these SECURITY
--    DEFINER helpers touch only the last_active_at column.
-- ---------------------------------------------------------------------------
create or replace function touch_my_membership(ws uuid)
returns void as $$
  update workspace_members
    set last_active_at = now()
    where workspace_id = ws and user_id = auth.uid();
$$ language sql security definer;

create or replace function touch_membership_on_activity()
returns trigger as $$
begin
  update workspace_members
    set last_active_at = now()
    where workspace_id = new.workspace_id and user_id = new.user_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists activity_logs_touch_member on activity_logs;
create trigger activity_logs_touch_member
  after insert on activity_logs
  for each row execute function touch_membership_on_activity();