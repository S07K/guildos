# Agent canvas implementation plan

Status: implementation started on 2026-10-16.

First increment implemented: route-specific dashboard reads, latest-version card projections, a 90-day usage window, concurrent independent reads, navigation pending indicators, a studio loading boundary, project-wide human messages, and inline mention styling without duplicate chips. Database indexes are supplied in `202610160001_studio_dashboard_indexes.sql` and have not been applied to hosted Supabase.

Still pending in milestone 1: deployed before/after latency measurements, server-side usage aggregation and project pagination at larger scale, and lazy version history in the editor. The task queue now handles server-side dispatch. MCP, multi-agent handoffs, and realtime subscriptions remain subsequent milestones.

Second increment implemented: validated canvas command batches; a scoped current-document API; atomic version commits with expected-version checks, request deduplication, and an audit trail; manual and generated saves using that transaction; and conflict UI that keeps local edits. Existing immutable version IDs serve as revision tokens rather than adding a second numeric revision counter. See [the command contract](canvas-commands.md). Images, automatic rebasing, and realtime subscriptions remain pending. Apply `202610160002_studio_canvas_commits.sql` before using the updated save APIs.

Third increment implemented: durable message/task dispatch, a standalone worker with leases and retries, validated model proposals, cancellation fencing, transactional result commits, a workspace kanban with project/agent filters, result-version links, and safe polling of task/canvas changes. Ari can schedule up to 12 small component actions, reusing specialists; each assignment and Vale's QA pass is a separate queue job claimed by that agent. See [Agent worker](agent-worker.md) for startup and limitations. Hosted activation requires migrations through `202610160008_studio_agent_job_queue.sql` and a running worker. MCP transport and realtime subscriptions remain pending.

## Outcome

A user can ask a specialist to build or revise a food ordering experience in the project conversation. One specialist handles each instruction as a durable task and produces an editable canvas version for review. Users retain control through cancel, retry, approval, manual edits, and version history. Multi-specialist planning and mid-run chat steering remain future work.

Keep Next.js App Router, React, MUI, Supabase, existing provider credentials, and the current canvas renderer. This is an extension of the studio, not a replacement or a new marketing site.

## Findings

- `src/lib/studio/agent-chat.ts` produces text replies and explicitly prohibits claiming canvas edits. Mentions do not execute design tasks.
- `src/components/studio/guild-panel.tsx` saves a note and then asks the browser to trigger one mentioned agent. Dispatch can be lost if the browser closes between these requests. Notes poll every five seconds.
- `src/components/studio/project-editor.tsx` defaults its legacy section selection to `hero`, which becomes an unwanted message tag. The user confirmed both unwanted tags and non-executing agents as bugs.
- `src/lib/studio/guild.ts` already coordinates specialist reviews, but produces a structured landing-page document rather than general canvas operations. QA is a written review, not a measured validation gate.
- Canvas nodes support frames, shapes, text, lines and paths. Images are absent. Current validation caps documents at 200 nodes and saves at 30 KB; these limits need deliberate revision for multi-screen projects.
- Versions validate parent ownership but do not atomically verify the current revision. The editor holds unsaved state locally. Concurrent edits need a shared commit protocol.
- Overview, Projects, and Usage all call `dashboardData()`, which sequentially retrieves all projects, full version documents, and message history. Project detail also loads every full version.
- There is no studio loading boundary. Auth verification occurs in both the proxy and server session; `studioSession` already uses request memoization. These are profiling targets, not measured latency conclusions.
- Current workspace isolation is owner based. Existing generation limits allow one request per workspace and can block chat during generation.

## Architecture

```text
Project chat -> persisted instruction + queued run -> durable worker
                                                    |
                                         planner / specialist tools
                                                    |
                                       canvas command service
                                         /                \
                               revision transaction    task/usage events
                                      |                       |
                               live canvas              chat + kanban

Authenticated MCP clients -> scoped MCP adapter -> same command service
```

MCP exposes tools; orchestration schedules work; database transactions protect edits; realtime events update the browser. Keep these responsibilities separate. Internal agents and MCP clients use the same validated command handlers.

Use a Postgres-backed job queue and a separately deployed Node worker initially, matching the existing stack. Do not run long jobs as unawaited work in a Next.js request. Confirm hosting support for a worker before deployment; if hosting cannot run one, select a durable job service without changing the command contracts.

## Delivery sequence

### 1. Navigation and chat foundations

- Measure production-build navigation timings, server query durations, response sizes, and editor bundle cost. Separate cold compilation from normal navigation.
- Split dashboard queries by page. Projects reads paginated metadata and latest-version summaries; Overview reads bounded summaries; Usage uses server aggregates and date ranges. Fetch independent data concurrently. Load old version documents on demand.
- Add route loading boundaries, visible pending navigation, and appropriate prefetching. Preserve the shell. Keep private data scoped to the authenticated workspace; avoid shared user-data caches.
- Trace duplicated auth work before changing it; preserve session refresh and authorization checks.
- Default project chat to project-wide context. Attach a frame/layer only when explicitly selected for the message, using its stable node ID. Render inline mentions and optional context links without duplicate mention chips.
- Save messages immediately with queued/running/failed status and retry affordances. Work dispatch becomes a server responsibility in milestone 3.

Acceptance: no unsolicited `hero` tags; clear mention rendering; pending navigation appears promptly; Projects does not download all design documents or message history. Record before/after p50 and p95 measurements. Target warm navigation feedback within 100 ms and route content within 500 ms p95 on the agreed deployment/network, subject to baseline measurement.

### 2. Shared canvas operations and assets

- Introduce a canonical current document, monotonic revision, and operation log while retaining saved versions as checkpoints.
- Add typed operations for create/update/delete nodes, move/resize, parenting/reordering, text/style updates, and atomic batches. Extend to design tokens and reusable components after basic editing works.
- Every commit includes an expected revision and idempotency key. Validate scope and schema, compare the revision, commit operations and audit events atomically, and return the new revision. Reject stale writes with a structured conflict response.
- Route human edits through the same command service. Send committed interaction batches, not every pointer movement. Preserve local pending edits and resynchronize/rebase or surface conflicts explicitly; never blindly replace a dirty document.
- Start with one mutating agent per project while research/copy work can run concurrently. This reduces contention; revision checks still protect human edits.
- Add image nodes, upload/paste, resize/crop and alt text. Store assets through a local/cloud storage interface with workspace-scoped ownership, MIME/size validation, and signed access. Update canvas rendering, export, and content security rules together.
- Keep legacy landing-page documents readable; provide an explicit conversion to canvas nodes that preserves the original version.

Acceptance: stale writes cannot overwrite newer edits; repeated commands do not duplicate nodes; uploaded images survive reload/export; undo preserves unrelated later work. Review document/node budgets with realistic multi-screen fixtures.

### 3. Durable agent execution and MCP

- Add runs, jobs, steps/tool calls, instructions, task dependencies, and durable events. Claim jobs with leases, heartbeat, retries/backoff, cancellation, bounded runtime/tool calls, and per-workspace budget/concurrency controls.
- Persist message and dispatch intent atomically. A mention selects the specialist; an unmentioned execution request goes to Ari. Distinguish questions from work requests, and clarify only material ambiguities.
- Implement one vertical slice first: mention -> queued task -> agent creates a frame and text -> canvas updates -> task enters review -> chat links the result. Then expand to multi-screen workflows and specialist handoffs.
- Provide tools such as `project.get_context`, `canvas.get_document`, `canvas.get_nodes`, `canvas.apply_operations`, `canvas.render_preview`, `assets.list`, `tasks.create`, `tasks.update`, and `project.search_memory`.
- Add a protocol-compliant MCP adapter with schema discovery and structured results/errors, using a pinned SDK/protocol combination verified against the official documentation at implementation time. Use authenticated Streamable HTTP for remote access; test protocol compatibility explicitly.
- Derive workspace/project authorization from verified identity or scoped run credentials on every call. Never trust a model-supplied workspace ID. Keep provider credentials and service keys server side. RLS and composite ownership constraints also apply to new tables, assets, and event subscriptions.
- Record usage per attempt, role, project, run and task, including failed/retried requests where usage is available. Preserve existing provider adapters; validate tool-execution capabilities for each supported connection.

Acceptance: browser closure does not stop a run; worker restart resumes safely; retry does not duplicate edits; unauthorized projects are inaccessible; user messages remain available during generation.

### 4. Live canvas, chat steering, and task board

- Publish committed canvas/task/run events through authenticated Supabase Realtime channels. Persist ordered event IDs so reconnects can reconcile from a revision/event cursor; refetch snapshots when gaps occur.
- Show agent identity, active task, changed nodes, tool activity summaries, and output previews. Show concise decisions and progress, not private model reasoning.
- New user instructions create durable control events. Workers consume them between steps and before commits; a changed control revision prevents a stale planned edit from committing. Pause/cancel prevents subsequent commits and attempts provider abort where supported.
- Add a workspace Tasks route, with project and agent filters and an embedded project view. Columns: Backlog, Ready, In progress, Review, Done; show Blocked with a reason. Failed/cancelled run states remain distinct from task workflow states.
- Cards show owner, dependency/blocker, priority, source message, output frame/version, and activity. Worker events drive progress; manual moves follow validated transitions. Review acceptance marks tasks done. Moving cards must not falsely imply a job was executed.

Acceptance: two open sessions converge without losing local edits; reconnect catches up; pause prevents later commits; chat stays usable while agents work; task cards link directly to actual results.

### 5. Specialist quality loops and shared memory

- Ari plans, Noor maps flows, Pip writes copy, Mira builds screens, and Vale reviews. Persist dependencies and enforce bounded critique/revision loops.
- Add deterministic checks for measured contrast where computable, bounds/overlap, token consistency, and required content. Identify checks needing rendered inspection or human review. Route failed checks back to the responsible task; label working drafts separately from reviewed output.
- Index project briefs, approved decisions, brand documents, feedback and revision summaries in workspace/project-scoped vector memory. Retrieve relevant context before planning and execution, preserving provenance, version, deletion and reindexing behavior.
- Follow the context retrieval and continuous capture pattern in `supermemoryai/claude-supermemory`; do not copy its global personal-memory scope into a multi-tenant product.

Acceptance: a complete food ordering design can be created and revised through chat; bounded QA corrections occur before review completion; retrieved context never crosses authorized workspace/project boundaries.

## Verification and implementation boundaries

Use the existing Node test, Postgres/PGlite and Playwright setup. Prioritize tenant-isolation tests, atomic revision/idempotency tests, worker crash recovery, cancellation-before-commit, concurrent human/agent edits, event reconnect, upload authorization, chat rendering, and navigation measurements. Use deterministic provider fixtures plus one configured live-provider smoke flow. Do not claim semantic accessibility compliance from canvas-only checks.

Suggested new modules: `src/lib/studio/canvas-commands`, `src/lib/studio/agents`, `src/lib/studio/tasks`, `src/lib/studio/events`, `src/lib/studio/storage`, `src/lib/studio/mcp`, plus a worker entry point and incremental Supabase migrations. Final file layout should follow patterns found during implementation.

Workspace DMs, cross-project autonomous edits, additional provider integrations, and external Figma workflows follow the core vertical slice. Keep the existing broader roadmap; this plan supplies the execution order for the canvas and agent work.

## References

- MCP TypeScript SDK: https://ts.sdk.modelcontextprotocol.io/
- MCP transport specification: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/transports/streamable-http.mdx
- Shared context/capture reference: https://github.com/supermemoryai/claude-supermemory
