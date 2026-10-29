# GuildOS agent workspace roadmap

Status reviewed 2026-10-29 against `main` at `99c8c98`. Checked items are implemented in the current studio. Unchecked items include remaining scope; where an item is partly done, the missing pieces are listed instead of checking it off.

## Shared project channels

- [x] Make the project-wide conversation the shared channel for the project’s human operator and all five specialists. Human messages, agent replies, progress updates, and review results appear in the same feed.
- [x] Add an `@` mention picker with searchable agent names, arrow-key navigation, `Enter` to insert, and `Escape` to dismiss (`src/components/studio/guild-panel.tsx`).
- [x] Make mentions visible and actionable to every channel participant, including the mentioned agent. Mentions render as highlighted inline references, and sending one enqueues a durable specialist task.
- [x] Preserve the project brief, latest canvas, recent conversation notes, and review summaries as shared context for agent runs (`src/lib/studio/agents/worker.ts`). Decisions are retained as conversation notes rather than a separate structured decisions store.

## Workspace conversations and direct messages

- [ ] Add a Conversations area to the workspace dashboard with channel and direct-message navigation. Conversations currently live only inside each project; there is no workspace-level Conversations route.
- [ ] Support direct messages to each specialist with workspace-level context across the user’s projects. The existing specialist-message API is project-scoped and requires a `projectId`.
- [ ] Let users ask cross-project questions, such as what the Creative Director is currently handling.
- [ ] Link answers and messages back to the relevant project, task, or design artifact.

## Central agent task board

- [x] Build one workspace-level kanban board at `/studio/tasks` for work assigned to every agent across all projects. Columns are Queued, In progress, Review, Done, and Needs attention.
- [x] Add project and agent filters, pagination, and an embedded project-scoped task list in the editor.
- [ ] Add saved views for each specialist and project.
- [ ] Let agents review their assigned tasks, update their own status, and share blockers with the team. Current status transitions are driven by the worker and QA gate; agents produce summaries and errors but do not operate the board directly.
- [x] Persist tasks with their source conversation note, project, assigned agent, and result version, and surface completed work in the project conversation for approval.
- [ ] Link task details directly to the source message and the design version they produced. Task details currently show the full instruction, agent summary, and an **Open project** action.
- [x] Show ownership, workflow status, project, and created time across board cards and task details.
- [ ] Show priority, due date, and rendered activity/workload on the board. Per-task activity events are available from the task API but are not displayed yet; priority and due dates do not exist in the task schema.

The board lives at workspace level so cross-project workload is visible in one place. Project and agent filters provide focused views without splitting tasks across separate boards.
