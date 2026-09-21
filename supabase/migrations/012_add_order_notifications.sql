create extension if not exists pgcrypto;

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  customer_clerk_user_id text not null,
  order_id uuid not null references orders(id) on delete cascade,
  type text not null check (type <> ''),
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint notifications_unique_per_order_type unique (customer_clerk_user_id, order_id, type)
);

create index if not exists notifications_customer_created_idx on notifications (customer_clerk_user_id, created_at desc);
create index if not exists notifications_order_idx on notifications (order_id);

alter table notifications enable row level security;

create policy notifications_select_own
on notifications for select
using (auth.uid()::text = customer_clerk_user_id);

create policy notifications_insert_own
on notifications for insert
with check (auth.uid()::text = customer_clerk_user_id);

create policy notifications_update_own
on notifications for update
using (auth.uid()::text = customer_clerk_user_id)
with check (auth.uid()::text = customer_clerk_user_id);

create policy notifications_delete_own
on notifications for delete
using (auth.uid()::text = customer_clerk_user_id);
