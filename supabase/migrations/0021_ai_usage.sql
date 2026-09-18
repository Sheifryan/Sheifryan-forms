-- -----------------------------------------------------------------------------
-- 0021_ai_usage.sql
-- AI request metering.
--
-- Every other plan limit is derived live from the resource table it measures
-- (forms, responses, form_files, workflows, workspace_members), so it needs no
-- storage of its own. An AI call leaves no such trace — the provider is
-- external — so each successful request writes one row here, and the Billing tab
-- counts the current month's rows against the plan's aiRequestsPerMonth.
--
-- METERING ONLY: nothing in the app blocks on these rows yet. Writes go through
-- the service-role client (no insert policy is granted to anyone), matching
-- form_ask_cache and credit_transactions.
-- -----------------------------------------------------------------------------

-- Precondition: the read policy below calls is_workspace_member(), which
-- 0012_org_workspaces.sql creates.
do $pre$
begin
  if to_regprocedure('public.is_workspace_member(uuid)') is null then
    raise exception '0021_ai_usage.sql requires 0012_org_workspaces.sql to be applied first (is_workspace_member() is missing). Apply 0012 successfully, then re-run this file.'
      using errcode = 'undefined_function';
  end if;
end $pre$;

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  form_id uuid references public.forms(id) on delete set null,
  kind text not null check (kind in ('ask', 'insight', 'generate', 'improve', 'critique', 'import')),
  created_at timestamptz not null default now()
);

-- Both reads ("this month, for this workspace") are covered by this index.
create index if not exists ai_usage_workspace_created_idx on public.ai_usage (workspace_id, created_at desc);

alter table public.ai_usage enable row level security;

drop policy if exists "members read ai usage" on public.ai_usage;
create policy "members read ai usage"
  on public.ai_usage for select
  to authenticated
  using (is_workspace_member(workspace_id));
