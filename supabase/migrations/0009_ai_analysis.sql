-- -----------------------------------------------------------------------------
-- AI response analyses: cached, structured insights per form, produced by the
-- on-demand /api/ai/analyze-responses route. Raw answers never live here —
-- only the sanitized digest the AI returned (emails/phones/files withheld).
-- -----------------------------------------------------------------------------

create table if not exists public.form_analyses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  created_at timestamptz not null default now(),
  responses_analyzed int not null default 0,
  -- Window of responses covered: { from: iso, to: iso } (oldest → newest analyzed)
  response_window jsonb not null default '{}'::jsonb,
  insight jsonb not null,
  model text
);

alter table public.form_analyses enable row level security;

-- Owners can read analyses for their own forms (analytics page).
drop policy if exists "owners can read form analyses" on public.form_analyses;
create policy "owners can read form analyses"
  on public.form_analyses for select
  to authenticated
  using (
    exists (
      select 1 from public.forms f
      where f.id = form_analyses.form_id
        and f.owner_id = auth.uid()
    )
  );

-- Inserts/updates go through the server's service-role client (bypasses RLS).
-- No anon policy is granted, so strangers can never read or write analyses.

create index if not exists form_analyses_form_created_idx
  on public.form_analyses (form_id, created_at desc);
