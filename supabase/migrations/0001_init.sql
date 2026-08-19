-- FormCraft initial schema
-- Run via: supabase db push  (or paste into the Supabase SQL editor)

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- forms: one row per form. `schema` is the live field definition (JSONB).
-- `schema_version` increments every time the published schema changes, and
-- is stamped onto each response so past submissions stay interpretable even
-- after the form is edited.
-- ---------------------------------------------------------------------------
create table if not exists forms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled form',
  description text default '',
  schema jsonb not null default '{"fields": []}'::jsonb,
  schema_version int not null default 1,
  settings jsonb not null default '{"confirmationMessage": "Thanks — your response has been recorded."}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forms_owner_id_idx on forms(owner_id);

-- ---------------------------------------------------------------------------
-- responses: one row per submission. `answers` is keyed by field id.
-- ---------------------------------------------------------------------------
create table if not exists responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms(id) on delete cascade,
  schema_version int not null,
  answers jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb, -- e.g. { "userAgent": "...", "referrer": "..." }
  created_at timestamptz not null default now()
);

create index if not exists responses_form_id_idx on responses(form_id);
create index if not exists responses_created_at_idx on responses(created_at);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists forms_set_updated_at on forms;
create trigger forms_set_updated_at
  before update on forms
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table forms enable row level security;
alter table responses enable row level security;

-- Owners can fully manage their own forms.
create policy "owners manage own forms"
  on forms for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Anyone (including anonymous respondents) can read a *published* form —
-- needed so the public /f/[id] page can render without auth.
create policy "anyone can read published forms"
  on forms for select
  using (status = 'published');

-- Owners can read responses to their own forms.
create policy "owners read own responses"
  on responses for select
  using (
    exists (
      select 1 from forms
      where forms.id = responses.form_id
      and forms.owner_id = auth.uid()
    )
  );

-- Anyone can insert a response to a published form (anonymous submissions).
-- Real validation happens server-side in the API route before this insert
-- ever runs — this policy just governs raw DB access.
create policy "anyone can submit to published forms"
  on responses for insert
  with check (
    exists (
      select 1 from forms
      where forms.id = responses.form_id
      and forms.status = 'published'
    )
  );
