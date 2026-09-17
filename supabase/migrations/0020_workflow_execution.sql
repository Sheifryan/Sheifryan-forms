-- -----------------------------------------------------------------------------
-- 0020_workflow_execution.sql
--
-- Workflows have been configurable since 0011 (a trigger plus an ordered list of
-- actions) but nothing ever consumed them: /api/workflows is CRUD-only, the
-- submit route fired form-level webhooks directly, and `last_run_at` was never
-- written. This adds the storage the execution path needs:
--
--   * notifications — where the `notify_team` action delivers, and what the
--                     header bell reads.
--   * workflow_runs — one row per (workflow, response): the idempotency guard
--                     (a retried submit must not re-assign or re-email) plus a
--                     per-action result log.
--
-- Both are read by workspace members and written by the service-role runner
-- (lib/workflows.ts), which has no session.
--
-- Requires 0011 (workspaces, workflows) and 0001 (responses); each block skips
-- itself with a NOTICE when its dependencies are missing.
-- -----------------------------------------------------------------------------

do $notifications$
begin
  if to_regclass('public.workspaces') is null then
    raise notice '0020: skipped notifications — apply 0011_personal_accounts.sql, then re-run 0020';
    return;
  end if;

  execute $ddl$
    create table if not exists public.notifications (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid references public.workspaces(id) on delete cascade,
      user_id uuid not null references auth.users(id) on delete cascade,
      kind text not null default 'workflow',
      title text not null,
      body text,
      -- Deep link back to the thing that caused it, e.g. /responses?form=…&open=…
      href text,
      actor_id uuid references auth.users(id) on delete set null,
      resource_type text,
      resource_id uuid,
      read_at timestamptz,
      created_at timestamptz not null default now()
    )
  $ddl$;

  execute 'create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc)';
  execute 'create index if not exists notifications_user_unread_idx on public.notifications (user_id) where read_at is null';
  execute 'create index if not exists notifications_workspace_idx on public.notifications (workspace_id)';

  execute 'alter table public.notifications enable row level security';

  -- A user only ever reads (and marks read) their own notifications. Inserts
  -- come from the service-role runner, so no insert policy is granted to anyone.
  execute 'drop policy if exists "users read own notifications" on public.notifications';
  execute 'create policy "users read own notifications" on public.notifications for select to authenticated using (user_id = auth.uid())';
  execute 'drop policy if exists "users update own notifications" on public.notifications';
  execute 'create policy "users update own notifications" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())';

  raise notice '0020: notifications ready';
end $notifications$;

do $runs$
begin
  if to_regclass('public.workflows') is null or to_regclass('public.responses') is null then
    raise notice '0020: skipped workflow_runs — apply 0011 (workflows) and 0001 (responses), then re-run 0020';
    return;
  end if;

  execute $ddl$
    create table if not exists public.workflow_runs (
      id uuid primary key default gen_random_uuid(),
      workflow_id uuid not null references public.workflows(id) on delete cascade,
      response_id uuid not null references public.responses(id) on delete cascade,
      workspace_id uuid references public.workspaces(id) on delete cascade,
      ok boolean not null default true,
      -- [{ type, ok, detail }] — one entry per attempted action.
      actions jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      -- Idempotency: one response runs a given workflow at most once, so a
      -- retried submission can never assign or email twice.
      unique (workflow_id, response_id)
    )
  $ddl$;

  execute 'create index if not exists workflow_runs_workflow_idx on public.workflow_runs (workflow_id, created_at desc)';
  execute 'create index if not exists workflow_runs_response_idx on public.workflow_runs (response_id)';

  execute 'alter table public.workflow_runs enable row level security';

  if to_regprocedure('public.is_workspace_member(uuid)') is not null then
    execute 'drop policy if exists "members read workflow runs" on public.workflow_runs';
    execute 'create policy "members read workflow runs" on public.workflow_runs for select to authenticated using (workspace_id is not null and is_workspace_member(workspace_id))';
  else
    raise notice '0020: skipped the workflow_runs read policy — apply 0012_org_workspaces.sql, then re-run 0020';
  end if;

  raise notice '0020: workflow_runs ready';
end $runs$;
