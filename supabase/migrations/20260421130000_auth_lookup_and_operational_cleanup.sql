-- Scale-safe auth email lookup + operational data cleanup policy.
-- This migration does not touch core user records (profiles/vault_items).

create or replace function public.find_auth_user_by_email(p_email text)
returns table (
  id uuid,
  email text,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  last_sign_in_at timestamptz
)
language sql
security definer
set search_path = auth, public
as $$
  select
    u.id,
    u.email,
    u.email_confirmed_at,
    u.banned_until,
    u.last_sign_in_at
  from auth.users u
  where lower(u.email) = lower(trim(coalesce(p_email, '')))
  limit 1
$$;

revoke all on function public.find_auth_user_by_email(text) from public;
grant execute on function public.find_auth_user_by_email(text) to service_role;

create or replace function public.cleanup_operational_data(p_apply boolean default false)
returns table (
  table_name text,
  deleted_rows bigint,
  dry_run boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint := 0;
begin
  -- 1) audit_logs retention: keep last 120 days
  if p_apply then
    delete from public.audit_logs
    where created_at < timezone('utc', now()) - interval '120 days';
    get diagnostics v_count = row_count;
  else
    select count(*) into v_count
    from public.audit_logs
    where created_at < timezone('utc', now()) - interval '120 days';
  end if;
  table_name := 'audit_logs';
  deleted_rows := coalesce(v_count, 0);
  dry_run := not p_apply;
  return next;

  -- 2) push queue retention for terminal states: keep last 30 days
  if p_apply then
    delete from public.push_notification_queue
    where status in ('sent', 'failed', 'cancelled')
      and created_at < timezone('utc', now()) - interval '30 days';
    get diagnostics v_count = row_count;
  else
    select count(*) into v_count
    from public.push_notification_queue
    where status in ('sent', 'failed', 'cancelled')
      and created_at < timezone('utc', now()) - interval '30 days';
  end if;
  table_name := 'push_notification_queue';
  deleted_rows := coalesce(v_count, 0);
  dry_run := not p_apply;
  return next;

  -- 3) QR login challenges retention for terminal/expired rows
  if p_apply then
    delete from public.admin_qr_login_challenges
    where (
      status in ('approved', 'rejected', 'expired', 'consumed')
      and created_at < timezone('utc', now()) - interval '30 days'
    )
    or expires_at < timezone('utc', now()) - interval '7 days';
    get diagnostics v_count = row_count;
  else
    select count(*) into v_count
    from public.admin_qr_login_challenges
    where (
      status in ('approved', 'rejected', 'expired', 'consumed')
      and created_at < timezone('utc', now()) - interval '30 days'
    )
    or expires_at < timezone('utc', now()) - interval '7 days';
  end if;
  table_name := 'admin_qr_login_challenges';
  deleted_rows := coalesce(v_count, 0);
  dry_run := not p_apply;
  return next;

  -- 4) stale distributed rate-limit buckets
  if p_apply then
    delete from public.rate_limit_buckets
    where reset_at < timezone('utc', now()) - interval '2 days';
    get diagnostics v_count = row_count;
  else
    select count(*) into v_count
    from public.rate_limit_buckets
    where reset_at < timezone('utc', now()) - interval '2 days';
  end if;
  table_name := 'rate_limit_buckets';
  deleted_rows := coalesce(v_count, 0);
  dry_run := not p_apply;
  return next;
end;
$$;

revoke all on function public.cleanup_operational_data(boolean) from public;
grant execute on function public.cleanup_operational_data(boolean) to service_role;
