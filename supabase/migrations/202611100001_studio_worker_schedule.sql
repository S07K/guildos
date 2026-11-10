-- Hosted worker backstop: once a minute, if agent work is waiting (or a lease
-- expired mid-action), ask the app's /api/worker endpoint to drain it.
-- The endpoint URL and shared secret live in Supabase Vault, not in this file:
--   select vault.create_secret('https://<your-domain>/api/worker', 'guildos_worker_url');
--   select vault.create_secret('<STUDIO_WORKER_SECRET>', 'guildos_worker_secret');
-- Without both secrets the job does nothing, so development databases are unaffected.
-- Databases without pg_cron, pg_net or Vault (e.g. local test Postgres) skip this migration.
do $migration$
begin
 if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
  or not exists (select 1 from pg_available_extensions where name = 'pg_net')
  or not exists (select 1 from pg_namespace where nspname = 'vault') then
  raise notice 'pg_cron, pg_net or Vault unavailable: the hosted worker schedule was not installed.';
  return;
 end if;
 create extension if not exists pg_net with schema extensions;
 create extension if not exists pg_cron;

 execute $function$
  create or replace function public.kick_studio_worker() returns void
  language plpgsql security definer set search_path = '' as $body$
  declare endpoint text; secret text;
  begin
   if not exists (
    select 1 from public.studio_tasks
    where (status = 'queued' and available_at <= now()) or (status = 'running' and lease_until < now())
   ) then return; end if;
   select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'guildos_worker_url';
   select decrypted_secret into secret from vault.decrypted_secrets where name = 'guildos_worker_secret';
   if endpoint is null or secret is null then return; end if;
   perform net.http_post(
    url := endpoint,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 10000
   );
  end $body$
 $function$;
 execute 'revoke all on function public.kick_studio_worker() from public, anon, authenticated';

 -- Scheduling by name replaces an existing job with the same name.
 perform cron.schedule('guildos-studio-worker', '* * * * *', 'select public.kick_studio_worker()');
end
$migration$;
