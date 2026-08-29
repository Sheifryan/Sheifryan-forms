-- ---------------------------------------------------------------------------
-- Webhooks: delivery log for outgoing webhook calls.
--
-- Webhook *configuration* lives in forms.settings JSONB (settings.webhooks[]),
-- so it rides the builder's existing autosave PATCH. This table only records
-- every outgoing delivery attempt, which powers the "last delivery" status in
-- the Integrations tab and makes deadline webhooks idempotent (a webhook that
-- already got a successful 'deadline' delivery is never fired again, so the
-- hourly cron can retry failures without double-firing).
-- ---------------------------------------------------------------------------

create table if not exists webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms(id) on delete cascade,
  webhook_id text not null,
  event text not null check (event in ('submission', 'deadline', 'test')),
  url text not null,
  success boolean not null default false,
  status_code int,
  duration_ms int,
  error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists webhook_deliveries_form_id_idx on webhook_deliveries(form_id);
create index if not exists webhook_deliveries_form_created_idx on webhook_deliveries(form_id, created_at desc);
-- Used by the deadline cron's idempotency check:
create index if not exists webhook_deliveries_dedup_idx on webhook_deliveries(webhook_id, event) where success = true;

-- ---------------------------------------------------------------------------
-- Row Level Security: owners can read delivery logs for their own forms.
-- Writes happen exclusively through the service-role client in our API/cron
-- routes, so no INSERT/DELETE policies are granted to anon/authenticated.
-- ---------------------------------------------------------------------------
alter table webhook_deliveries enable row level security;

create policy "owners read own webhook deliveries"
  on webhook_deliveries for select
  using (
    exists (
      select 1 from forms
      where forms.id = webhook_deliveries.form_id
        and forms.owner_id = auth.uid()
    )
  );