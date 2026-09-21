alter table if exists customer_addresses
  add column if not exists area text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;
