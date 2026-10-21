-- Explain whether a worker is waiting for another request or the workspace cap.
create or replace function public.studio_generation_wait_reason(p_workspace uuid)
returns text language sql security definer set search_path=public as $$
 select case
  when lease_until > now() then 'busy'
  when day = current_date and attempts >= 30 then 'daily_limit'
  else 'available'
 end
 from public.studio_generation_limits
 where workspace_id = p_workspace;
$$;
revoke all on function public.studio_generation_wait_reason(uuid) from public,anon,authenticated;
grant execute on function public.studio_generation_wait_reason(uuid) to service_role;
