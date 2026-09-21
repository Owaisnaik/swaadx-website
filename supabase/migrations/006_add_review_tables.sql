create extension if not exists pgcrypto;

create table if not exists restaurant_reviews (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_clerk_user_id text not null,
  order_id uuid not null references orders(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  review_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_review_unique_per_order unique (restaurant_id, customer_clerk_user_id, order_id)
);

create table if not exists menu_item_reviews (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_clerk_user_id text not null,
  order_id uuid not null references orders(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  review_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_item_review_unique_per_order unique (menu_item_id, customer_clerk_user_id, order_id)
);

create index if not exists restaurant_reviews_restaurant_idx on restaurant_reviews (restaurant_id);
create index if not exists restaurant_reviews_order_idx on restaurant_reviews (order_id);
create index if not exists restaurant_reviews_customer_idx on restaurant_reviews (customer_clerk_user_id);
create index if not exists menu_item_reviews_menu_item_idx on menu_item_reviews (menu_item_id);
create index if not exists menu_item_reviews_restaurant_idx on menu_item_reviews (restaurant_id);
create index if not exists menu_item_reviews_customer_idx on menu_item_reviews (customer_clerk_user_id);
create index if not exists menu_item_reviews_order_idx on menu_item_reviews (order_id);

alter table restaurant_reviews enable row level security;
alter table menu_item_reviews enable row level security;

create policy restaurant_reviews_select_public
on restaurant_reviews for select
using (true);

create policy menu_item_reviews_select_public
on menu_item_reviews for select
using (true);

create policy restaurant_reviews_no_write
on restaurant_reviews for all
using (false)
with check (false);

create policy menu_item_reviews_no_write
on menu_item_reviews for all
using (false)
with check (false);

create or replace function update_review_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger restaurant_reviews_set_updated_at
before update on restaurant_reviews
for each row
execute function update_review_updated_at();

create trigger menu_item_reviews_set_updated_at
before update on menu_item_reviews
for each row
execute function update_review_updated_at();
