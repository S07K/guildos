create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(trim(email)) and length(email) <= 254),
  created_at timestamptz not null default now()
);
alter table public.waitlist enable row level security;
-- No public policies: only the server's service role can access submissions.
revoke all on public.waitlist from anon, authenticated;
grant select, insert on public.waitlist to service_role;
