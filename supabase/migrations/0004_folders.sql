-- Folders let a user organize their own forms. Scoped per-owner, same
-- pattern as forms: RLS restricts all access to rows the caller owns.
create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'New folder',
  created_at timestamptz not null default now()
);

create index if not exists folders_owner_id_idx on folders(owner_id);

alter table forms add column if not exists folder_id uuid references folders(id) on delete set null;
create index if not exists forms_folder_id_idx on forms(folder_id);

alter table folders enable row level security;

create policy "owners manage own folders"
  on folders for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
