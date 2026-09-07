-- -----------------------------------------------------------------------------
-- "Ask your data" cache: repeat questions against unchanged datasets return
-- instantly with zero AI calls. The fingerprint (schema version, response
-- count + newest created_at) makes a stale entry a miss, not a wrong answer.
-- -----------------------------------------------------------------------------

create table if not exists public.form_ask_cache (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  question_hash text not null,          -- sha256 of the normalized question
  question text not null,
  schema_version int not null default 0,
  response_count int not null default 0,
  latest_response_at timestamptz,
  answer jsonb not null,
  model text,
  created_at timestamptz not null default now()
);

alter table public.form_ask_cache enable row level security;

-- Owners can read their own cached answers (the page displays them only after
-- the ask route re-verified ownership anyway). Writes go through the
-- service-role client, so no insert/update policy is granted to anyone.
drop policy if exists "owners can read ask cache" on public.form_ask_cache;
create policy "owners can read ask cache"
  on public.form_ask_cache for select
  to authenticated
  using (
    exists (
      select 1 from public.forms f
      where f.id = form_ask_cache.form_id
        and f.owner_id = auth.uid()
    )
  );

create unique index if not exists form_ask_cache_form_question_idx
  on public.form_ask_cache (form_id, question_hash);
create index if not exists form_ask_cache_form_created_idx
  on public.form_ask_cache (form_id, created_at desc);
