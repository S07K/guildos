# GuildOS AI Sign-In service

`apps/ai-signin` is a separate Next.js app in this repository. Deploy it as its own Vercel project with root directory `apps/ai-signin` and production domain `ai-signin.guildos.design`. The provider contract lives in `packages/provider-auth`; new provider adapters implement that contract and own their protocol details. The service uses short-lived, one-time OAuth transactions, PKCE, OIDC ID-token signature and claim validation, workspace-bound AES-256-GCM encryption, and service-only database access. GuildOS proxies authenticated connection actions to this service and obtains model credentials only from its server routes; browser code never receives provider tokens.

## Vercel setup

Create a second Vercel project from this repository, set its root directory to `apps/ai-signin`, enable access to files outside the root directory for the workspace package, and assign `ai-signin.guildos.design`. Vercel builds each project from the same repository independently. Add the service variables below to the AI Sign-In Vercel project, then add `AI_SIGNIN_SERVICE_URL=https://ai-signin.guildos.design` and the same `AI_SIGNIN_SERVICE_TOKEN` to the GuildOS project.

| Variable | Purpose |
| --- | --- |
| `AI_SIGNIN_PUBLIC_URL` | `https://ai-signin.guildos.design` |
| `AI_SIGNIN_SERVICE_TOKEN` | Long random secret used only for GuildOS server-to-server calls |
| `AI_SIGNIN_SERVICE_URL` | Set only in GuildOS to `https://ai-signin.guildos.design` |
| `AI_SIGNIN_VAULT_KEY` | 32-byte hex key; generate with `openssl rand -hex 32` and back it up |
| `SUPABASE_URL` | Same Supabase project used by GuildOS Studio |
| `SUPABASE_SECRET_KEY` | Server-only Supabase key for the service |
| `GUILDOS_APP_URL` | Canonical GuildOS origin, `https://www.guildos.design` |
| `AI_SIGNIN_RETURN_ORIGINS` | Optional comma-separated additional exact return origins for preview deployments |
| `OPENAI_CLIENT_ID` | OpenAI-issued client ID for the approved GuildOS integration |
| `OPENAI_CLIENT_SECRET` | Only if OpenAI issues a confidential client |
| `OPENAI_TOKEN_AUTH_METHOD` | OpenAI-issued endpoint method: `none`, `client_secret_post`, or `client_secret_basic` |
| `OPENAI_CHATGPT_PLAN_USAGE` | Set to `enabled` only after OpenAI has authorized plan-usage scopes for this client |

Set the exact production callback URL `https://ai-signin.guildos.design/api/oauth/openai/callback` in OpenAI’s client configuration. Apply `supabase/migrations/202610150001_ai_signin.sql` to the same Supabase project before enabling the service. When retiring the old bridge, also apply `supabase/migrations/202610150002_retire_chatgpt_bridge.sql`; it drops the old encrypted bridge-credential table, so those accounts must sign in again through this service. Neither migration alters waitlist tables.

## Provider boundaries

The OpenAI adapter implements the website Sign in with ChatGPT authorization-code flow. Its identity scopes can be configured after OpenAI issues GuildOS a client ID. ChatGPT plan usage is a separate permission and remains disabled unless OpenAI approves those scopes for this integration. OpenAI currently limits commercial Sign in with ChatGPT to selected partners; request access before enabling it. This adapter uses OpenID Connect and PKCE, not the Codex app-server process.

Claude and Grok are not exposed as connected providers until their supported OAuth products, credentials, scopes, and terms are confirmed. Add a provider adapter only when that provider offers an OAuth flow for the capability GuildOS intends to use. OAuth for identity does not automatically authorize model inference or subscription usage. The internal credential endpoint requires the service bearer token and must only be called by a trusted GuildOS server route; never call it from browser code.

OpenAI currently limits hosted-commercial Sign in with ChatGPT to selected partners. Until GuildOS receives a client ID and the required plan-usage permissions, the OpenAI API-key connection remains the working generation option.

## Local checks

```sh
npm run build --workspace=@guildos/ai-signin
curl http://localhost:3000/api/health
```

The health endpoint needs no provider credentials. OAuth routes require the service secret, Supabase migration, and OpenAI client configuration, so test them against a dedicated Supabase project and OpenAI development client before production.

The Studio connection card starts the hosted authorization-code flow. The Studio generation and agent-chat routes use the plan connection only when the returned scopes include `chatgpt.tokens.use.direct`; otherwise a saved OpenAI API key remains available as the model provider. When both are usable, the existing capacity fallback can switch providers after a usage-limit response. `STUDIO_CHATGPT_MODEL` is optional; without it, GuildOS selects the first model listed as visible for that connected account.
