# Sequential agent pipeline

Apply migrations in filename order through `202610200001_studio_sequential_pipeline.sql` before deploying the worker and web app. The new migration adds private draft checkpoints, fences publication behind QA, disables legacy delegation/handoff RPCs, and requeues unfinished legacy groups through the new pipeline. Existing saved versions are preserved. An application service key can invoke installed RPCs but cannot apply SQL migrations; use the database deployment connection or Supabase SQL Editor.

`npm run dev` starts the worker with the app when credentials are configured. `npm run worker` runs it independently. Production needs a supervised persistent process with the same Supabase URL, service credentials, encryption key and provider connections as the web app. The worker polls every ten seconds when idle. Multiple worker replicas are safe: database claims serialize a workspace and a private turn retains ownership between checkpoints.

## State machine

Every queued user prompt follows the same order, including prompts mentioning a specialist:

1. UX Architect: root mobile screen and structural containers/grid only.
2. Creative Direction: theme colors and surfaces on existing containers only.
3. UI Designer: functional components, verified Unsplash media and semantic Lucide icons.
4. Copywriter: text values on existing text, button and input nodes only.
5. Quality & Accessibility: read-only full-screen audit.

The order is code-defined, not selected by model planning. A stage can take up to eight compact actions, each with at most six upserts and twelve deletions. Its response adds `stage_complete` to the component envelope. `handoff` must be null: agents cannot create helpers or jump stages. Validation enforces each role's edit permissions, explicit container flex directions and the immutable active screen ID.

`studio_pipeline_drafts` holds the document, accumulated commands, base revision, stage/action, correction round and full error list. It has no browser grants or RLS read policies. Checkpoints save model usage and requeue the root task without creating a visible canvas version. Cancellation and stale lease tokens fence checkpoint writes and publication. Daily workspace exhaustion leaves the stage queued; resetting credits resumes it automatically. Retrying a failed/cancelled task clears its draft and starts from the latest visible revision.

## QA gate and corrections

QA returns findings, never edits. Deterministic validation audits the complete target screen, including pre-existing defects, rather than comparing only newly introduced issues. It checks screen composition, component flex layout, icon wrappers/dictionary, contrast, axis sizing and grid compliance. Every finding is retained and passed back to the relevant specialist. Rejection returns to the earliest responsible stage and reruns the remaining stages in their original order. At most three correction rounds are allowed; exhaustion preserves the visible canvas and fails the private turn.

Only a checkpoint at stage 5 with no findings can call `finish_studio_task` in edit mode. The database checks that the published document, command list and base revision match that approved checkpoint. One transaction creates the version and completes the task. If the user has saved a newer revision during generation, the commit is rejected rather than overwriting it. The synchronous generation/ChatGPT compatibility endpoints use the same stage machine and return only the approved result; their model slot is renewed while running.

## Scope, providers and telemetry

Each cycle resolves one 375px mobile screen ID at initialization and retains it through retries and corrections. Validation checks both sides of moves/deletes, so a node cannot be imported from or moved to another screen. Only the active screen is sent as model canvas context. Other screens remain unchanged.

Providers are tried using existing connection priorities and encrypted credentials. Each durable stage reserves the workspace request budget. Successful stage token usage is recorded in agent messages and task totals; the final version uses zero additional tokens to avoid double-counting. A crashed request before checkpoint persistence can incur unreported usage and may run again. Public stage events expose status and results, not private model reasoning.

Unsplash URLs must come from the configured connector or existing assets. Icons use the validated semantic dictionary in `ui-icons.ts`. Inline icons are fixed 16/20px boxes inside horizontal centered rows with an 8px gap. Icon controls keep the requested renderer exception of 12px vertical/16px horizontal padding; JSON spacing remains on the 8px grid.

## Verification

`tests/studio-pipeline.test.mjs` covers stage permissions, locked-screen edits, complete QA findings, contrast and missing flex directions. The queue integration test runs the migrations and worker against PGlite: private checkpoints, stage-skip rejection, premature publication, credit reset, stale tokens, cancellation, tenant isolation and final atomic publication. Provider fixtures cover all five ordered stages and rejected ad hoc handoffs. These checks do not invoke paid providers or migrate the hosted database.
