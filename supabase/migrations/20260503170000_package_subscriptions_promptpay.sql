-- Package subscriptions + PromptPay order workflow

do $$
begin
  if not exists (select 1 from pg_type where typname = 'package_cycle') then
    create type public.package_cycle as enum ('monthly', 'yearly');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'package_subscription_status') then
    create type public.package_subscription_status as enum ('active', 'trialing', 'expired', 'canceled');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'package_order_status') then
    create type public.package_order_status as enum ('pending', 'paid', 'expired', 'rejected');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'package_slip_status') then
    create type public.package_slip_status as enum ('matched', 'mismatch', 'manual_review');
  end if;
end
$$;

create table if not exists public.package_plans (
  id text primary key,
  display_order integer not null default 100,
  is_free boolean not null default false,
  trial_days integer check (trial_days is null or trial_days between 1 and 60),
  max_members integer not null default 1 check (max_members >= 1),
  storage_gb integer not null default 1 check (storage_gb >= 1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.package_plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null references public.package_plans(id) on delete cascade,
  cycle public.package_cycle not null,
  amount_thb numeric(12, 2) not null check (amount_thb >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, cycle)
);

create table if not exists public.package_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null references public.package_plans(id),
  cycle public.package_cycle,
  status public.package_subscription_status not null default 'active',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  source_order_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.package_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null references public.package_plans(id),
  cycle public.package_cycle not null,
  status public.package_order_status not null default 'pending',
  base_amount_thb numeric(12, 2) not null check (base_amount_thb >= 0),
  unique_amount_thb numeric(12, 2) not null check (unique_amount_thb >= 0),
  currency text not null default 'THB',
  promptpay_target text not null,
  promptpay_qr_url text not null,
  expires_at timestamptz not null,
  paid_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.package_payment_slips (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.package_orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  verification_status public.package_slip_status not null default 'manual_review',
  provider_name text,
  provider_reference text,
  amount_thb numeric(12, 2),
  payer_name text,
  payer_account text,
  receiver_name text,
  receiver_account text,
  transferred_at timestamptz,
  verification_note text,
  raw_payload_json jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.package_usage_counters (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  vault_items_count integer not null default 0 check (vault_items_count >= 0),
  notes_count integer not null default 0 check (notes_count >= 0),
  file_bytes bigint not null default 0 check (file_bytes >= 0),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_package_orders_unique_amount_open
on public.package_orders (user_id, unique_amount_thb, status)
where status = 'pending';

create unique index if not exists idx_package_payment_slips_provider_ref
on public.package_payment_slips (provider_name, provider_reference)
where provider_name is not null and provider_reference is not null;

create index if not exists idx_package_subscriptions_user_status
on public.package_subscriptions (user_id, status, ends_at desc nulls last);

create index if not exists idx_package_orders_user_status
on public.package_orders (user_id, status, expires_at desc);

alter table public.package_plans enable row level security;
alter table public.package_plan_prices enable row level security;
alter table public.package_subscriptions enable row level security;
alter table public.package_orders enable row level security;
alter table public.package_payment_slips enable row level security;
alter table public.package_usage_counters enable row level security;

drop policy if exists "package_plans_read_all" on public.package_plans;
create policy "package_plans_read_all"
on public.package_plans for select
using (active = true);

drop policy if exists "package_plan_prices_read_all" on public.package_plan_prices;
create policy "package_plan_prices_read_all"
on public.package_plan_prices for select
using (active = true);

drop policy if exists "package_subscriptions_owner_read" on public.package_subscriptions;
create policy "package_subscriptions_owner_read"
on public.package_subscriptions for select
using (auth.uid() = user_id);

drop policy if exists "package_orders_owner_read" on public.package_orders;
create policy "package_orders_owner_read"
on public.package_orders for select
using (auth.uid() = user_id);

drop policy if exists "package_orders_owner_insert" on public.package_orders;
create policy "package_orders_owner_insert"
on public.package_orders for insert
with check (auth.uid() = user_id);

drop policy if exists "package_payment_slips_owner_read" on public.package_payment_slips;
create policy "package_payment_slips_owner_read"
on public.package_payment_slips for select
using (auth.uid() = user_id);

drop policy if exists "package_payment_slips_owner_insert" on public.package_payment_slips;
create policy "package_payment_slips_owner_insert"
on public.package_payment_slips for insert
with check (auth.uid() = user_id);

drop policy if exists "package_usage_counters_owner_read" on public.package_usage_counters;
create policy "package_usage_counters_owner_read"
on public.package_usage_counters for select
using (auth.uid() = user_id);

insert into public.package_plans (id, display_order, is_free, trial_days, max_members, storage_gb, active)
values
  ('free_starter', 1, true, null, 1, 1, true),
  ('free_pro_trial', 2, true, 14, 3, 3, true),
  ('lite', 3, false, null, 1, 10, true),
  ('pro', 4, false, null, 10, 30, true),
  ('business', 5, false, null, 30, 120, true)
on conflict (id) do update
set
  display_order = excluded.display_order,
  is_free = excluded.is_free,
  trial_days = excluded.trial_days,
  max_members = excluded.max_members,
  storage_gb = excluded.storage_gb,
  active = excluded.active,
  updated_at = now();

insert into public.package_plan_prices (plan_id, cycle, amount_thb, active)
values
  ('free_starter', 'monthly', 0, true),
  ('free_starter', 'yearly', 0, true),
  ('free_pro_trial', 'monthly', 0, true),
  ('free_pro_trial', 'yearly', 0, true),
  ('lite', 'monthly', 79, true),
  ('lite', 'yearly', 790, true),
  ('pro', 'monthly', 149, true),
  ('pro', 'yearly', 1490, true),
  ('business', 'monthly', 349, true),
  ('business', 'yearly', 3490, true)
on conflict (plan_id, cycle) do update
set
  amount_thb = excluded.amount_thb,
  active = excluded.active,
  updated_at = now();
