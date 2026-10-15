# GuildOS Studio — first working release

The app lives at `/studio`, with email-code sign-in at `/signin`. It supports one private workspace per account, saved briefs, an encrypted OpenAI key, generated landing pages, feedback-based revisions, version history, desktop/mobile previews, HTML export, and token usage per saved version.

## Configure locally before deploying

1. Apply `supabase/migrations/202610110001_studio.sql`, `202610140001_studio_agent_notes.sql`, and `202610140002_studio_agent_messages.sql` to your Supabase project in filename order. Apply `202610150001_ai_signin.sql` for ChatGPT OAuth and `202610150002_retire_chatgpt_bridge.sql` to remove its obsolete encrypted credentials. These migrations do not change waitlist tables. Prefer a separate development project while testing.
2. Keep the existing `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Add `SUPABASE_PUBLISHABLE_KEY` from Supabase's API settings. This is the publishable key, not the server secret or service-role key.
3. Run `openssl rand -hex 32` locally and put the result in `STUDIO_VAULT_KEY` in your ignored `.env.local`. Keep this secret stable and backed up: changing it makes existing saved OpenAI keys unreadable until users reconnect them. Never put it in a `NEXT_PUBLIC_` variable.
4. Set `NEXT_PUBLIC_APP_URL=http://localhost:3000` for the existing waitlist and `STUDIO_APP_URL=http://localhost:3000` for studio generation locally. In production, set the server-only `STUDIO_APP_URL` to your canonical browser origin (for example, `https://www.guildos.design` if the bare domain redirects there). For previews, use that deployment's origin, or leave it unset to use the server request URL. An explicit value avoids origin mismatches behind a proxy. Never use a production origin for local tests.
5. In Supabase Authentication, enable email sign-in and user signups. Update the **Magic Link** email template to include `{{ .Token }}` (for example, `Your GuildOS sign-in code is {{ .Token }}`). This app verifies codes, not magic-link redirects. Configure SMTP before inviting external users; Supabase's default mail service restricts delivery.
6. Run `npm run dev`, open `/signin`, request a code, and sign in. In Connections, paste your OpenAI API key. The first guild run validates provider access. The default model is `gpt-4.1-mini`; optionally configure `STUDIO_OPENAI_MODEL` with a Responses API model that supports strict structured outputs.
7. Meet the five specialists on the new-project screen, then save a project with a title, a detailed brief, and a real HTTPS button destination. Run the guild, open the Guild tab to read role comments, and leave a section comment or mention a specialist before the next revision. In the AI panel, choose a named specialist to open that project's private chat; its replies use the brief, latest draft, and guild notes. A specialist can mention another person in the guild thread, or you can use a reply as the next revision direction. Switch between saved versions and export HTML. Verify a second account cannot see the first account's projects or comments.

## ChatGPT plan connection

The `apps/ai-signin` Next.js app handles provider authorization, callbacks, encrypted credentials, and refresh. The repository dev runner starts it locally on `http://127.0.0.1:8787` alongside GuildOS. It creates random local-only service and vault secrets in the ignored `.data` directory, then passes them to both apps. Ctrl+C stops both. The service uses the same `SUPABASE_URL` and `SUPABASE_SECRET_KEY` as Studio; `STUDIO_VAULT_KEY` remains separate for OpenAI API keys.

Apply `202610150001_ai_signin.sql` and `202610150002_retire_chatgpt_bridge.sql`, configure `OPENAI_CLIENT_ID` in `.env.local` when OpenAI issues GuildOS a client, then run `npm run dev`. The Connections page starts the browser authorization-code flow. To enable plan inference, OpenAI must also approve the plan-usage scopes; without that approval the connection will report identity only and the OpenAI API-key option remains usable. Never enable `OPENAI_CHATGPT_PLAN_USAGE` before approval. See [AI Sign-In service setup](./ai-signin-service.md) for Vercel deployment and the complete variable list.

`npm start` still runs the main GuildOS app only. Deploy the sign-in app as the separate Vercel project described in `docs/ai-signin-service.md`; no Codex bridge service or `codex` executable is part of the local or hosted sign-in flow.

Add the publishable key and vault secret to Vercel before deploying the studio. Supabase URL, publishable key, server key and database migrations must all belong to the same project. The generation route has a 120-second maximum duration; the OpenAI guild makes five model calls in three sequential rounds, with a 35-second timeout per call, so ensure your hosting plan supports the route duration. Each guild run uses more tokens than a single draft request. Do not publish these changes until you have completed the hosted smoke test above. The marketing site still uses its existing waitlist.

## Verification

```sh
npm test
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100 npm run build
PLAYWRIGHT_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:e2e
PLAYWRIGHT_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:studio
```

The local tests use real PostgreSQL semantics through PGlite for tenant isolation and locking, cryptographic tests for the key vault, and mocked provider responses for generation/revision and error handling. Studio browser tests use a separate localhost Supabase fixture and simulated ChatGPT bridge; no test auth bypass exists in the app. They do not prove live email delivery or live provider access. Run the manual hosted workflow with your own account before launch. Rebuild for deployment with the production origin, not the test origin.

## Boundaries of this release

- Single-owner workspaces. Team invitations, enterprise SSO, and role management come later.
- The model generates structured page content, selects a palette and one of three layouts, and supplies a short design rationale. A blank canvas also supports manual shapes, text, selection, movement, resizing, and SVG-backed HTML export. This is not arbitrary code generation or a Figma integration.
- Schema validation, fixed color tokens, escaped HTML and an empty iframe sandbox protect previews. Generated HTML includes no scripts, trackers, external assets or working forms. Its CTA links to your supplied HTTPS destination.
- Revisions include the original brief, the selected prior version and new feedback. Manual content, typography, and palette edits save as new versions with zero tokens and no provider request. Previous versions remain immutable. Brief text is fixed per project in this release; create another project for a new brief.
- Keys are encrypted with AES-256-GCM and workspace-bound authenticated data. Only server service-role calls can access ciphertext. Normal project access uses the authenticated user's token and RLS.
- One model request at a time per workspace; 30 attempts per UTC database day, shared by generation and agent chat. A three-minute lease recovers abandoned requests. Failed requests count toward this limit and may incur provider charges. Token usage is recorded on saved designs and agent replies; dashboard costs use documented standard rates where available. Failed-call usage accounting is not included yet.
- The five OpenAI specialist stages share the brief, prior design, and recent project comments within a run. They leave version-scoped comments and mentions, and later runs read that discussion. Named specialists also have separate project chats that read the brief, latest design, shared discussion, and their own conversation history. An agent can create a handoff by mentioning another specialist; the user can carry a reply into the next guild revision. Agent notes and chats are not autonomous background jobs or live streaming. Shared vector memory, asset uploads, payments, and a deployment service remain future work.

References: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), and the repository's `skills/frontend-design_SKILL.md` for the studio's visual direction.
