create table if not exists customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_clerk_user_id text not null,
  label text not null,
  address text not null,
  city text,
  state text,
  country text,
  postal_code text,
  phone text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_addresses_customer_idx
  on customer_addresses (customer_clerk_user_id);

alter table customer_addresses enable row level security;

create policy customer_addresses_no_direct_access
on customer_addresses for all
using (false)
with check (false);
