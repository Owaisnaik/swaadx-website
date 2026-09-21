alter table if exists customer_addresses
  add column if not exists landmark text;

alter table if exists orders
  add column if not exists delivery_recipient_name text,
  add column if not exists delivery_address text,
  add column if not exists delivery_landmark text,
  add column if not exists delivery_city text,
  add column if not exists delivery_state text,
  add column if not exists delivery_country text,
  add column if not exists delivery_postal_code text,
  add column if not exists delivery_phone text;
