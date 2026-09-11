-- -----------------------------------------------------------------------------
-- 0014_org_billing.sql
-- Subscription / invoice / payment-method records for workspaces.
--
-- workspaces.plan + workspaces.credits_balance remain the fast authoritative
-- values the app already reads; these tables back the billing surface
-- (seats, renewal dates, invoices, payment methods).
-- -----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Precondition: the policies below call has_workspace_permission(), which
-- 0012_org_workspaces.sql creates.
-- ---------------------------------------------------------------------------
do $pre$
begin
  if to_regprocedure('public.has_workspace_permission(uuid,text)') is null then
    raise exception '0014_org_billing.sql requires 0012_org_workspaces.sql to be applied first (has_workspace_permission() is missing). Apply 0012 successfully, then re-run this file.'
      using errcode = 'undefined_function';
  end if;
end $pre$;

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references workspaces(id) on delete cascade,
  plan text not null default 'free'
    check (plan in ('free', 'starter', 'business', 'enterprise', 'pro', 'premium')),
  status text not null default 'active'
    check (status in ('trialing', 'active', 'past_due', 'canceled')),
  seats int not null default 1,
  currency text not null default 'USD',
  price_cents int not null default 0,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table subscriptions enable row level security;

drop policy if exists "billing users read subscription" on subscriptions;
create policy "billing users read subscription"
  on subscriptions for select
  to authenticated
  using (has_workspace_permission(workspace_id, 'billing.view'));

drop policy if exists "billing admins write subscription" on subscriptions;
create policy "billing admins write subscription"
  on subscriptions for all
  to authenticated
  using (has_workspace_permission(workspace_id, 'billing.manage'))
  with check (has_workspace_permission(workspace_id, 'billing.manage'));

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  number text not null,
  plan text,
  amount_cents int not null default 0,
  currency text not null default 'USD',
  status text not null default 'paid' check (status in ('draft', 'open', 'paid', 'void', 'uncollectible')),
  period_start timestamptz,
  period_end timestamptz,
  issued_at timestamptz not null default now(),
  paid_at timestamptz,
  pdf_url text,
  created_at timestamptz not null default now()
);

create index if not exists invoices_ws_idx on invoices(workspace_id, issued_at desc);

alter table invoices enable row level security;

drop policy if exists "billing users read invoices" on invoices;
create policy "billing users read invoices"
  on invoices for select
  to authenticated
  using (has_workspace_permission(workspace_id, 'billing.view'));

drop policy if exists "billing admins write invoices" on invoices;
create policy "billing admins write invoices"
  on invoices for all
  to authenticated
  using (has_workspace_permission(workspace_id, 'billing.manage'))
  with check (has_workspace_permission(workspace_id, 'billing.manage'));

-- ---------------------------------------------------------------------------
-- payment_methods
-- ---------------------------------------------------------------------------
create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand text not null default 'card',
  last4 text not null default '',
  exp_month int,
  exp_year int,
  holder text,
  is_default boolean not null default false,
  provider_ref text,
  created_at timestamptz not null default now()
);

create index if not exists payment_methods_ws_idx on payment_methods(workspace_id);

alter table payment_methods enable row level security;

drop policy if exists "billing users read payment methods" on payment_methods;
create policy "billing users read payment methods"
  on payment_methods for select
  to authenticated
  using (has_workspace_permission(workspace_id, 'billing.view'));

drop policy if exists "billing admins write payment methods" on payment_methods;
create policy "billing admins write payment methods"
  on payment_methods for all
  to authenticated
  using (has_workspace_permission(workspace_id, 'billing.manage'))
  with check (has_workspace_permission(workspace_id, 'billing.manage'));

-- ---------------------------------------------------------------------------
-- Backfill a subscription row per existing workspace (mirrors current plan).
-- ---------------------------------------------------------------------------
insert into subscriptions (workspace_id, plan, status, seats)
  select w.id,
         w.plan,
         'active',
         case
           when w.kind = 'personal' then 1
           else (select greatest(count(*), 1)::int from workspace_members m where m.workspace_id = w.id)
         end
  from workspaces w
  where not exists (select 1 from subscriptions s where s.workspace_id = w.id)
  on conflict (workspace_id) do nothing;

-- Keep subscriptions.updated_at fresh.
create or replace function subscriptions_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists subscriptions_set_updated_at on subscriptions;
create trigger subscriptions_set_updated_at
  before update on subscriptions
  for each row execute function subscriptions_set_updated_at();