# GuildOS Studio — first working release

The app lives at `/studio`, with email-code sign-in at `/signin`. It supports one private workspace per account, saved briefs, an encrypted OpenAI key, generated landing pages, a manual canvas, revision-safe saves, version history, desktop/mobile previews, HTML export, agent task tracking, and token usage per saved version.

For automated production migrations and Vercel deployment, follow [Production deployment](deployment.md). All migration files are applied in filename order; databases previously configured through the SQL Editor need the one-time history reconciliation described there.

## Configure locally before deploying

1. Apply `supabase/migrations/202610110001_studio.sql`, `202610140001_studio_agent_notes.sql`, and `202610140002_studio_agent_messages.sql` to your Supabase project in filename order. Apply `202610150001_ai_signin.sql` for ChatGPT OAuth and `202610150002_retire_chatgpt_bridge.sql` to remove its obsolete encrypted credentials. Also apply `202610160001_studio_dashboard_indexes.sql` through `202610160008_studio_agent_job_queue.sql` in order before using agent activity, OpenRouter, or delegated Kanban jobs. Also apply the later migrations through `202610190001_studio_agent_handoffs.sql` for component actions and blocked-agent prerequisite handoffs. Migration `008` replaces inline subtasks with independently claimed agent jobs. The canvas commit migration is required for manual and generated saves; see [Canvas commands](canvas-commands.md). Prefer a separate development project while testing.
2. Keep the existing `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Add `SUPABASE_PUBLISHABLE_KEY` from Supabase's API settings. This is the publishable key, not the server secret or service-role key.
3. Run `openssl rand -hex 32` locally and put the result in `STUDIO_VAULT_KEY` in your ignored `.env.local`. Keep this secret stable and backed up: changing it makes existing saved OpenAI keys unreadable until users reconnect them. Never put it in a `NEXT_PUBLIC_` variable.
4. Set `STUDIO_APP_URL=http://localhost:3000` for studio generation locally. In production, set the server-only `STUDIO_APP_URL` to `https://www.guildos.design` (the bare domain redirects there). For previews, use that deployment's origin, or leave it unset to use the server request URL. An explicit value avoids origin mismatches behind a proxy. Never use a production origin for local tests.
5. In Supabase Authentication, enable email sign-in and user signups. Update the **Magic Link** email template to include `{{ .Token }}` (for example, `Your GuildOS sign-in code is {{ .Token }}`). This app verifies codes, not magic-link redirects. Configure SMTP before inviting external users; Supabase's default mail service restricts delivery.
6. Run `npm run dev`, open `/signin`, request a code, and sign in. In Connections, paste an OpenRouter or OpenAI API key. OpenRouter keys are verified through its key endpoint before encrypted storage. OpenRouter is used after ChatGPT and Groq for new agent tasks, project generation, and specialist chat, using `nvidia/nemotron-3-super-120b-a12b:free`. Apply `202610160006_studio_openrouter_free_default.sql` to switch existing OpenRouter connections from the former paid default. The generator and specialist chat can fall back to another connected provider on a usage limit. The OpenAI default model is `gpt-4.1-mini`; optionally configure `STUDIO_OPENAI_MODEL` with a Responses API model that supports strict structured outputs.
7. Meet the five specialists on the new-project screen, then save a project with a title, a detailed brief, and a real HTTPS button destination. Run the guild, open the Guild tab to read role comments, and leave a section comment or mention a specialist before the next revision. Open a project conversation, mention a specialist, and send a build instruction. The local `npm run dev` command starts the agent worker alongside the web app when Supabase server credentials are configured. Work from the Tasks page, then approve or continue revising the saved canvas. Switch between saved versions and export HTML. Verify a second account cannot see the first account's projects or comments.

## Hosted worker (production, no extra server)

On Vercel there is no always-on process, so agent tasks run in short invocations of `POST /api/worker`:

- When a message or brief is queued (or a task is retried), the app calls the endpoint after responding. The endpoint replies `202` immediately and drains the queue in the background for up to ~200 seconds (function limit 300s), handing over to a fresh invocation if work remains.
- Every minute, Supabase `pg_cron` + `pg_net` call the endpoint, but only while work is queued or a lease expired, so retries, deferred tasks and interrupted runs resume. Migration `202611100001_studio_worker_schedule.sql` installs this; without the Vault secrets below it does nothing.
- The endpoint is outside `/api/studio/` (which requires a browser session) and accepts only `Authorization: Bearer $STUDIO_WORKER_SECRET`.

One-time setup:

1. Generate a secret: `openssl rand -hex 32`.
2. Vercel → Project → Settings → Environment Variables: add `STUDIO_WORKER_SECRET` (Production, Sensitive). `STUDIO_APP_URL` must be the production origin.
3. Production Supabase → SQL editor:
   `select vault.create_secret('https://www.guildos.design/api/worker', 'guildos_worker_url');`
   `select vault.create_secret('<the same secret>', 'guildos_worker_secret');`
4. Deploy (the workflow applies the migration). Check runs with `select * from cron.job_run_details order by start_time desc limit 5;` and responses with `select status_code, created from net._http_response order by created desc limit 5;`.

Local development is unchanged: `npm run dev` runs the worker process, and the hosted trigger is disabled outside Vercel.

## Claude connection

Connections → Claude accepts an Anthropic API key from the Claude Console (`sk-ant-…`); the key is verified against the model, encrypted with the workspace vault key, and used only by the server and worker. Requests use the official `@anthropic-ai/sdk` with structured outputs, adaptive thinking at `medium` effort (`low` for small helper calls), and the server-side refusal fallback (`fallbacks: "default"`). The default model is `claude-opus-5-5`; set `STUDIO_ANTHROPIC_MODEL` (e.g. `claude-sonnet-5-5`) to change it. Claude.ai Pro/Max subscription sign-in is not offered: third-party apps may not use consumer subscription credentials, and subscription tokens (`sk-ant-oat…`) are rejected with an explanation. Apply `202611090002_studio_anthropic_keys.sql`.

## Local database migrations

With `SUPABASE_DB_URL` in `.env.local`, `npm run dev` applies pending files from `supabase/migrations` before it starts the app and worker, using the same Supabase CLI version as the deploy workflow (`supabase db push --include-all`). If migrations fail, startup stops rather than run against an outdated schema; set `STUDIO_SKIP_MIGRATIONS=1` to start anyway. `npm run db:migrate` applies them on demand. The script refuses to run on Vercel or CI, so production is only ever migrated by the GitHub deploy workflow. If the database was migrated by hand in the SQL editor, record those files once with `npx supabase@2.118.0 migration repair --db-url "$SUPABASE_DB_URL" --status applied <version>…` so they are not replayed.

## ChatGPT plan connection

### Local ChatGPT connection through Codex

`npm run dev` selects `STUDIO_CHATGPT_AUTH=codex` when `OPENAI_CLIENT_ID` is absent. Install the official Codex CLI (`npm install -g @openai/codex`) and configure `STUDIO_VAULT_KEY` as described above. Open **Studio → Connections → Connect ChatGPT**, open the verification link, and enter the displayed code. Device-code login may need enabling in your ChatGPT security settings or workspace permissions. No OpenAI client ID or API key is required for this local connection.

The same connection runs scheduling, component edits, QA, and specialist chat through Codex with structured JSON output. Agents retain the six-layer action limit, backend validation, daily workspace allowance, and provider fallback order (ChatGPT → Groq → OpenRouter → OpenAI API). ChatGPT is preferred when connected. Set `STUDIO_CODEX_MODEL` to select a Codex-supported model; otherwise Codex selects its default. `STUDIO_CODEX_BIN` can point to an installed Codex executable.

Saved sessions are AES-256-GCM encrypted under `.data/codex`, using workspace-bound authenticated data and `STUDIO_VAULT_KEY`. Each login/action uses its own temporary CLI home; temporary credentials are removed after the subprocess exits. GuildOS does not reuse `~/.codex` or inherit provider keys into the subprocess. Model tools, plugins, MCP, and web search are disabled. The Next.js process and worker must share the local data directory and vault key. Disconnect removes this workspace’s saved connection and cancels pending sign-in.

This runner is disabled in production and for non-loopback `STUDIO_APP_URL` values. Codex app-server authentication is not permitted for commercial or hosted services; use registered Sign in with ChatGPT for those deployments. See [official authentication guidance](https://learn.chatgpt.com/docs/app-server#auth-endpoints). To test the registered OAuth flow locally, set `STUDIO_CHATGPT_AUTH=oauth`.

### Registered OAuth for hosted deployments

The `apps/ai-signin` Next.js app handles provider authorization, callbacks, encrypted credentials, and refresh. The repository dev runner starts it locally on `http://127.0.0.1:8787` alongside GuildOS. It creates random local-only service and vault secrets in the ignored `.data` directory, then passes them to both apps. Ctrl+C stops both. The service uses the same `SUPABASE_URL` and `SUPABASE_SECRET_KEY` as Studio; `STUDIO_VAULT_KEY` remains separate for OpenAI API keys.

Apply `202610150001_ai_signin.sql` and `202610150002_retire_chatgpt_bridge.sql`, configure `OPENAI_CLIENT_ID` in `.env.local` when OpenAI issues GuildOS a client, then run `npm run dev`. The Connections page starts the browser authorization-code flow. To enable plan inference, OpenAI must also approve the plan-usage scopes; without that approval the connection will report identity only and the OpenAI API-key option remains usable. Never enable `OPENAI_CHATGPT_PLAN_USAGE` before approval. See [AI Sign-In service setup](./ai-signin-service.md) for Vercel deployment and the complete variable list.

`npm start` still runs the main GuildOS app only. Deploy the sign-in app as the separate Vercel project described in `docs/ai-signin-service.md`; no Codex bridge service or `codex` executable is part of the local or hosted sign-in flow.

Add the publishable key and vault secret to Vercel before deploying the studio. Supabase URL, publishable key, server key and database migrations must all belong to the same project. The generation route has a 120-second maximum duration; the OpenAI guild makes five model calls in three sequential rounds, with a 35-second timeout per call, so ensure your hosting plan supports the route duration. Each guild run uses more tokens than a single draft request. Do not publish these changes until you have completed the hosted smoke test above.

## Free trial (no key needed)

New workspaces with no model connection of their own can run a few designs on a platform key, so people see a result before they're asked for an API key.

1. Apply `supabase/migrations/202611090001_studio_trial_runs.sql`.
2. Set `STUDIO_TRIAL_GROQ_KEY` (preferred) or `STUDIO_TRIAL_OPENROUTER_KEY` on **both** the Vercel project and the agent worker. Optionally set `STUDIO_TRIAL_MODEL` and `STUDIO_TRIAL_RUNS` (default 3; `0` disables the trial).
3. One run is one root agent task, including all five stages and retries. A run that ends blocked without publishing anything is given back. The existing per-workspace daily request limit still applies.

Creating a project now queues a first Creative Director run automatically when the workspace has a connection or trial runs left. The project conversation shows how many trial runs are left and links to Connections.

## Verification

```sh
npm test
npm run build
PLAYWRIGHT_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:studio
```

The local tests use real PostgreSQL semantics through PGlite for tenant isolation and locking, cryptographic tests for the key vault, and mocked provider responses for generation/revision and error handling. Studio browser tests use a separate localhost Supabase fixture and simulated ChatGPT bridge; no test auth bypass exists in the app. They do not prove live email delivery or live provider access. Run the manual hosted workflow with your own account before launch. Rebuild for deployment with the production origin, not the test origin.

## Boundaries of this release

- Single-owner workspaces. Team invitations, enterprise SSO, and role management come later.
- The model generates structured page content, selects a palette and one of three layouts, and supplies a short design rationale. A blank canvas also supports manual shapes, text, selection, movement, resizing, and SVG-backed HTML export. This is not arbitrary code generation or a Figma integration.
- Schema validation, fixed color tokens, escaped HTML and an empty iframe sandbox protect previews. Generated HTML includes no scripts, trackers, external assets or working forms. Its CTA links to your supplied HTTPS destination.
- Revisions include the original brief, the selected prior version and new feedback. Manual content, typography, palette, and canvas edits save as new versions with zero tokens and no provider request. Concurrent edits use the latest version ID as a revision check; stale saves are rejected while the browser keeps the local draft. Previous versions remain immutable. Brief text is fixed per project in this release; create another project for a new brief.
- Keys are encrypted with AES-256-GCM and workspace-bound authenticated data. Only server service-role calls can access ciphertext. Normal project access uses the authenticated user's token and RLS.
- One model request at a time per workspace; 30 attempts per UTC database day, shared by generation and agent chat. A three-minute lease recovers abandoned requests. Failed requests count toward this limit and may incur provider charges. Token usage is recorded on saved designs and agent replies; dashboard costs use documented standard rates where available. Failed-call usage accounting is not included yet.
- The five OpenAI specialist stages share the brief, prior design, and recent project comments within a run. They leave version-scoped comments and mentions, and later runs read that discussion. Named specialists also have separate project chats that read the brief, latest design, shared discussion, and their own conversation history. An agent can create a handoff by mentioning another specialist; the user can carry a reply into the next guild revision. Project chat instructions enqueue durable specialist tasks. A separate `npm run worker` process uses bounded retries and leases to apply validated canvas edits, save a version, and submit it for review. The workspace Tasks page supports cancellation, retry and approval. Task/canvas updates poll while the browser is visible. Multi-specialist handoffs, chat steering during a running job, an MCP endpoint, Realtime subscriptions, shared vector memory, and image assets remain future work.

References: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), and the repository's `skills/frontend-design_SKILL.md` for the studio's visual direction.

### Queued requests and daily limits

The daily GuildOS allowance resets at midnight UTC. API and worker reservation requests explicitly use the UTC database timezone. Queued messages show a warning with time remaining and the reset timestamp in the viewer’s local timezone; no resubmission is needed. The warning is based on the workspace budget, appears in chat and task views, and clears when the budget resets or work starts.

### Full-screen composition and image assets

Generated root containers are Screen Frames: mobile defaults to 375×812, tablet to 768×1024, and desktop to 1440×900, selected with `properties.screenPreset`. Width is fixed by the catalog; height grows with content. Every generated widget belongs inside a screen hierarchy. Independent screens remain separate roots. QA cannot approve a screen without readable content and a labeled primary action/input. The 8px spacing/radius sanitizer and six-upsert action limit apply throughout. Saved manual/legacy canvases remain readable.

Set `UNSPLASH_ACCESS_KEY` in the server environment to enable image search. UI design actions first return at most two specific search queries via a small structured connector action; the backend invokes `search_unsplash` and feeds its results into the normal six-layer edit response. The same transport works with Codex, Groq, OpenRouter, and OpenAI. Connector model usage is included in action telemetry. Missing image configuration does not invent photo URLs: agents can reuse uploads or omit photography.

`POST /api/studio/images` accepts `{projectId,query}` after session, same-origin, and project-access checks. Local MCP access is available through `npm run mcp:icons`. Models use `properties.imageUrl` exactly as returned. The backend verifies provenance against connector results or existing saved photos, hotlinks the CDN URL, retains attribution, and records photo selection through the Unsplash download endpoint. HTML export permits only the Unsplash CDN in addition to same-origin images. Private uploaded `assetId` images continue to work.

`properties.iconName` accepts real Lucide names (canonical or kebab case), including on button/input leading-icon slots. Unknown and empty names are rejected. The bundled names-only catalog keeps SVG payloads out of client validation.
