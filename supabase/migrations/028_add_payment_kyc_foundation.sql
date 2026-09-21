-- Migration: 028_add_payment_kyc_foundation.sql
-- Purpose: Add provider-independent Payment & KYC foundation for delivery partners.

create extension if not exists pgcrypto;

-- KYC profile per delivery partner (one active profile per partner)
create table if not exists delivery_partner_kyc_profiles (
  id uuid primary key default gen_random_uuid(),
  delivery_partner_id uuid not null references delivery_partners(id) on delete cascade,
  verification_status text not null default 'draft' -- draft|submitted|under_review|verified|rejected
    constraint delivery_partner_kyc_profiles_status_check check (verification_status in ('draft','submitted','under_review','verified','rejected')),
  legal_name text,
  date_of_birth date,
  pan_last4 text, -- store only last4 for privacy
  submitted_at timestamptz,
  verified_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_partner_kyc_profiles_unique_partner unique (delivery_partner_id)
);

create index if not exists delivery_partner_kyc_profiles_partner_idx on delivery_partner_kyc_profiles (delivery_partner_id);

-- KYC documents metadata (no public URLs here)
create table if not exists delivery_partner_kyc_documents (
  id uuid primary key default gen_random_uuid(),
  delivery_partner_id uuid not null references delivery_partners(id) on delete cascade,
  kyc_profile_id uuid not null references delivery_partner_kyc_profiles(id) on delete cascade,
  document_type text not null, -- e.g. identity_front, identity_back, licence, rc
  verification_status text not null default 'pending' -- pending|verified|rejected|expired
    constraint delivery_partner_kyc_documents_status_check check (verification_status in ('pending','verified','rejected','expired')),
  storage_path text, -- private storage path reference; do not expose directly in normal API
  expiry_date date,
  submitted_at timestamptz,
  verified_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists delivery_partner_kyc_documents_partner_idx on delivery_partner_kyc_documents (delivery_partner_id);
create index if not exists delivery_partner_kyc_documents_profile_idx on delivery_partner_kyc_documents (kyc_profile_id);

-- Payout methods
create table if not exists delivery_partner_payout_methods (
  id uuid primary key default gen_random_uuid(),
  delivery_partner_id uuid not null references delivery_partners(id) on delete cascade,
  method_type text not null -- bank_account|upi
    constraint delivery_partner_payout_methods_type_check check (method_type in ('bank_account','upi')),
  status text not null default 'pending' -- pending|verified|rejected|disabled
    constraint delivery_partner_payout_methods_status_check check (status in ('pending','verified','rejected','disabled')),
  account_holder_name text,
  bank_name text,
  ifsc text,
  account_last4 text, -- last 4 digits only
  masked_upi text, -- display-only masked value; never store the raw UPI credential here
  provider_beneficiary_reference text, -- nullable until a real payout provider creates a beneficiary
  is_default boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists delivery_partner_payout_methods_partner_idx on delivery_partner_payout_methods (delivery_partner_id);
create index if not exists delivery_partner_payout_methods_default_idx on delivery_partner_payout_methods (delivery_partner_id, is_default) where is_default = true;

-- Settlements (provider-independent grouping of earnings)
create table if not exists delivery_partner_settlements (
  id uuid primary key default gen_random_uuid(),
  delivery_partner_id uuid not null references delivery_partners(id) on delete cascade,
  period_start date,
  period_end date,
  gross_amount numeric(12,2) default 0,
  adjustments_amount numeric(12,2) default 0,
  payable_amount numeric(12,2) default 0,
  status text not null default 'pending' -- pending|processing|completed|failed|cancelled
    constraint delivery_partner_settlements_status_check check (status in ('pending','processing','completed','failed','cancelled')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists delivery_partner_settlements_partner_idx on delivery_partner_settlements (delivery_partner_id);

-- Payout attempts (provider-independent)
create table if not exists delivery_partner_payouts (
  id uuid primary key default gen_random_uuid(),
  delivery_partner_id uuid not null references delivery_partners(id) on delete cascade,
  settlement_id uuid references delivery_partner_settlements(id) on delete set null,
  payout_method_id uuid references delivery_partner_payout_methods(id) on delete set null,
  amount numeric(12,2) not null,
  currency text not null default 'INR',
  status text not null default 'pending' -- pending|queued|processing|paid|failed|reversed|cancelled
    constraint delivery_partner_payouts_status_check check (status in ('pending','queued','processing','paid','failed','reversed','cancelled')),
  provider_name text,
  provider_payout_id text,
  provider_transaction_reference text,
  failure_code text,
  failure_message text,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  processing_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz
);

create index if not exists delivery_partner_payouts_partner_idx on delivery_partner_payouts (delivery_partner_id);
create index if not exists delivery_partner_payouts_settlement_idx on delivery_partner_payouts (settlement_id);

-- Payout allocation items linking earnings to payouts
create table if not exists delivery_partner_payout_items (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references delivery_partner_payouts(id) on delete cascade,
  delivery_earning_id uuid not null references delivery_earnings(id) on delete restrict,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  constraint delivery_partner_payout_items_unique_earning unique (delivery_earning_id)
);

create index if not exists delivery_partner_payout_items_payout_idx on delivery_partner_payout_items (payout_id);

-- Enable row level security and deny direct access by default for these sensitive tables
alter table delivery_partner_kyc_profiles enable row level security;
alter table delivery_partner_kyc_documents enable row level security;
alter table delivery_partner_payout_methods enable row level security;
alter table delivery_partner_settlements enable row level security;
alter table delivery_partner_payouts enable row level security;
alter table delivery_partner_payout_items enable row level security;

revoke all on delivery_partner_kyc_profiles from public, anon, authenticated;
revoke all on delivery_partner_kyc_documents from public, anon, authenticated;
revoke all on delivery_partner_payout_methods from public, anon, authenticated;
revoke all on delivery_partner_settlements from public, anon, authenticated;
revoke all on delivery_partner_payouts from public, anon, authenticated;
revoke all on delivery_partner_payout_items from public, anon, authenticated;

create policy delivery_partner_kyc_profiles_no_direct_access on delivery_partner_kyc_profiles for all using (false) with check (false);
create policy delivery_partner_kyc_documents_no_direct_access on delivery_partner_kyc_documents for all using (false) with check (false);
create policy delivery_partner_payout_methods_no_direct_access on delivery_partner_payout_methods for all using (false) with check (false);
create policy delivery_partner_settlements_no_direct_access on delivery_partner_settlements for all using (false) with check (false);
create policy delivery_partner_payouts_no_direct_access on delivery_partner_payouts for all using (false) with check (false);
create policy delivery_partner_payout_items_no_direct_access on delivery_partner_payout_items for all using (false) with check (false);

-- Triggers to update updated_at
create or replace function set_delivery_partner_payment_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger delivery_partner_kyc_profiles_set_updated_at before update on delivery_partner_kyc_profiles for each row execute function set_delivery_partner_payment_updated_at();
create trigger delivery_partner_kyc_documents_set_updated_at before update on delivery_partner_kyc_documents for each row execute function set_delivery_partner_payment_updated_at();
create trigger delivery_partner_payout_methods_set_updated_at before update on delivery_partner_payout_methods for each row execute function set_delivery_partner_payment_updated_at();
create trigger delivery_partner_settlements_set_updated_at before update on delivery_partner_settlements for each row execute function set_delivery_partner_payment_updated_at();
create trigger delivery_partner_payouts_set_updated_at before update on delivery_partner_payouts for each row execute function set_delivery_partner_payment_updated_at();