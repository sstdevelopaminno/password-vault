-- Wallet topup via PromptPay QR + slip verification

create table if not exists public.wallet_topup_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'rejected')),
  base_amount_thb numeric(12, 2) not null check (base_amount_thb > 0),
  unique_amount_thb numeric(12, 2) not null check (unique_amount_thb > 0),
  currency text not null default 'THB',
  promptpay_target text not null,
  promptpay_qr_url text not null,
  expires_at timestamptz not null,
  paid_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_topup_slips (
  id uuid primary key default gen_random_uuid(),
  topup_order_id uuid not null references public.wallet_topup_orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  verification_status text not null check (verification_status in ('matched', 'mismatch', 'manual_review')),
  provider_name text,
  provider_reference text,
  amount_thb numeric(12, 2),
  payer_name text,
  payer_account text,
  receiver_account text,
  bank_name text,
  transferred_at timestamptz,
  confidence_score numeric(4, 3),
  verification_note text,
  raw_payload_json jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_wallet_topup_orders_user_amount_pending
  on public.wallet_topup_orders (user_id, unique_amount_thb, status)
  where status = 'pending';

create index if not exists idx_wallet_topup_orders_user_created
  on public.wallet_topup_orders (user_id, created_at desc);

create unique index if not exists idx_wallet_topup_slips_provider_ref
  on public.wallet_topup_slips (provider_name, provider_reference)
  where provider_name is not null and provider_reference is not null;

create unique index if not exists idx_wallet_tx_topup_order_note
  on public.wallet_transactions (note)
  where tx_type = 'topup' and note like 'topup_order:%';

alter table public.wallet_topup_orders enable row level security;
alter table public.wallet_topup_slips enable row level security;

drop policy if exists "wallet_topup_orders_owner_read" on public.wallet_topup_orders;
create policy "wallet_topup_orders_owner_read"
on public.wallet_topup_orders for select
using (auth.uid() = user_id);

drop policy if exists "wallet_topup_slips_owner_read" on public.wallet_topup_slips;
create policy "wallet_topup_slips_owner_read"
on public.wallet_topup_slips for select
using (auth.uid() = user_id);

