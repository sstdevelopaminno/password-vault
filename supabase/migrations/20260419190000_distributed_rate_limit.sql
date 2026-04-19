create table if not exists public.rate_limit_buckets (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_rate_limit_buckets_reset_at
  on public.rate_limit_buckets (reset_at);

alter table public.rate_limit_buckets enable row level security;

drop policy if exists "rate_limit_buckets_service_role_only" on public.rate_limit_buckets;
create policy "rate_limit_buckets_service_role_only"
on public.rate_limit_buckets
for all
to service_role
using (true)
with check (true);

create or replace function public.take_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_sec integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_limit integer := greatest(1, coalesce(p_limit, 1));
  v_window_seconds integer := greatest(1, coalesce(p_window_seconds, 1));
  v_count integer;
  v_reset timestamptz;
begin
  if coalesce(length(trim(p_key)), 0) = 0 then
    return query select false, 0, 1;
    return;
  end if;

  loop
    update public.rate_limit_buckets
       set count = case
                     when reset_at <= v_now then 1
                     when count < v_limit then count + 1
                     else count
                   end,
           reset_at = case
                        when reset_at <= v_now then v_now + make_interval(secs => v_window_seconds)
                        else reset_at
                      end,
           updated_at = v_now
     where key = p_key
     returning count, reset_at into v_count, v_reset;

    if found then
      return query
      select
        (v_count <= v_limit) as allowed,
        case
          when v_count <= v_limit then greatest(0, v_limit - v_count)
          else 0
        end as remaining,
        greatest(1, ceil(extract(epoch from (v_reset - v_now)))::integer) as retry_after_sec;
      return;
    end if;

    begin
      insert into public.rate_limit_buckets(key, count, reset_at, updated_at)
      values (p_key, 1, v_now + make_interval(secs => v_window_seconds), v_now);

      return query select true, greatest(0, v_limit - 1), v_window_seconds;
      return;
    exception
      when unique_violation then
        -- Concurrent insert; retry update path.
    end;
  end loop;
end;
$$;

revoke all on function public.take_rate_limit(text, integer, integer) from public;
grant execute on function public.take_rate_limit(text, integer, integer) to service_role;
