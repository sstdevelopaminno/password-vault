create table if not exists public.phone_risk_actions (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  phone_number text not null,
  action text not null check (action in ('block', 'report')),
  risk_level text not null default 'suspicious' check (risk_level in ('safe', 'suspicious', 'high_risk')),
  created_at timestamptz not null default now()
);

create index if not exists idx_phone_risk_actions_user_created
  on public.phone_risk_actions (user_id, created_at desc, id desc);

create index if not exists idx_phone_risk_actions_phone
  on public.phone_risk_actions (phone_number, created_at desc);

alter table public.phone_risk_actions enable row level security;

drop policy if exists "phone_risk_actions_owner_select" on public.phone_risk_actions;
create policy "phone_risk_actions_owner_select"
on public.phone_risk_actions for select
using (auth.uid() = user_id);

drop policy if exists "phone_risk_actions_owner_insert" on public.phone_risk_actions;
create policy "phone_risk_actions_owner_insert"
on public.phone_risk_actions for insert
with check (auth.uid() = user_id);
