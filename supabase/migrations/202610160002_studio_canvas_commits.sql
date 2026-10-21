-- Immutable version IDs serve as revision tokens. Serialize every application
-- writer on the project row, including generation and manual snapshots.
create table if not exists public.studio_canvas_commits (
 project_id uuid not null,
 workspace_id uuid not null,
 request_id uuid not null,
 actor_id uuid not null references auth.users(id),
 request_hash text not null,
 version_id uuid not null,
 operations jsonb not null default '[]',
 created_at timestamptz not null default now(),
 primary key(project_id, request_id),
 foreign key(project_id, workspace_id) references public.studio_projects(id, workspace_id) on delete cascade,
 foreign key(version_id, project_id, workspace_id) references public.studio_versions(id, project_id, workspace_id) on delete cascade
);
alter table public.studio_canvas_commits enable row level security;
revoke all on public.studio_canvas_commits from anon, authenticated;
grant select on public.studio_canvas_commits to authenticated;
grant all on public.studio_canvas_commits to service_role;
drop policy if exists canvas_commit_owner on public.studio_canvas_commits;
create policy canvas_commit_owner on public.studio_canvas_commits for select to authenticated
 using (workspace_id in (select id from public.studio_workspaces where owner_id = (select auth.uid())));

create or replace function public.commit_studio_version(
 p_project uuid, p_workspace uuid, p_actor uuid, p_request_id uuid,
 p_expected uuid, p_parent uuid, p_document jsonb, p_feedback text,
 p_model text, p_input integer, p_output integer, p_operations jsonb default '[]'
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
 current_version studio_versions%rowtype;
 saved studio_versions%rowtype;
 prior studio_canvas_commits%rowtype;
 fingerprint text;
begin
 -- Scope is checked again here, even though HTTP handlers use RLS first.
 perform 1 from studio_projects p join studio_workspaces w on w.id=p.workspace_id
 where p.id=p_project and p.workspace_id=p_workspace and w.owner_id=p_actor for update of p;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if p_request_id is null or p_document is null or jsonb_typeof(p_document)<>'object'
  or p_operations is null or jsonb_typeof(p_operations)<>'array' then
  raise exception 'Invalid commit';
 end if;
 fingerprint := encode(sha256(convert_to(jsonb_build_object(
  'actor',p_actor,'expected',p_expected,'parent',p_parent,'document',p_document,
  'feedback',p_feedback,'model',p_model,'input',p_input,'output',p_output,'operations',p_operations
 )::text,'UTF8')),'hex');
 select * into prior from studio_canvas_commits where project_id=p_project and request_id=p_request_id;
 if found then
  if prior.request_hash<>fingerprint then return jsonb_build_object('status','idempotency_conflict'); end if;
  select * into saved from studio_versions where id=prior.version_id;
  return jsonb_build_object('status','replayed','version',to_jsonb(saved));
 end if;
 select * into current_version from studio_versions where project_id=p_project and workspace_id=p_workspace
 order by created_at desc,id desc limit 1;
 if current_version.id is distinct from p_expected then
  return jsonb_build_object('status','conflict','currentVersionId',current_version.id);
 end if;
 if p_parent is not null and not exists(select 1 from studio_versions where id=p_parent and project_id=p_project and workspace_id=p_workspace) then
  return jsonb_build_object('status','invalid_parent');
 end if;
 insert into studio_versions(project_id,workspace_id,parent_version_id,document,feedback,model,input_tokens,output_tokens,created_at)
 values(p_project,p_workspace,p_parent,p_document,p_feedback,p_model,p_input,p_output,
  greatest(clock_timestamp(),current_version.created_at+interval '1 microsecond')) returning * into saved;
 insert into studio_canvas_commits(project_id,workspace_id,request_id,actor_id,request_hash,version_id,operations)
 values(p_project,p_workspace,p_request_id,p_actor,fingerprint,saved.id,p_operations);
 return jsonb_build_object('status','committed','version',to_jsonb(saved));
end;
$$;
revoke all on function public.commit_studio_version(uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.commit_studio_version(uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,integer,integer,jsonb) to service_role;
