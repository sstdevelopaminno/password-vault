alter table public.profiles
  add column if not exists pin_policy_json jsonb not null default '{}'::jsonb;

update public.profiles
set pin_policy_json = coalesce(pin_policy_json, '{}'::jsonb)
where pin_policy_json is null;
