-- Delegations are real queue jobs. Each child is claimed by its own agent.
alter table public.studio_tasks add column parent_task_id uuid;
alter table public.studio_tasks add column depends_on_task_id uuid;
alter table public.studio_tasks add column delegation_id uuid;
alter table public.studio_tasks add column task_kind text not null default 'dispatch'
 check (task_kind in ('dispatch','work','qa'));
alter table public.studio_tasks drop constraint studio_tasks_status_check;
alter table public.studio_tasks add constraint studio_tasks_status_check
 check (status in ('queued','running','delegated','review','done','blocked','failed','cancelled'));
alter table public.studio_tasks add constraint studio_tasks_parent_scope
 foreign key (parent_task_id,project_id,workspace_id)
 references public.studio_tasks(id,project_id,workspace_id) on delete cascade;
alter table public.studio_tasks add constraint studio_tasks_dependency_scope
 foreign key (depends_on_task_id,project_id,workspace_id)
 references public.studio_tasks(id,project_id,workspace_id) on delete cascade;
create index studio_tasks_parent on public.studio_tasks(parent_task_id,created_at);

-- The dispatcher finishes only after its assignments have been saved together.
create function public.delegate_studio_task(p_task uuid,p_token uuid,p_assignments jsonb,
 p_summary text,p_model text,p_input integer,p_output integer)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare parent public.studio_tasks%rowtype; item jsonb; child public.studio_tasks%rowtype;
 previous_id uuid; run_id uuid := gen_random_uuid(); created_ids uuid[] := '{}'; role_name text; assignment text; count_items integer;
begin
 select * into parent from public.studio_tasks where id=p_task for update;
 if parent.id is null or parent.status<>'running' or parent.task_kind<>'dispatch'
  or parent.lease_token is distinct from p_token or parent.lease_until<=now() then
  return jsonb_build_object('status','stale');
 end if;
 if jsonb_typeof(p_assignments)<>'array' or length(p_summary) not between 1 and 2000
  or p_input<0 or p_output<0 then raise exception 'Invalid delegation'; end if;
 count_items:=jsonb_array_length(p_assignments);
 if count_items<1 or count_items>3 then raise exception 'Invalid delegation size'; end if;
 for item in select value from jsonb_array_elements(p_assignments) loop
  role_name:=item->>'agent_role'; assignment:=item->>'instruction';
  if role_name not in ('ux_architect','copywriter','ui_designer')
   or length(assignment) not between 1 and 2000 then raise exception 'Invalid assignment'; end if;
  insert into public.studio_tasks(project_id,workspace_id,actor_id,request_id,source_note_id,
   agent_role,instruction,parent_task_id,depends_on_task_id,delegation_id,task_kind)
  values(parent.project_id,parent.workspace_id,parent.actor_id,gen_random_uuid(),parent.source_note_id,
   role_name,assignment,parent.id,previous_id,run_id,'work') returning * into child;
  created_ids:=array_append(created_ids,child.id);
  previous_id:=child.id;
 end loop;
 insert into public.studio_tasks(project_id,workspace_id,actor_id,request_id,source_note_id,
  agent_role,instruction,parent_task_id,depends_on_task_id,delegation_id,task_kind)
 values(parent.project_id,parent.workspace_id,parent.actor_id,gen_random_uuid(),parent.source_note_id,
  'qa_critic','Review the latest design for clarity, hierarchy, and accessibility.',parent.id,previous_id,run_id,'qa')
 returning * into child;
 created_ids:=array_append(created_ids,child.id);
 update public.studio_tasks set status='delegated',delegation_id=run_id,summary=p_summary,input_tokens=input_tokens+p_input,
  output_tokens=output_tokens+p_output,lease_token=null,lease_until=null,updated_at=now()
 where id=parent.id;
 insert into public.studio_agent_notes(project_id,workspace_id,author_role,anchor,body)
 values(parent.project_id,parent.workspace_id,parent.agent_role,'page',p_summary);
 insert into public.studio_agent_messages(project_id,workspace_id,agent_role,author_kind,body,model,input_tokens,output_tokens)
 values(parent.project_id,parent.workspace_id,parent.agent_role,'agent',p_summary,p_model,p_input,p_output);
 return jsonb_build_object('status','delegated','taskIds',to_jsonb(created_ids));
end $$;
revoke all on function public.delegate_studio_task(uuid,uuid,jsonb,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.delegate_studio_task(uuid,uuid,jsonb,text,text,integer,integer) to service_role;

-- A child is eligible only after the preceding assignment has finished.
create function public.claim_studio_task(p_token uuid,p_agent_role text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare task public.studio_tasks%rowtype;
begin
 if p_agent_role not in ('creative_director','ux_architect','copywriter','ui_designer','qa_critic') then
  raise exception 'Invalid agent role'; end if;
 update public.studio_tasks set status='failed',error='Worker stopped repeatedly. Retry when the worker is healthy.',
  updated_at=now(),lease_token=null,lease_until=null
 where status='running' and lease_until<now() and attempts>=3;
 select t.* into task from public.studio_tasks t join public.studio_workspaces w on w.id=t.workspace_id
 where t.agent_role=p_agent_role and t.attempts<3
  and ((t.status='queued' and t.available_at<=now()) or (t.status='running' and t.lease_until<now()))
  and (t.depends_on_task_id is null or exists(
   select 1 from public.studio_tasks d where d.id=t.depends_on_task_id and d.status in ('review','done')))
  and not exists(select 1 from public.studio_tasks other where other.workspace_id=t.workspace_id
   and other.id<>t.id and other.status='running' and other.lease_until>=now())
 order by t.created_at,t.id for update of w,t skip locked limit 1;
 if not found then return null; end if;
 if exists(select 1 from public.studio_tasks where workspace_id=task.workspace_id
  and id<>task.id and status='running' and lease_until>=now()) then return null; end if;
 update public.studio_tasks set status='running',attempts=attempts+1,lease_token=p_token,
  lease_until=now()+interval '2 minutes',updated_at=now(),error=''
 where id=task.id returning * into task;
 return to_jsonb(task);
end $$;
revoke all on function public.claim_studio_task(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_studio_task(uuid,text) to service_role;

-- Keep the parent in progress until every child has finished and QA has run.
create function public.refresh_studio_parent() returns trigger language plpgsql security invoker set search_path=public as $$
declare next_status text; current_run uuid;
begin
 if new.parent_task_id is null or new.status=old.status then return new; end if;
 select delegation_id into current_run from public.studio_tasks where id=new.parent_task_id;
 if current_run is distinct from new.delegation_id then return new; end if;
 if exists(select 1 from public.studio_tasks where parent_task_id=new.parent_task_id
  and delegation_id=current_run and status in ('blocked','failed','cancelled')) then next_status:='blocked';
 elsif exists(select 1 from public.studio_tasks where parent_task_id=new.parent_task_id
  and delegation_id=current_run and task_kind='qa' and status='done')
  and not exists(select 1 from public.studio_tasks where parent_task_id=new.parent_task_id
   and delegation_id=current_run and status not in ('review','done')) then next_status:='review';
 else return new; end if;
 update public.studio_tasks set status=next_status,updated_at=now(),
  error=case when next_status='blocked' then 'A delegated agent needs attention.' else error end
 where id=new.parent_task_id and status='delegated';
 return new;
end $$;
create trigger studio_task_parent_refresh after update of status on public.studio_tasks
 for each row execute function public.refresh_studio_parent();

create or replace function public.control_studio_task(p_task uuid,p_actor uuid,p_action text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare task public.studio_tasks%rowtype;
begin
 select t.* into task from public.studio_tasks t join public.studio_workspaces w on w.id=t.workspace_id
 where t.id=p_task and w.owner_id=p_actor;
 if not found then return jsonb_build_object('status','not_found'); end if;
 -- A finishing child locks its row before the parent. Match that order when
 -- cancelling a group so cancellation and completion cannot deadlock.
 if p_action='cancel' and task.parent_task_id is null then
  perform 1 from public.studio_tasks where parent_task_id=task.id and delegation_id=task.delegation_id
   and status in ('queued','running') order by id for update;
 end if;
 select * into task from public.studio_tasks where id=p_task for update;
 if p_action='cancel' and task.status in ('queued','running','delegated','blocked','failed') then
  update public.studio_tasks set status='cancelled',lease_token=null,lease_until=null,updated_at=now() where id=task.id;
  update public.studio_tasks set status='cancelled',lease_token=null,lease_until=null,updated_at=now()
   where parent_task_id=task.id and delegation_id=task.delegation_id and status in ('queued','running');
 elsif p_action='retry' and task.status in ('blocked','failed','cancelled') then
  update public.studio_tasks set status='queued',attempts=0,error='',available_at=now(),
   lease_token=null,lease_until=null,updated_at=now() where id=task.id;
  update public.studio_tasks set status='cancelled',lease_token=null,lease_until=null,updated_at=now()
   where parent_task_id=task.id and delegation_id=task.delegation_id and status in ('queued','running');
 elsif p_action='approve' and task.status='review' then
  update public.studio_tasks set status='done',updated_at=now() where id=task.id;
  update public.studio_tasks set status='done',updated_at=now()
   where parent_task_id=task.id and delegation_id=task.delegation_id and status='review';
 else return jsonb_build_object('status','invalid_transition'); end if;
 return jsonb_build_object('status','updated');
end $$;
