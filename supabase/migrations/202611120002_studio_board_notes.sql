-- Sticky notes on a project's board: free-form text the team leaves next to screens.
-- Owners read them through RLS; the server writes after checking the project.

create table if not exists public.studio_board_notes (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null,
 workspace_id uuid not null,
 body text not null default '' check (length(body) <= 2000),
 color text not null default 'yellow' check (color in ('yellow','green','blue','pink','gray')),
 x integer not null default 0 check (x between -200000 and 200000),
 y integer not null default 0 check (y between -200000 and 200000),
 width integer not null default 240 check (width between 160 and 640),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 foreign key (project_id, workspace_id) references public.studio_projects(id, workspace_id) on delete cascade
);
create index if not exists studio_board_notes_project on public.studio_board_notes(project_id) where deleted_at is null;

alter table public.studio_board_notes enable row level security;
drop policy if exists board_note_owner on public.studio_board_notes;
create policy board_note_owner on public.studio_board_notes for select to authenticated
 using (workspace_id in (select id from public.studio_workspaces where owner_id = (select auth.uid())));
revoke all on public.studio_board_notes from public, anon, authenticated;
grant select on public.studio_board_notes to authenticated;
grant all on public.studio_board_notes to service_role;
