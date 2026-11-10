-- Free trial: a workspace without its own model connection may run a small
-- number of design runs on the platform's trial key. One run is one root agent
-- task (all of its pipeline stages and subtasks) or one direct generation.
create table if not exists public.studio_trial_runs (
 workspace_id uuid not null references public.studio_workspaces(id) on delete cascade,
 run_id uuid not null,
 created_at timestamptz not null default now(),
 primary key (workspace_id,run_id)
);
alter table public.studio_trial_runs enable row level security;
revoke all on public.studio_trial_runs from anon,authenticated;
grant all on public.studio_trial_runs to service_role;

-- Idempotent per run: retries and later stages of an admitted run stay admitted.
create or replace function public.claim_studio_trial_run(p_workspace uuid,p_run uuid,p_limit integer)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('studio_trial:'||p_workspace::text,0));
 if exists(select 1 from public.studio_trial_runs where workspace_id=p_workspace and run_id=p_run) then return true; end if;
 if (select count(*) from public.studio_trial_runs where workspace_id=p_workspace)>=greatest(p_limit,0) then return false; end if;
 insert into public.studio_trial_runs(workspace_id,run_id) values(p_workspace,p_run);
 return true;
end $$;

-- Gives back a run that failed before producing anything for the user.
create or replace function public.release_studio_trial_run(p_workspace uuid,p_run uuid)
returns void language sql security definer set search_path=public as $$
 delete from public.studio_trial_runs where workspace_id=p_workspace and run_id=p_run;
$$;

revoke all on function public.claim_studio_trial_run(uuid,uuid,integer),public.release_studio_trial_run(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_studio_trial_run(uuid,uuid,integer),public.release_studio_trial_run(uuid,uuid) to service_role;
