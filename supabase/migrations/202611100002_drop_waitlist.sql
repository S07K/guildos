-- The public waitlist was retired in favour of direct studio access.
-- Removes its tables and rate-limit function. This permanently deletes stored signups.
drop function if exists public.consume_waitlist_rate_limit(text);
drop table if exists public.waitlist_rate_limits;
drop table if exists public.waitlist;
