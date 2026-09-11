-- -----------------------------------------------------------------------------
-- Personal Account / Workspace core.
-- Architecture: User -> Personal Workspace -> all resources belong to the
-- Workspace. Business Workspaces (future) reuse the same tables with
-- kind = 'business'.
-- -----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- workspaces: ownership boundary; one row per user's personal space
-- ---------------------------------------------------------------------------
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My Workspace',
  kind text not null default 'personal' check (kind in ('personal', 'business')),
  plan text not null default 'free' check (plan in ('free', 'pro', 'premium')),
  credits_balance bigint not null default 500,   -- welcome credits
  storage_quota_bytes bigint not null default 5368709120, -- 5 GB
  onboarded_at timestamptz,                       -- NULL until onboarding completes
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspaces_owner_kind_idx on workspaces(owner_id, kind);
create index if not exists workspaces_owner_id_idx on workspaces(owner_id);

alter table workspaces enable row level security;

-- The owner fully manages their own workspace(s). No other roles exist.
drop policy if exists "owners manage own workspaces" on workspaces;
create policy "owners manage own workspaces"
  on workspaces for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- profiles: display name, avatar, preferences (theme/notifications etc.)
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "owners manage own profile" on profiles;
create policy "owners manage own profile"
  on profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- workflows: trigger (new form response) -> ordered list of actions
--   actions jsonb: [{ type: 'email_notification'|'confirmation_email'|'webhook'|'update_status', ... }]
-- ---------------------------------------------------------------------------
create table if not exists workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null default 'New workflow',
  trigger_type text not null default 'new_response',
  trigger_form_id uuid references forms(id) on delete cascade,
  actions jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workflows_workspace_id_idx on workflows(workspace_id);
create index if not exists workflows_trigger_form_idx on workflows(trigger_form_id);

alter table workflows enable row level security;

drop policy if exists "owners manage own workflows" on workflows;
create policy "owners manage own workflows"
  on workflows for all
  using (
    exists (
      select 1 from workspaces w
      where w.id = workflows.workspace_id
        and w.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from workspaces w
      where w.id = workflows.workspace_id
        and w.owner_id = auth.uid()
    )
  );
-- ---------------------------------------------------------------------------
-- credit_transactions: wallet ledger (workspace-scoped)
-- ---------------------------------------------------------------------------
create table if not exists credit_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind text not null check (kind in ('purchase', 'usage', 'bonus')),
  category text not null default 'other'
    check (category in ('submission', 'storage', 'email', 'workflow', 'purchase', 'bonus', 'other')),
  description text not null default '',
  amount bigint not null,               -- + purchase/bonus, - usage
  balance_after bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists credit_transactions_workspace_idx on credit_transactions(workspace_id, created_at desc);

alter table credit_transactions enable row level security;

drop policy if exists "owners read own credit transactions" on credit_transactions;
create policy "owners read own credit transactions"
  on credit_transactions for select
  using (
    exists (
      select 1 from workspaces w
      where w.id = credit_transactions.workspace_id
        and w.owner_id = auth.uid()
    )
  );

-- Inserts happen only through the service-role client (wallet API routes).

-- ---------------------------------------------------------------------------
-- Scope forms + folders to their workspace, allow 'archived', track views.
-- ---------------------------------------------------------------------------
alter table forms add column if not exists workspace_id uuid references workspaces(id) on delete set null;
alter table forms add column if not exists views bigint not null default 0;
create index if not exists forms_workspace_id_idx on forms(workspace_id);

-- status check constraint gains 'archived'
alter table forms drop constraint if exists forms_status_check;
alter table forms add constraint forms_status_check check (status in ('draft', 'published', 'closed', 'archived'));

alter table folders add column if not exists workspace_id uuid references workspaces(id) on delete set null;
create index if not exists folders_workspace_id_idx on folders(workspace_id);

-- Inbox: track whether the owner has read a response yet.
alter table responses add column if not exists is_read boolean not null default false;

-- ---------------------------------------------------------------------------
-- Backfill: give every existing owner a personal workspace, then attach it to
-- their existing forms/folders so nothing ships with a NULL workspace.
-- ---------------------------------------------------------------------------
insert into workspaces (owner_id, name, kind, plan, credits_balance)
  select distinct f.owner_id,
         (split_part(coalesce(
            nullif((select (u.raw_user_meta_data ->> 'full_name')::text from auth.users u where u.id = f.owner_id), ''),
            coalesce((select u2.email from auth.users u2 where u2.id = f.owner_id), 'my')
          ), ' ', 1)) || '''s Workspace',
         'personal', 'free', 500
  from forms f
  where not exists (
    select 1 from workspaces w2 where w2.owner_id = f.owner_id and w2.kind = 'personal'
  )
  on conflict (owner_id, kind) do nothing;

update forms f
  set workspace_id = w.id
  from workspaces w
  where f.owner_id = w.owner_id and w.kind = 'personal' and f.workspace_id is null;

update folders f
  set workspace_id = w.id
  from workspaces w
  where f.owner_id = w.owner_id and w.kind = 'personal' and f.workspace_id is null;

-- ---------------------------------------------------------------------------
-- Auto-provision: every new auth user instantly gets a personal workspace and
-- a profile row, so the app never has to create them lazily.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.workspaces (owner_id, name, kind, plan, credits_balance)
  values (
    new.id,
    coalesce(
      nullif(split_part(new.raw_user_meta_data ->> 'full_name', ' ', 1), ''),
      split_part(new.email, '@', 1)
    ) || '''s Workspace',
    'personal',
    'free',
    500
  )
  on conflict do nothing;

  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Public form views: anonymous visitors increment the counter when the share
-- page loads. security definer lets the anon role run it without touching RLS.
-- ---------------------------------------------------------------------------
create or replace function bump_form_views(p_form_id uuid)
returns void
language plpgsql security definer as $$
begin
  update public.forms set views = views + 1 where id = p_form_id;
end;
$$;