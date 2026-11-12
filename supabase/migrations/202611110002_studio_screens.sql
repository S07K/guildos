-- Screens on a board, each with its own version history (like UX Pilot's per-screen
-- versions). A project holds many screens; agents and manual edits commit to one screen.

create table if not exists public.studio_screens (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null,
 workspace_id uuid not null,
 name text not null check (length(name) between 1 and 80),
 device text not null check (device in ('mobile','tablet','desktop')),
 x integer not null default 0 check (x between -200000 and 200000),
 y integer not null default 0 check (y between -200000 and 200000),
 head_version_id uuid,
 deleted_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (id, project_id, workspace_id),
 foreign key (project_id, workspace_id) references public.studio_projects(id, workspace_id) on delete cascade
);
create table if not exists public.studio_screen_versions (
 id uuid primary key default gen_random_uuid(),
 screen_id uuid not null,
 project_id uuid not null,
 workspace_id uuid not null,
 parent_version_id uuid references public.studio_screen_versions(id) on delete set null,
 document jsonb not null check (jsonb_typeof(document) = 'object' and document->>'kind' = 'html-screen'),
 feedback text not null default '' check (length(feedback) <= 4000),
 model text not null,
 input_tokens integer not null default 0 check (input_tokens >= 0),
 output_tokens integer not null default 0 check (output_tokens >= 0),
 created_at timestamptz not null default now(),
 unique (id, project_id, workspace_id),
 foreign key (screen_id, project_id, workspace_id) references public.studio_screens(id, project_id, workspace_id) on delete cascade
);
create table if not exists public.studio_screen_commits (
 project_id uuid not null,
 workspace_id uuid not null,
 request_id uuid not null,
 actor_id uuid not null references auth.users(id),
 request_hash text not null,
 screen_id uuid not null,
 version_id uuid not null,
 created_at timestamptz not null default now(),
 primary key (project_id, request_id),
 foreign key (project_id, workspace_id) references public.studio_projects(id, workspace_id) on delete cascade,
 foreign key (version_id, project_id, workspace_id) references public.studio_screen_versions(id, project_id, workspace_id) on delete cascade
);
create index if not exists studio_screens_project on public.studio_screens(project_id, created_at) where deleted_at is null;
create index if not exists studio_screen_versions_screen on public.studio_screen_versions(screen_id, created_at desc);

alter table public.studio_screens enable row level security;
alter table public.studio_screen_versions enable row level security;
alter table public.studio_screen_commits enable row level security;
revoke all on public.studio_screens, public.studio_screen_versions, public.studio_screen_commits from public, anon, authenticated;
grant select on public.studio_screens, public.studio_screen_versions to authenticated;
grant all on public.studio_screens, public.studio_screen_versions, public.studio_screen_commits to service_role;
drop policy if exists screen_owner on public.studio_screens;
create policy screen_owner on public.studio_screens for select to authenticated
 using (workspace_id in (select id from public.studio_workspaces where owner_id = (select auth.uid())));
drop policy if exists screen_version_owner on public.studio_screen_versions;
create policy screen_version_owner on public.studio_screen_versions for select to authenticated
 using (workspace_id in (select id from public.studio_workspaces where owner_id = (select auth.uid())));

alter table public.studio_tasks add column if not exists result_screen_version_id uuid;
do $$ begin
 alter table public.studio_tasks add constraint studio_tasks_result_screen_version
  foreign key (result_screen_version_id, project_id, workspace_id) references public.studio_screen_versions(id, project_id, workspace_id) on delete set null;
exception when duplicate_object then null; end $$;

create or replace function public.studio_device_width(p_device text) returns integer language sql immutable as $$
 select case p_device when 'desktop' then 1440 when 'tablet' then 768 else 375 end
$$;

-- Commits a new version of a screen, creating the screen when p_screen is null.
-- Idempotent per request; a stale p_expected head returns a conflict.
create or replace function public.commit_studio_screen(
 p_project uuid, p_workspace uuid, p_actor uuid, p_request_id uuid, p_screen uuid, p_expected uuid,
 p_document jsonb, p_feedback text, p_model text, p_input integer, p_output integer,
 p_x integer default null, p_y integer default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare screen studio_screens%rowtype; saved studio_screen_versions%rowtype; prior studio_screen_commits%rowtype; fingerprint text;
begin
 perform 1 from studio_projects p join studio_workspaces w on w.id = p.workspace_id
 where p.id = p_project and p.workspace_id = p_workspace and w.owner_id = p_actor for update of p;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if p_request_id is null or p_document is null or p_document->>'kind' is distinct from 'html-screen'
  or coalesce(p_document->>'device','') not in ('mobile','tablet','desktop') or length(coalesce(p_document->>'name','')) not between 1 and 80
 then raise exception 'Invalid screen commit'; end if;
 fingerprint := encode(sha256(convert_to(jsonb_build_object('actor',p_actor,'screen',p_screen,'expected',p_expected,'document',p_document,
  'feedback',p_feedback,'model',p_model,'input',p_input,'output',p_output,'x',p_x,'y',p_y)::text,'UTF8')),'hex');
 select * into prior from studio_screen_commits where project_id = p_project and request_id = p_request_id;
 if found then
  if prior.request_hash <> fingerprint then return jsonb_build_object('status','idempotency_conflict'); end if;
  select * into screen from studio_screens where id = prior.screen_id;
  select * into saved from studio_screen_versions where id = prior.version_id;
  return jsonb_build_object('status','replayed','screen',to_jsonb(screen),'version',to_jsonb(saved));
 end if;
 if p_screen is null then
  -- New screens are placed to the right of the board unless a position is given.
  insert into studio_screens(project_id, workspace_id, name, device, x, y)
  values (p_project, p_workspace, p_document->>'name', p_document->>'device',
   coalesce(p_x, (select coalesce(max(s.x + studio_device_width(s.device)) + 160, 0) from studio_screens s where s.project_id = p_project and s.deleted_at is null)),
   coalesce(p_y, 0))
  returning * into screen;
 else
  select * into screen from studio_screens where id = p_screen and project_id = p_project and workspace_id = p_workspace and deleted_at is null for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if screen.head_version_id is distinct from p_expected then
   return jsonb_build_object('status','conflict','currentVersionId',screen.head_version_id);
  end if;
 end if;
 insert into studio_screen_versions(screen_id, project_id, workspace_id, parent_version_id, document, feedback, model, input_tokens, output_tokens)
 values (screen.id, p_project, p_workspace, screen.head_version_id, p_document, left(coalesce(p_feedback,''),4000), coalesce(p_model,'manual-edit'), coalesce(p_input,0), coalesce(p_output,0))
 returning * into saved;
 update studio_screens set head_version_id = saved.id, name = p_document->>'name', device = p_document->>'device', updated_at = now()
 where id = screen.id returning * into screen;
 insert into studio_screen_commits(project_id, workspace_id, request_id, actor_id, request_hash, screen_id, version_id)
 values (p_project, p_workspace, p_request_id, p_actor, fingerprint, screen.id, saved.id);
 return jsonb_build_object('status','committed','screen',to_jsonb(screen),'version',to_jsonb(saved));
end $$;
revoke all on function public.commit_studio_screen(uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,integer,integer,integer,integer) from public, anon, authenticated;
grant execute on function public.commit_studio_screen(uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,integer,integer,integer,integer) to service_role;

-- Section drafts target a screen (screenId) or create one (screenId null). Scoped
-- edits and device versions start in the build phase.
create or replace function public.init_studio_sections(p_task uuid,p_token uuid,p_state jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare task public.studio_tasks%rowtype; draft jsonb;
begin
 select * into task from public.studio_tasks where id=p_task for update;
 if task.id is null or task.parent_task_id is not null or task.status<>'running'
  or task.lease_token is distinct from p_token or task.lease_until<=now() then return jsonb_build_object('status','stale'); end if;
 if p_state->>'kind' is distinct from 'sections' or p_state->'attempts' is distinct from '{}'::jsonb
  or not ((p_state->>'phase'='plan' and jsonb_typeof(p_state->'document')='null')
   or (p_state->>'phase'='build' and p_state->'document'->>'kind'='html-screen' and jsonb_typeof(p_state->'document'->'sections')='array'
    and ((p_state->'edit'->>'mode' in ('section','add') and p_state->>'baseVersionId' is not null)
     or (p_state->'edit'->>'mode'='device' and p_state->>'screenId' is null))))
 then raise exception 'Invalid initial section state'; end if;
 if p_state->>'screenId' is not null and not exists(select 1 from public.studio_screens
  where id=(p_state->>'screenId')::uuid and project_id=task.project_id and workspace_id=task.workspace_id and deleted_at is null)
 then raise exception 'Invalid screen scope'; end if;
 if p_state->>'baseVersionId' is not null and not exists(select 1 from public.studio_screen_versions
  where id=(p_state->>'baseVersionId')::uuid and project_id=task.project_id and workspace_id=task.workspace_id
   and (p_state->>'screenId' is null or screen_id=(p_state->>'screenId')::uuid))
  and not exists(select 1 from public.studio_versions where id=(p_state->>'baseVersionId')::uuid and project_id=task.project_id and workspace_id=task.workspace_id)
 then raise exception 'Invalid base version scope'; end if;
 insert into public.studio_pipeline_drafts(task_id,project_id,workspace_id,state)
 values(task.id,task.project_id,task.workspace_id,p_state) on conflict(task_id) do nothing;
 select state into draft from public.studio_pipeline_drafts where task_id=task.id;
 return jsonb_build_object('status','initialized','state',draft);
end $$;

-- The screen a draft targets never changes between checkpoints.
create or replace function public.checkpoint_studio_sections(p_task uuid,p_token uuid,p_previous jsonb,p_next jsonb,
 p_speaker text,p_summary text,p_model text,p_input integer,p_output integer,p_release boolean)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare task public.studio_tasks%rowtype; current_state jsonb; old_phase text; next_phase text;
begin
 select * into task from public.studio_tasks where id=p_task for update;
 if task.id is null or task.status<>'running' or task.lease_token is distinct from p_token
  or task.lease_until<=now() then return jsonb_build_object('status','stale'); end if;
 select state into current_state from public.studio_pipeline_drafts where task_id=task.id for update;
 if current_state is distinct from p_previous then return jsonb_build_object('status','stale'); end if;
 old_phase:=current_state->>'phase'; next_phase:=p_next->>'phase';
 if current_state->>'kind' is distinct from 'sections' or p_next->>'kind' is distinct from 'sections'
  or p_next->>'baseVersionId' is distinct from current_state->>'baseVersionId'
  or p_next->>'screenId' is distinct from current_state->>'screenId'
  or not ((old_phase='plan' and next_phase='build') or (old_phase='build' and next_phase in('build','done')))
  or p_next->'document'->>'kind' is distinct from 'html-screen'
  or jsonb_typeof(p_next->'document'->'sections') is distinct from 'array'
  or jsonb_typeof(p_next->'attempts') is distinct from 'object'
  or p_speaker not in('creative_director','ux_architect','ui_designer','copywriter','qa_critic')
  or p_input is null or p_output is null or p_input<0 or p_output<0 or p_summary is null
 then raise exception 'Invalid section checkpoint'; end if;
 update public.studio_pipeline_drafts set state=p_next,updated_at=now() where task_id=task.id;
 insert into public.studio_agent_messages(project_id,workspace_id,agent_role,author_kind,body,model,input_tokens,output_tokens)
 values(task.project_id,task.workspace_id,p_speaker,'agent',left(p_summary,2000),p_model,p_input,p_output);
 update public.studio_tasks set summary=left(p_summary,2000),input_tokens=input_tokens+p_input,output_tokens=output_tokens+p_output,
  status=case when p_release then 'queued' else status end,
  attempts=case when p_release then 0 else attempts end,
  available_at=case when p_release then now() else available_at end,
  lease_token=case when p_release then null else lease_token end,
  lease_until=case when p_release then null else lease_until end,updated_at=now()
 where id=task.id;
 return jsonb_build_object('status','checkpointed');
end $$;

-- Section drafts publish into their screen; five-stage drafts still publish a project version.
create or replace function public.finish_studio_task(p_task uuid,p_token uuid,p_result jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare task studio_tasks%rowtype; draft jsonb; committed jsonb; target_status text; version uuid; screen_version uuid;
begin
 select * into task from studio_tasks where id=p_task for update;
 if not found or task.status<>'running' or task.lease_token is distinct from p_token or task.lease_until<=now() then return jsonb_build_object('status','stale'); end if;
 if p_result->>'mode' is null or p_result->>'mode' not in ('edit','reply','blocked') or p_result->>'summary' is null or length(p_result->>'summary')>2000 then raise exception 'Invalid result'; end if;
 target_status:=case when p_result->>'mode'='blocked' then 'blocked' when p_result->>'mode'='reply' then 'done' else 'review' end;
 if target_status='review' then
  select d.state into draft from public.studio_pipeline_drafts d where d.task_id=task.id
   and d.state->'document'=p_result->'document'
   and d.state->>'baseVersionId' is not distinct from p_result->>'expectedVersionId'
   and ((d.state->>'kind' is null and (d.state->>'stage')::integer=5 and d.state->'issues'='[]'::jsonb and d.state->'commands'=p_result->'commands')
    or (d.state->>'kind'='sections' and d.state->>'phase'='done' and p_result->'commands'='[]'::jsonb));
  if draft is null then raise exception 'Only a QA-approved pipeline draft can be published'; end if;
  if draft->>'kind'='sections' and draft ? 'screenId' then
   -- Screen drafts: a new screen (screenId null) or a new version of an existing screen.
   committed:=commit_studio_screen(task.project_id,task.workspace_id,task.actor_id,task.id,(draft->>'screenId')::uuid,
    case when draft->>'screenId' is null then null else (p_result->>'expectedVersionId')::uuid end,
    p_result->'document',task.instruction,p_result->>'model',(p_result->>'input_tokens')::integer,(p_result->>'output_tokens')::integer,
    (draft->'position'->>'x')::integer,(draft->'position'->>'y')::integer);
   if committed->>'status' not in('committed','replayed') then
    target_status:='blocked';
    p_result:=p_result||jsonb_build_object('summary','The screen changed while I was working. Retry this task to work from the latest version.');
   else screen_version:=(committed->'version'->>'id')::uuid; end if;
  else
   committed:=commit_studio_version(task.project_id,task.workspace_id,task.actor_id,task.id,
    (p_result->>'expectedVersionId')::uuid,(p_result->>'expectedVersionId')::uuid,p_result->'document',task.instruction,
    p_result->>'model',(p_result->>'input_tokens')::integer,(p_result->>'output_tokens')::integer,p_result->'commands');
   if committed->>'status' not in('committed','replayed') then
    target_status:='blocked';
    p_result:=p_result||jsonb_build_object('summary','The canvas changed while I was working. Retry this task to work from the latest version.');
   else version:=(committed->'version'->>'id')::uuid; end if;
  end if;
 end if;
 update studio_tasks set status=target_status,result_version_id=version,result_screen_version_id=screen_version,summary=p_result->>'summary',
 input_tokens=input_tokens+coalesce((p_result->>'input_tokens')::integer,0),output_tokens=output_tokens+coalesce((p_result->>'output_tokens')::integer,0),
 lease_token=null,lease_until=null,updated_at=now() where id=task.id;
 insert into studio_agent_notes(project_id,workspace_id,version_id,author_role,anchor,body)
 values(task.project_id,task.workspace_id,version,task.agent_role,'page',p_result->>'summary');
 if version is null and screen_version is null then
  insert into studio_agent_messages(project_id,workspace_id,agent_role,author_kind,body,model,input_tokens,output_tokens)
  values(task.project_id,task.workspace_id,task.agent_role,'agent',p_result->>'summary',p_result->>'model',coalesce((p_result->>'input_tokens')::integer,0),coalesce((p_result->>'output_tokens')::integer,0));
 end if;
 return jsonb_build_object('status',target_status,'versionId',version,'screenVersionId',screen_version);
end; $$;

-- Existing single-screen HTML projects become a board with that screen.
insert into public.studio_screens(id, project_id, workspace_id, name, device, x, y, created_at)
select gen_random_uuid(), v.project_id, v.workspace_id, left(coalesce(nullif(v.document->>'name',''),'Screen'),80),
 case when v.document->>'device' in ('mobile','tablet','desktop') then v.document->>'device' else 'mobile' end, 0, 0, v.created_at
from (select distinct on (project_id) * from public.studio_versions order by project_id, created_at desc, id desc) v
where v.document->>'kind' = 'html-screen'
 and not exists (select 1 from public.studio_screens s where s.project_id = v.project_id);
insert into public.studio_screen_versions(screen_id, project_id, workspace_id, document, feedback, model, input_tokens, output_tokens, created_at)
select s.id, s.project_id, s.workspace_id, v.document, v.feedback, v.model, v.input_tokens, v.output_tokens, v.created_at
from public.studio_screens s
join lateral (select * from public.studio_versions pv where pv.project_id = s.project_id and pv.document->>'kind' = 'html-screen' order by pv.created_at desc, pv.id desc limit 1) v on true
where s.head_version_id is null and not exists (select 1 from public.studio_screen_versions sv where sv.screen_id = s.id);
update public.studio_screens s set head_version_id = (select sv.id from public.studio_screen_versions sv where sv.screen_id = s.id order by sv.created_at desc, sv.id desc limit 1)
where s.head_version_id is null;
