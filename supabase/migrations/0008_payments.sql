-- ---------------------------------------------------------------------------
-- MarzPay payments: one row per mobile-money collection initiated from a
-- payment field. Kept authoritative server-side; the response answer carries
-- a lightweight snapshot for display.
--
-- `reference` is the UUID v4 we generate per collection (also sent to MarzPay
-- as the reference) and is UNIQUE so webhook/status updates key off it without
-- double-applying. `transaction_id` is MarzPay's transaction uuid used for
-- proactive status polling.
-- ---------------------------------------------------------------------------

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms(id) on delete cascade,
  response_id uuid references responses(id) on delete cascade,
  field_id text not null,
  reference uuid not null unique,
  status text not null default 'processing'
    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  transaction_id text,
  provider_transaction_id text,
  currency text not null default 'UGX',
  amount numeric(14,2) not null,
  amount_ugx numeric(14,2) not null,
  usd_to_ugx_rate numeric(14,2),
  tax_rate numeric(6,2) not null default 0,
  tax_ugx numeric(14,2) not null default 0,
  total_ugx numeric(14,2) not null,
  method text not null default 'mobile_money',
  phone_number text not null,
  description text,
  country text not null default 'UG',
  sandbox boolean not null default false,
  error text,
  raw jsonb,
  checked_at timestamptz, -- last time we proactively asked MarzPay for status
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_form_id_idx on payments(form_id);
create index if not exists payments_response_id_idx on payments(response_id);
create index if not exists payments_reference_idx on payments(reference);

create or replace function payments_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists payments_set_updated_at on payments;
create trigger payments_set_updated_at
  before update on payments
  for each row execute function payments_set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: owners can read payments for their own forms. Writes
-- happen only through the service-role client in API/cron/webhook routes, so
-- no INSERT/UPDATE/DELETE policies are granted to anon/authenticated.
-- The anonymous status-poll endpoint reads payments row-by-row by UUID
-- reference against a published form — safe because the reference is a random
-- UUID that acts as a capability token.
-- ---------------------------------------------------------------------------
alter table payments enable row level security;

drop policy if exists "owners read own payments" on payments;
create policy "owners read own payments"
  on payments for select
  using (
    exists (
      select 1 from forms
      where forms.id = payments.form_id
        and forms.owner_id = auth.uid()
    )
  );