-- Workspace-scoped usage windows and deterministic latest-version previews.
create index if not exists studio_versions_workspace_activity
 on public.studio_versions(workspace_id, created_at desc, id);
create index if not exists studio_versions_project_latest
 on public.studio_versions(project_id, created_at desc, id desc);
create index if not exists studio_agent_messages_workspace_usage
 on public.studio_agent_messages(workspace_id, created_at desc, id)
 where author_kind = 'agent';
