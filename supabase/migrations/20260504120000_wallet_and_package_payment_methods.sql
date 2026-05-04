-- Wallet ledger + package payment method support

create table if not exists public.wallet_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance_thb numeric(12, 2) not null default 0 check (balance_thb >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  direction text not null check (direction in ('credit', 'debit')),
  tx_type text not null check (tx_type in ('topup', 'package_purchase', 'refund', 'adjustment')),
  amount_thb numeric(12, 2) not null check (amount_thb > 0),
  balance_before_thb numeric(12, 2) not null check (balance_before_thb >= 0),
  balance_after_thb numeric(12, 2) not null check (balance_after_thb >= 0),
  ref_order_id uuid references public.package_orders(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_transactions_user_created
  on public.wallet_transactions (user_id, created_at desc);

create unique index if not exists idx_wallet_transactions_ref_order_purchase
  on public.wallet_transactions (ref_order_id, tx_type)
  where tx_type = 'package_purchase' and ref_order_id is not null;

alter table public.wallet_accounts enable row level security;
alter table public.wallet_transactions enable row level security;

drop policy if exists "wallet_accounts_owner_read" on public.wallet_accounts;
create policy "wallet_accounts_owner_read"
on public.wallet_accounts for select
using (auth.uid() = user_id);

drop policy if exists "wallet_transactions_owner_read" on public.wallet_transactions;
create policy "wallet_transactions_owner_read"
on public.wallet_transactions for select
using (auth.uid() = user_id);

create or replace function public.wallet_apply_transaction(
  p_user_id uuid,
  p_direction text,
  p_amount_thb numeric,
  p_tx_type text,
  p_ref_order_id uuid default null,
  p_note text default null
)
returns table (
  transaction_id uuid,
  balance_before_thb numeric,
  balance_after_thb numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_direction text := lower(trim(coalesce(p_direction, '')));
  v_tx_type text := lower(trim(coalesce(p_tx_type, '')));
  v_amount numeric(12, 2) := round(coalesce(p_amount_thb, 0)::numeric, 2);
  v_before numeric(12, 2);
  v_after numeric(12, 2);
  v_tx_id uuid;
begin
  if p_user_id is null then
    raise exception 'wallet_user_required';
  end if;

  if v_direction not in ('credit', 'debit') then
    raise exception 'wallet_invalid_direction';
  end if;

  if v_tx_type not in ('topup', 'package_purchase', 'refund', 'adjustment') then
    raise exception 'wallet_invalid_tx_type';
  end if;

  if v_amount <= 0 then
    raise exception 'wallet_invalid_amount';
  end if;

  insert into public.wallet_accounts (user_id, balance_thb, created_at, updated_at)
  values (p_user_id, 0, now(), now())
  on conflict (user_id) do nothing;

  select balance_thb
  into v_before
  from public.wallet_accounts
  where user_id = p_user_id
  for update;

  if v_before is null then
    v_before := 0;
  end if;

  if v_direction = 'debit' then
    if v_before < v_amount then
      raise exception 'wallet_insufficient_balance';
    end if;
    v_after := v_before - v_amount;
  else
    v_after := v_before + v_amount;
  end if;

  update public.wallet_accounts
  set
    balance_thb = v_after,
    updated_at = now()
  where user_id = p_user_id;

  insert into public.wallet_transactions (
    user_id,
    direction,
    tx_type,
    amount_thb,
    balance_before_thb,
    balance_after_thb,
    ref_order_id,
    note
  ) values (
    p_user_id,
    v_direction,
    v_tx_type,
    v_amount,
    v_before,
    v_after,
    p_ref_order_id,
    p_note
  )
  returning id into v_tx_id;

  return query select v_tx_id, v_before, v_after;
end;
$$;

grant execute on function public.wallet_apply_transaction(uuid, text, numeric, text, uuid, text) to service_role;
