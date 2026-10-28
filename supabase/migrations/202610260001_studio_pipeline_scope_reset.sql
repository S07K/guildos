create or replace function public.reset_studio_pipeline_scope(p_task uuid,p_token uuid,p_state jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare task public.studio_tasks%rowtype; current_state jsonb;
begin
 select * into task from public.studio_tasks where id=p_task for update;
 if task.id is null or task.parent_task_id is not null or task.status<>'running'
  or task.lease_token is distinct from p_token or task.lease_until<=now() then
  return jsonb_build_object('status','stale');
 end if;
 if p_state->>'stage' is distinct from '0' or p_state->>'round' is distinct from '0' or p_state->>'action' is distinct from '0'
  or coalesce(p_state->>'targetScreenId','') !~ '^[a-zA-Z0-9_-]{1,80}$'
  or jsonb_typeof(p_state->'document') is distinct from 'object'
  or p_state->'commands' is distinct from '[]'::jsonb or p_state->'issues' is distinct from '[]'::jsonb then
  raise exception 'Invalid replacement pipeline scope';
 end if;
 if p_state->>'baseVersionId' is not null and not exists(select 1 from public.studio_versions
  where id=(p_state->>'baseVersionId')::uuid and workspace_id=task.workspace_id and project_id=task.project_id) then
  raise exception 'Invalid replacement pipeline version scope';
 end if;
 select state into current_state from public.studio_pipeline_drafts where task_id=task.id for update;
 if current_state is null then return jsonb_build_object('status','missing'); end if;
 if current_state->>'targetScreenId'=p_state->>'targetScreenId' then
  return jsonb_build_object('status','unchanged','state',current_state);
 end if;
 update public.studio_pipeline_drafts set state=p_state,updated_at=now() where task_id=task.id;
 return jsonb_build_object('status','reset','state',p_state);
end $$;

revoke all on function public.reset_studio_pipeline_scope(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reset_studio_pipeline_scope(uuid,uuid,jsonb) to service_role;
