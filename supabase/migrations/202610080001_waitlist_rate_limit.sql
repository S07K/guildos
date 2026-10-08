create table if not exists public.waitlist_rate_limits (
  bucket text primary key check (bucket ~ '^[a-f0-9]{64}$'),
  attempts integer not null check (attempts between 1 and 6),
  expires_at timestamptz not null
);
create index if not exists waitlist_rate_expiry on public.waitlist_rate_limits(expires_at);
alter table public.waitlist_rate_limits enable row level security;
revoke all on public.waitlist_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.waitlist_rate_limits to service_role;

create or replace function public.consume_waitlist_rate_limit(p_bucket text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_attempts integer;
  v_expires timestamptz;
begin
  if p_bucket is null or p_bucket !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid bucket';
  end if;
  -- Remove expired hashes opportunistically; no scheduled cleanup dependency.
  delete from public.waitlist_rate_limits where expires_at <= v_now;
  insert into public.waitlist_rate_limits as limits (bucket, attempts, expires_at)
  values (p_bucket, 1, v_now + interval '15 minutes')
  on conflict (bucket) do update set
    attempts = case when limits.expires_at <= v_now then 1 else least(limits.attempts + 1, 6) end,
    expires_at = case when limits.expires_at <= v_now then excluded.expires_at else limits.expires_at end
  returning attempts, expires_at into v_attempts, v_expires;
  return jsonb_build_object('allowed', v_attempts <= 5,
    'retry_after', greatest(1, ceil(extract(epoch from (v_expires - v_now)))::integer));
end;
$$;
-- PostgreSQL grants function execution to PUBLIC by default: explicitly revoke it.
revoke all on function public.consume_waitlist_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_waitlist_rate_limit(text) to service_role;
