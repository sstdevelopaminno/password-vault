create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now(),
  recover_until timestamptz not null,
  support_until timestamptz not null,
  purge_at timestamptz not null,
  status text not null default 'pending',
  confirmation_phrase text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_deletion_requests_status_check
    check (status in ('pending', 'restored', 'cancelled', 'purged'))
);

create index if not exists idx_account_deletion_requests_status_purge
  on public.account_deletion_requests (status, purge_at);

alter table public.account_deletion_requests enable row level security;

drop policy if exists "account_deletion_requests_owner_read" on public.account_deletion_requests;
create policy "account_deletion_requests_owner_read"
on public.account_deletion_requests for select
using (auth.uid() = user_id);

