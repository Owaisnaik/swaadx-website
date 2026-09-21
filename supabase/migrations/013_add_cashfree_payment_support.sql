alter table if exists orders
  add column if not exists payment_status text not null default 'pending',
  add column if not exists cashfree_order_id text,
  add column if not exists cashfree_payment_session_id text,
  add column if not exists payment_reference text,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_failure_reason text,
  add column if not exists payment_amount numeric,
  add column if not exists payment_currency text default 'INR',
  add column if not exists payment_verified_at timestamptz,
  add column if not exists payment_attempt_count integer not null default 0;

create table if not exists payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  payment_status text not null default 'pending',
  cashfree_order_id text,
  cashfree_payment_session_id text,
  payment_reference text,
  request_payload jsonb,
  response_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists financial_ledger (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  entry_type text not null,
  direction text not null check (direction in ('debit', 'credit')),
  amount numeric not null default 0,
  currency text not null default 'INR',
  payment_status text not null default 'pending',
  cashfree_order_id text,
  payment_reference text,
  reference_type text,
  reference_id text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_attempts_order_idx on payment_attempts (order_id, created_at desc);
create index if not exists financial_ledger_order_idx on financial_ledger (order_id, created_at desc);
create index if not exists orders_payment_status_idx on orders (payment_status);
create index if not exists orders_cashfree_order_id_idx on orders (cashfree_order_id);

alter table payment_attempts enable row level security;
alter table financial_ledger enable row level security;

create policy payment_attempts_no_direct_access
on payment_attempts for all
using (false)
with check (false);

create policy financial_ledger_no_direct_access
on financial_ledger for all
using (false)
with check (false);
