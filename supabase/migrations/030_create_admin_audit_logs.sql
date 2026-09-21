create extension if not exists pgcrypto;

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_clerk_user_id text not null,
  action text not null,
  resource_type text not null,
  resource_id text,
  previous_state jsonb,
  new_state jsonb,
  reason text,
  request_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_logs_admin_idx
  on public.admin_audit_logs (admin_clerk_user_id);
create index if not exists admin_audit_logs_resource_idx
  on public.admin_audit_logs (resource_type, resource_id);
create index if not exists admin_audit_logs_action_idx
  on public.admin_audit_logs (action);

alter table public.admin_audit_logs enable row level security;
revoke all on public.admin_audit_logs from public, anon, authenticated;
create policy admin_audit_logs_no_direct_access
  on public.admin_audit_logs for all
  using (false)
  with check (false);
