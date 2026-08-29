-- ---------------------------------------------------------------------------
-- File uploads: private S3 storage bucket (Supabase Storage), per-file
-- metadata, and per-form storage-usage tracking.
--
-- Flow: the public form uploads each file immediately when the respondent
-- picks it (POST /api/forms/[id]/upload) into the private bucket
-- "form-attachments". A `form_files` row records the metadata; the file
-- field's answer stores an array of { id, name, mimeType, sizeBytes } refs.
-- On submit, form_files rows get linked to the response.
-- ---------------------------------------------------------------------------

-- The private bucket. `on conflict do nothing` keeps this idempotent — the
-- bucket is created exactly once (there is no official "create bucket if not
-- exists" DDL, so row-existence is the guard).
insert into storage.buckets (id, name, file_size_limit, public)
values ('form-attachments', 'form-attachments', null, false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- form_files: one row per uploaded object. `upload_session` is a client-side
-- token used to cap how many files a single field visit can attach (matching
-- the field's maxFiles config); `response_id` is null until the submission
-- lands. Files that never reach a submission stay orphaned with
-- response_id = null and can be swept later.
-- ---------------------------------------------------------------------------
create table if not exists form_files (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms(id) on delete cascade,
  field_id text not null,
  response_id uuid references responses(id) on delete cascade,
  upload_session text not null default '',
  storage_path text not null,
  original_name text not null,
  mime_type text not null default '',
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists form_files_form_id_idx on form_files(form_id);
create index if not exists form_files_response_id_idx on form_files(response_id);
create index if not exists form_files_upload_session_idx on form_files(upload_session);

-- Per-form storage usage in bytes, kept in sync by the trigger below so the
-- builder's Settings tab can show it without a live aggregation query.
alter table forms add column if not exists storage_used_bytes bigint not null default 0;

create or replace function sync_form_storage_usage()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update forms
      set storage_used_bytes = storage_used_bytes + new.size_bytes
      where id = new.form_id;
    return new;
  elsif tg_op = 'DELETE' then
    update forms
      set storage_used_bytes = greatest(storage_used_bytes - old.size_bytes, 0)
      where id = old.form_id;
    return old;
  else -- UPDATE (e.g. linking a pending file to a response — sizes match, so no-op)
    update forms
      set storage_used_bytes = storage_used_bytes - old.size_bytes + new.size_bytes
      where id = new.form_id;
    return new;
  end if;
end;
$$ language plpgsql;

drop trigger if exists form_files_sync_storage on form_files;
create trigger form_files_sync_storage
  after insert or update or delete on form_files
  for each row execute function sync_form_storage_usage();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table form_files enable row level security;

-- Owners can read file metadata for their own forms.
drop policy if exists "owners read own form files" on form_files;
create policy "owners read own form files"
  on form_files for select
  using (
    exists (
      select 1 from forms
      where forms.id = form_files.form_id
        and forms.owner_id = auth.uid()
    )
  );

-- Anyone can insert metadata for files attached to a published form
-- (anonymous pre-submit uploads). The upload API route already validates the
-- form is published and enforces the field's limits before this insert runs.
drop policy if exists "anyone can insert form files" on form_files;
create policy "anyone can insert form files"
  on form_files for insert
  with check (
    exists (
      select 1 from forms
      where forms.id = form_files.form_id
        and forms.status = 'published'
    )
  );

-- ---------------------------------------------------------------------------
-- Storage object access: the owner of a form can read — and therefore get
-- signed URLs for — anything inside their form's folder in the bucket.
-- `createSignedUrl` in the signed-URL API route runs as the authenticated
-- owner, so it needs this policy on storage.objects.
-- ---------------------------------------------------------------------------
drop policy if exists "owners access own form attachment objects" on storage.objects;
create policy "owners access own form attachment objects"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'form-attachments'
    and exists (
      select 1 from forms
      where forms.id::text = (storage.foldername(name))[1]
        and forms.owner_id = auth.uid()
    )
  );