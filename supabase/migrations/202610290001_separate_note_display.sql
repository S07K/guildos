create or replace function public.enqueue_studio_task(p_project uuid,p_actor uuid,p_request uuid,p_text text,p_role text,p_version uuid,p_display text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare workspace uuid; task studio_tasks%rowtype; note studio_agent_notes%rowtype;
begin
 select p.workspace_id into workspace from studio_projects p join studio_workspaces w on w.id=p.workspace_id
 where p.id=p_project and w.owner_id=p_actor for update of p;
 if not found then return jsonb_build_object('status','not_found'); end if;
 select * into task from studio_tasks where project_id=p_project and request_id=p_request;
 if found then
  if task.instruction<>p_text or task.agent_role<>p_role then return jsonb_build_object('status','conflict'); end if;
  select * into note from studio_agent_notes where id=task.source_note_id;
  if note.version_id is distinct from p_version or note.body is distinct from p_display then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','replayed','task',to_jsonb(task),'note',to_jsonb(note));
 end if;
 if p_version is not null and not exists(select 1 from studio_versions where id=p_version and project_id=p_project and workspace_id=workspace) then return jsonb_build_object('status','not_found'); end if;
 if (select count(*) from studio_tasks where workspace_id=workspace and status in('queued','running'))>=20 then return jsonb_build_object('status','full'); end if;
 insert into studio_agent_notes(project_id,workspace_id,version_id,author_role,mentioned_role,anchor,body)
 values(p_project,workspace,p_version,'human',p_role,'page',p_display) returning * into note;
 insert into studio_tasks(project_id,workspace_id,actor_id,request_id,source_note_id,agent_role,instruction)
 values(p_project,workspace,p_actor,p_request,note.id,p_role,p_text) returning * into task;
 return jsonb_build_object('status','queued','task',to_jsonb(task),'note',to_jsonb(note));
end; $$;

revoke all on function public.enqueue_studio_task(uuid,uuid,uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.enqueue_studio_task(uuid,uuid,uuid,text,text,uuid,text) to service_role;
