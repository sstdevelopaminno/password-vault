alter table if exists public.phone_risk_actions
  add column if not exists normalized_number text;

update public.phone_risk_actions
set normalized_number = regexp_replace(phone_number, '[^0-9]', '', 'g')
where normalized_number is null
   or normalized_number = '';

create index if not exists idx_phone_risk_actions_normalized
  on public.phone_risk_actions (normalized_number, created_at desc);
