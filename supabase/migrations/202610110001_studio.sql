-- Single-owner workspaces for the first studio release. All project access uses RLS.
create table if not exists public.studio_workspaces (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null unique references auth.users(id) on delete cascade,
 name text not null default 'My creative studio',
 created_at timestamptz not null default now()
);
create table if not exists public.studio_projects (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.studio_workspaces(id) on delete cascade,
 name text not null check (length(name) between 1 and 100),
 brief text not null check (length(brief) between 20 and 12000),
 cta_url text not null check (length(cta_url) between 8 and 2048),
 created_at timestamptz not null default now(),
 unique(id, workspace_id)
);
create table if not exists public.studio_versions (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null,
 parent_version_id uuid references public.studio_versions(id) on delete set null,
 workspace_id uuid not null,
 document jsonb not null check (jsonb_typeof(document) = 'object'),
 feedback text not null default '' check (length(feedback) <= 4000),
 model text not null,
 input_tokens integer not null check (input_tokens >= 0),
 output_tokens integer not null check (output_tokens >= 0),
 created_at timestamptz not null default now(),
 foreign key(project_id, workspace_id) references public.studio_projects(id, workspace_id) on delete cascade
);
create table if not exists public.studio_keys (
 workspace_id uuid primary key references public.studio_workspaces(id) on delete cascade,
 ciphertext text not null,
 suffix text not null,
 updated_at timestamptz not null default now()
);
create table if not exists public.studio_generation_limits (
 workspace_id uuid primary key references public.studio_workspaces(id) on delete cascade,
 lease uuid,
 lease_until timestamptz not null default now(),
 day date not null default current_date,
 attempts integer not null default 0
);
alter table public.studio_workspaces enable row level security;
alter table public.studio_projects enable row level security;
alter table public.studio_versions enable row level security;
alter table public.studio_keys enable row level security;
alter table public.studio_generation_limits enable row level security;
revoke all on public.studio_workspaces, public.studio_projects, public.studio_versions, public.studio_keys, public.studio_generation_limits from anon, authenticated;
grant select, insert on public.studio_workspaces to authenticated;
grant select, insert, delete on public.studio_projects to authenticated;
grant select on public.studio_versions to authenticated;
grant all on public.studio_workspaces, public.studio_projects, public.studio_versions, public.studio_keys, public.studio_generation_limits to service_role;
drop policy if exists workspace_owner on public.studio_workspaces;
create policy workspace_owner on public.studio_workspaces for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists project_owner on public.studio_projects;
create policy project_owner on public.studio_projects for all to authenticated
 using (workspace_id in (select id from public.studio_workspaces where owner_id = (select auth.uid())))
 with check (workspace_id in (select id from public.studio_workspaces where owner_id = (select auth.uid())));
drop policy if exists version_owner on public.studio_versions;
create policy version_owner on public.studio_versions for select to authenticated
 using (workspace_id in (select id from public.studio_workspaces where owner_id = (select auth.uid())));
create index if not exists studio_projects_workspace on public.studio_projects(workspace_id, created_at desc);
create index if not exists studio_versions_project on public.studio_versions(project_id, created_at desc);

-- Persistent concurrency lock and daily budget, shared across server instances.
create or replace function public.reserve_studio_generation(workspace uuid, token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare allowed boolean;
begin
 insert into studio_generation_limits(workspace_id) values(workspace) on conflict do nothing;
 update studio_generation_limits set lease = token, lease_until = now() + interval '3 minutes',
 attempts = case when day = current_date then attempts + 1 else 1 end, day = current_date
 where workspace_id = workspace and lease_until <= now() and (day <> current_date or attempts < 30)
 returning true into allowed;
 return coalesce(allowed, false);
end;
$$;
create or replace function public.release_studio_generation(workspace uuid, token uuid)
returns void language sql security definer set search_path = public as $$
 update studio_generation_limits set lease_until = now(), lease = null where workspace_id = workspace and lease = token;
$$;
revoke all on function public.reserve_studio_generation(uuid, uuid), public.release_studio_generation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_studio_generation(uuid, uuid), public.release_studio_generation(uuid, uuid) to service_role;
