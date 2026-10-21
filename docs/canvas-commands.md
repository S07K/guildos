# Canvas command and revision contract

## Install

Apply Supabase migrations in filename order before running this release. In particular, `202610160002_studio_canvas_commits.sql` is required for manual and generated saves. It depends on the composite version index created by `202610140001_studio_agent_notes.sql`. This migration adds an audit table and a service-only transaction function; it does not rewrite saved designs.

Hosted migrations have not been applied by this change. The SQL is exercised locally using PGlite, and the UI uses a local Supabase fixture in browser tests.

## Read and edit

`GET /api/studio/canvas?projectId=<uuid>` returns `{ projectId, versionId, document }`. A new project has a null version and a blank canvas. Existing legacy landing-page documents remain readable; node commands require a canvas document.

`POST /api/studio/canvas/commands` requires an authenticated studio session and same-origin request. Example body:

```json
{
  "projectId": "<project UUID>",
  "expectedVersionId": "<version UUID from GET, or null>",
  "requestId": "<new UUID for this logical batch>",
  "commands": [
    { "type": "update", "id": "headline", "patch": { "text": "Choose your meal" } },
    { "type": "document", "patch": { "background": "#fafafa" } }
  ]
}
```

Supported operations:

- `create`: supply a complete validated node, including a caller-generated unique ID.
- `update`: supply a node ID and a partial patch of editable fields. ID and type cannot change. `parentId: null` detaches a node.
- `delete`: remove one node. Removing a container detaches its direct children; flow children become root siblings. Delete descendants explicitly when removing a subtree through the API. The editor’s Delete action removes a selected flow subtree.
- `reorder`: supply every node ID exactly once, in document order.
- `document`: update width, height, or background.

A batch accepts 1–400 commands and at most 256 KB of request data. Existing document limits (including 200 nodes) remain in effect. Auto-layout frames and containers may nest up to 32 levels. Cycles and missing or non-container parents are rejected. The reducer applies a batch to a copy and validates the resulting document; an invalid batch saves nothing. The larger operation limit allows an agent to replace an existing layer while keeping deletion and creation atomic.

## Commit semantics

The immutable version UUID acts as the revision token. `commit_studio_version` locks the project row, checks the current version, inserts the snapshot and audit entry atomically, then releases the lock. Created timestamps increase within each project so historical ordering remains deterministic.

A successful new commit returns HTTP 201 with `version` and `replayed: false`. Retrying the same logical batch with the same request ID returns HTTP 200 and the original version with `replayed: true`, even if later versions exist. Reusing the ID with different content returns HTTP 409 (`idempotency_conflict`). A stale expected version returns HTTP 409 (`revision_conflict`) with `currentVersionId`; it never overwrites the current document. Read current state before planning another batch.

Manual snapshot saves at `/api/studio/versions` use the same transaction. They require `expectedVersionId`, `parentVersionId` (nullable), and `requestId`, in addition to `projectId` and `document`. Expected version means the latest observed project head; parent means the version being edited. Keeping these separate supports deliberate edits from history without bypassing conflict checks.

The editor retains the same request ID for retries of unchanged manual edits. On conflict it preserves local changes and offers an Open latest link in another tab. It does not automatically merge or discard edits. Generation also checks the head before its provider call and during commit; a completed result that loses the commit race is returned as a local draft. Provider calls themselves are not replayable yet, and unsuccessful generation can still incur usage.

## Authorization and future adapters

HTTP handlers verify the session and use RLS to resolve the project. The service-only commit function independently verifies project/workspace ownership against the authenticated actor supplied by the handler. Parent versions must belong to that project. Audit reads use workspace RLS; authenticated clients cannot invoke the transaction function directly.

Future workers and MCP tools should reuse `applyCanvasCommands` and `commitVersion` after resolving their authorized project context. All application version writers now use this transaction. Direct administrative inserts outside the application do not participate in the locking protocol and must not be used as a competing writer.

This increment does not implement automatic rebasing, realtime subscriptions, image assets, background workers, or an MCP transport.

## Validation recorded

Production build and TypeScript compilation passed. Four canvas/transaction tests passed, including local PostgreSQL migration execution and isolation checks. All three studio browser tests passed against local fixtures, including command replay, stale-save rejection, local draft preservation, and current-version reads. Hosted database integration and true multi-process contention have not been exercised.


## Component auto layout

All canvas specialists, including QA, emit the same strict JSON contract defined in `src/lib/studio/design-system.ts`. The planner uses a separate scheduling envelope; it does not emit canvas nodes.

```json
{
  "mode": "edit",
  "summary": "Added the primary action.",
  "upsert_nodes": [{
    "id": "primary-action",
    "parentId": "screen",
    "type": "button",
    "layoutMode": "HORIZONTAL",
    "primaryAxisSizingMode": "FILL",
    "counterAxisSizingMode": "HUG",
    "padding": 16,
    "itemSpacing": 8,
    "properties": {
      "text": "Continue",
      "backgroundColor": "accent",
      "color": "on-accent",
      "borderRadius": 8
    }
  }],
  "delete_ids": []
}
```

Types: `container`, `text`, `image`, `icon`, `button`, `input`. Cards and badges are styled containers. A screen root has `parentId: null`; child IDs reference an existing container (or one created in the same batch). Inputs are leaves. Images reuse uploaded asset IDs; icons use the local Lucide catalog. Properties support names, text, foreground/background/border colors, border width/radius, typography, alignment, asset ID/image fit, and icon name. Unknown properties, raw coordinates, raw width/height, invalid tokens, duplicate IDs, missing parents and cycles fail validation atomically.

The provider schema declares all fields required; optional styles are nullable. Backend ingestion also accepts omitted style/layout values and supplies safe defaults: VERTICAL, primary HUG, counter FILL, zero spacing, and component styles. `padding`, `itemSpacing` and `properties.borderRadius` round to the nearest multiple of 8. Spacing is bounded to 0–496; radius to 0–1000. Nonfinite values, negative numbers and nonnumeric values are rejected. Zero is on the grid.

The primary axis follows the node's own layoutMode (HORIZONTAL = width; VERTICAL = height); the counter axis is perpendicular. Leaf nodes default to VERTICAL. HUG sizes to content and FILL uses parent space. FIXED uses catalog dimensions: icons 24×24, images 240×160, buttons 160×48, inputs 240×48, containers 320×240. Container fixed height is a minimum so content can expand without clipping. Text height always HUGs. A FILL dimension under a HUG parent dimension normalizes to HUG to remove circular sizing. Rows wrap and text uses browser metrics.

Available color tokens: `surface`, `surface-muted`, `text`, `text-muted`, `accent`, `on-accent`, `border`, `danger`. Tokens resolve to six-digit HEX before storage; arbitrary HEX colors are also accepted. No model-supplied CSS or token URLs are evaluated.

Each agent response permits at most six layer upserts and twelve deletions. The command API accepts component nodes for create and component property patches for update, applying the same sanitation. The manual command batch limit remains 400 for atomic editing operations. Stored nodes keep `flow`, `layout` and `sizing` plus compatibility geometry. Existing manual/legacy canvases remain readable; new model output always uses components. Both editor and HTML preview share the Flexbox style mapper. New buttons render native button markup in previews; inputs render labeled read-only inputs. These are design controls, without application submission or navigation wiring.

QA measures grid compliance, axis contradictions and foreground/background contrast (4.5:1 normal text, 3:1 large text). QA proposes corrections through the same edit schema in at most three actions of six upserts each. It stops when healthy or no progress is made. Unresolved deterministic issues block completion. Corrected snapshots use the same revision fence and tenant checks as other agent edits.

Apply `202610180002_studio_component_actions.sql` before starting workers. It permits Creative Direction editing actions and advances the parent to human review when QA commits corrections. Existing JSON snapshots need no destructive migration.
