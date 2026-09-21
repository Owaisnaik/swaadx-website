create extension if not exists pgcrypto;

create table if not exists delivery_partners (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  full_name text not null,
  phone text,
  email text,
  status text not null default 'pending'
    constraint delivery_partners_status_check check (status in ('pending', 'approved', 'suspended', 'rejected')),
  is_online boolean not null default false,
  current_latitude double precision,
  current_longitude double precision,
  last_location_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id) on delete cascade,
  delivery_partner_id uuid not null references delivery_partners(id),
  status text not null default 'assigned'
    constraint deliveries_status_check check (status in ('assigned', 'at_restaurant', 'picked_up', 'delivering', 'completed', 'cancelled')),
  assigned_at timestamptz not null default now(),
  picked_up_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table deliveries
  add constraint deliveries_id_partner_unique unique (id, delivery_partner_id);

create table if not exists delivery_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  delivery_partner_id uuid not null references delivery_partners(id),
  status text not null default 'offered'
    constraint delivery_requests_status_check check (status in ('offered', 'accepted', 'rejected', 'expired', 'cancelled')),
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists delivery_earnings (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references deliveries(id) on delete cascade,
  delivery_partner_id uuid not null references delivery_partners(id),
  amount numeric(10, 2) not null,
  status text not null default 'pending'
    constraint delivery_earnings_status_check check (status in ('pending', 'available', 'paid', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint delivery_earnings_delivery_unique unique (delivery_id),
  constraint delivery_earnings_delivery_partner_fk
    foreign key (delivery_id, delivery_partner_id)
    references deliveries(id, delivery_partner_id)
);

create index if not exists delivery_partners_status_idx on delivery_partners (status);
create index if not exists delivery_partners_online_idx on delivery_partners (is_online);
create index if not exists delivery_partners_approved_online_idx
  on delivery_partners (status, is_online)
  where status = 'approved' and is_online = true;
create index if not exists delivery_requests_order_idx on delivery_requests (order_id);
create index if not exists delivery_requests_partner_idx on delivery_requests (delivery_partner_id);
create index if not exists delivery_requests_status_idx on delivery_requests (status);
create unique index if not exists delivery_requests_offered_order_partner_idx
  on delivery_requests (order_id, delivery_partner_id)
  where status = 'offered';
create index if not exists deliveries_order_idx on deliveries (order_id);
create index if not exists deliveries_partner_idx on deliveries (delivery_partner_id);
create index if not exists deliveries_status_idx on deliveries (status);
create index if not exists delivery_earnings_partner_idx on delivery_earnings (delivery_partner_id);
create unique index if not exists deliveries_one_active_per_partner_idx
  on deliveries (delivery_partner_id)
  where status not in ('completed', 'cancelled');

alter table delivery_partners enable row level security;
alter table deliveries enable row level security;
alter table delivery_requests enable row level security;
alter table delivery_earnings enable row level security;

create policy delivery_partners_no_direct_access on delivery_partners
  for all using (false) with check (false);
create policy deliveries_no_direct_access on deliveries
  for all using (false) with check (false);
create policy delivery_requests_no_direct_access on delivery_requests
  for all using (false) with check (false);
create policy delivery_earnings_no_direct_access on delivery_earnings
  for all using (false) with check (false);

create or replace function set_delivery_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger delivery_partners_set_updated_at
before update on delivery_partners
for each row execute function set_delivery_updated_at();

create trigger deliveries_set_updated_at
before update on deliveries
for each row execute function set_delivery_updated_at();

create or replace function accept_delivery_request(p_request_id uuid, p_partner_id uuid)
returns deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row delivery_requests%rowtype;
  partner_row delivery_partners%rowtype;
  order_row orders%rowtype;
  active_delivery_id uuid;
  delivery_row deliveries%rowtype;
begin
  select * into partner_row from delivery_partners where id = p_partner_id for update;
  if not found then raise exception 'Delivery partner not found'; end if;
  if partner_row.status <> 'approved' then raise exception 'Delivery partner is not approved'; end if;
  if not partner_row.is_online then raise exception 'Delivery partner must be online'; end if;

  select id into active_delivery_id
  from deliveries
  where delivery_partner_id = p_partner_id
    and status not in ('completed', 'cancelled')
  limit 1
  for update;
  if active_delivery_id is not null then raise exception 'Delivery partner already has an active delivery'; end if;

  select * into request_row from delivery_requests where id = p_request_id for update;
  if not found then raise exception 'Delivery request not found'; end if;
  if request_row.delivery_partner_id <> p_partner_id then raise exception 'Delivery request does not belong to this partner'; end if;
  if request_row.status <> 'offered' then raise exception 'Delivery request is no longer available'; end if;
  if request_row.expires_at <= now() then
    update delivery_requests set status = 'expired', responded_at = now() where id = p_request_id;
    raise exception 'Delivery request has expired';
  end if;
  select * into order_row from orders where id = request_row.order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if lower(trim(order_row.status)) <> 'ready' then raise exception 'Order is not ready for delivery'; end if;

  insert into deliveries (order_id, delivery_partner_id, status)
  values (request_row.order_id, p_partner_id, 'assigned')
  returning * into delivery_row;

  update delivery_requests
  set status = 'accepted', responded_at = now()
  where id = p_request_id;

  return delivery_row;
exception
  when unique_violation then
    raise exception 'This order or delivery partner already has an active delivery';
end;
$$;

create or replace function transition_delivery_status(
  p_delivery_id uuid,
  p_partner_id uuid,
  p_next_status text
)
returns deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  delivery_row deliveries%rowtype;
  order_row orders%rowtype;
  normalized_status text := lower(trim(p_next_status));
begin
  select * into delivery_row
  from deliveries
  where id = p_delivery_id and delivery_partner_id = p_partner_id
  for update;
  if not found then raise exception 'Delivery not found'; end if;

  if normalized_status = delivery_row.status then return delivery_row; end if;
  if not (
    (delivery_row.status = 'assigned' and normalized_status = 'at_restaurant') or
    (delivery_row.status = 'at_restaurant' and normalized_status = 'picked_up') or
    (delivery_row.status = 'picked_up' and normalized_status = 'delivering') or
    (delivery_row.status = 'delivering' and normalized_status = 'completed')
  ) then
    raise exception 'Invalid delivery status transition';
  end if;

  if normalized_status = 'picked_up' then
    update deliveries set status = normalized_status, picked_up_at = now() where id = p_delivery_id returning * into delivery_row;
    update orders set status = 'out_for_delivery', updated_at = now() where id = delivery_row.order_id;
  elsif normalized_status = 'completed' then
    update deliveries set status = normalized_status, delivered_at = now() where id = p_delivery_id returning * into delivery_row;
    select * into order_row from orders where id = delivery_row.order_id for update;
    update orders set status = 'completed', updated_at = now() where id = delivery_row.order_id;
    insert into delivery_earnings (delivery_id, delivery_partner_id, amount)
    values (delivery_row.id, p_partner_id, greatest(coalesce(order_row.delivery_fee, 0), 0))
    on conflict (delivery_id) do nothing;
  else
    update deliveries set status = normalized_status where id = p_delivery_id returning * into delivery_row;
  end if;

  return delivery_row;
end;
$$;

create or replace function update_restaurant_order_status(
  p_order_id uuid,
  p_restaurant_id uuid,
  p_next_status text
)
returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row orders%rowtype;
  active_delivery_id uuid;
  normalized_status text := lower(trim(p_next_status));
begin
  select * into order_row
  from orders
  where id = p_order_id and restaurant_id = p_restaurant_id
  for update;
  if not found then raise exception 'Order not found'; end if;

  if normalized_status in ('out_for_delivery', 'completed') then
    select id into active_delivery_id
    from deliveries
    where order_id = p_order_id
      and status not in ('completed', 'cancelled')
    limit 1;
    if active_delivery_id is not null then
      raise exception 'Active delivery must control this order status';
    end if;
  end if;

  update orders
  set status = p_next_status, updated_at = now()
  where id = p_order_id
  returning * into order_row;

  return order_row;
end;
$$;

revoke all on function accept_delivery_request(uuid, uuid) from public, anon, authenticated;
revoke all on function transition_delivery_status(uuid, uuid, text) from public, anon, authenticated;
revoke all on function update_restaurant_order_status(uuid, uuid, text) from public, anon, authenticated;
grant execute on function accept_delivery_request(uuid, uuid) to service_role;
grant execute on function transition_delivery_status(uuid, uuid, text) to service_role;
grant execute on function update_restaurant_order_status(uuid, uuid, text) to service_role;
