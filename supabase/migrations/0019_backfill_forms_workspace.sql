-- -----------------------------------------------------------------------------
-- 0019_backfill_forms_workspace.sql
--
-- Every form belongs to a workspace, but rows created before the workspace
-- rollout (0011 personal accounts / 0012 organisations) still have
-- workspace_id = NULL — including everything seed.py inserts. Every form list in
-- the app is scoped to the ACTIVE workspace:
--
--   app/responses/page.tsx:19   .eq("workspace_id", workspace.id)
--   app/analytics/page.tsx:56   .eq("workspace_id", workspace.id)
--
-- so an orphaned form is invisible everywhere: it never appears in the
-- Responses/Analytics form pickers, which means the AI Analysis tab ("Ask your
-- data") can't be pointed at it and /analytics reports "No responses yet" for it
-- even when it holds hundreds of submissions.
--
-- This adopts each orphaned form into its OWNER'S PERSONAL WORKSPACE, which is
-- where a pre-organisation form belongs. Forms that already sit in a workspace
-- (personal or organisation) are never touched, so re-running is always safe.
--
-- Requires 0011 (workspaces.kind); skips itself cleanly when that's missing.
-- An owner who has no personal workspace yet keeps their NULL rows — signing in
-- provisions one, so re-run this file afterwards to adopt them.
-- -----------------------------------------------------------------------------

do $pre$
declare
  adopted int;
begin
  if to_regclass('public.workspaces') is null then
    raise notice '0019: skipped — apply 0011_personal_accounts.sql, then re-run 0019';
    return;
  end if;

  select count(*) into adopted
    from public.forms f
   where f.workspace_id is null
     and exists (
       select 1 from public.workspaces w
       where w.owner_id = f.owner_id and w.kind = 'personal'
     );

  update public.forms f
     set workspace_id = w.id
    from public.workspaces w
   where f.workspace_id is null
     and w.owner_id = f.owner_id
     and w.kind = 'personal';

  if adopted > 0 then
    raise notice '0019: adopted % orphaned form(s) into their owner''s personal workspace', adopted;
  else
    raise notice '0019: no orphaned forms to adopt';
  end if;
end $pre$;

-- Report anything still unowned-by-a-workspace so it isn't silently forgotten.
do $post$
declare
  leftovers int;
begin
  if to_regclass('public.workspaces') is null then
    return;
  end if;

  select count(*) into leftovers from public.forms where workspace_id is null;

  if leftovers > 0 then
    raise notice '0019: % form(s) still have workspace_id = NULL (no personal workspace yet — see the header note)', leftovers;
  end if;
end $post$;

-- -----------------------------------------------------------------------------
-- Marker so supabase/preflight.sql can tell whether this repair has run.
--
-- A data-only migration owns no schema object, and preflight.sql has to stay
-- runnable on a database where `forms` doesn't exist yet (so it can't count
-- rows). A column comment is visible in the catalogs either way — and it
-- documents the column for whoever reads the schema next.
-- -----------------------------------------------------------------------------
do $mark$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'forms' and column_name = 'workspace_id'
  ) then
    execute 'comment on column public.forms.workspace_id is '
         || quote_literal('0019: every form belongs to a workspace. NULL only while its owner has no personal workspace — re-run 0019_backfill_forms_workspace.sql to adopt those.');
  else
    raise notice '0019: skipped the workspace_id comment — public.forms.workspace_id is missing (apply 0011 first)';
  end if;
end $mark$;
