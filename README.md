# GuildOS · Phase 1

A Next.js App Router + TypeScript + Tailwind CSS waitlist landing page. Node.js **24+** is required for the built-in SQLite driver.

## Run locally

```sh
npm ci
npm run dev
```

Open http://localhost:3000. No database account is required locally: the first valid signup creates `.data/waitlist.sqlite`. The API uses parameterized SQL, a unique normalized email column, and a private file permission. Restarting the server preserves submissions. The data directory is excluded from Git.

```sh
npm test
npm run typecheck
npm run build
```

## Deploy to Vercel with Supabase

Follow the [step-by-step setup guide](docs/setup.md) for the exact migration order, Vercel environment values, dependency update command, and preview checks.

1. Finish the browser and dependency checks described in [predeploy checks](docs/predeploy-checks.md). They require no Supabase credentials.
2. Before the first functional preview, create a Supabase project and apply **both** SQL files in `supabase/migrations/`, in filename order, using its SQL editor or migration tooling. The second migration is required for rate limiting.
3. In Vercel, select Node.js 24 and add `SUPABASE_URL` (your project URL) and `SUPABASE_SECRET_KEY` (server-only `sb_secret_` key) to the Preview environment. Existing legacy keys also work through `SUPABASE_SERVICE_ROLE_KEY` when `SUPABASE_SECRET_KEY` is unset. Production automatically selects Supabase; do not select SQLite on Vercel. Never prefix either server key with `NEXT_PUBLIC_`.
4. Leave `NEXT_PUBLIC_APP_URL` unset for Preview so origin checks use the preview request URL. For Production, set it to your canonical origin, e.g. `https://guildos.design`, and add the Supabase variables there too. Do not carry `http://localhost:3000` from `.env.example` into Vercel. Redeploy after changing environment variables.
5. Deploy a preview and perform the live checks below before promoting it. Missing credentials, missing migrations, or database failures return 503; the UI does not claim success.

RLS is enabled with no public access policies. Browser clients cannot read or write either table or execute the rate-limit function. The service role credential exists only on the server. The endpoint exposes only POST, normalizes email addresses, caps request bodies at 2 KiB, checks browser request origins, uses a honeypot, and returns the same success response for duplicate signups. Email addresses are never logged.

The persistent limiter allows **five attempts per client IP in 15 minutes**; IPv6 addresses share a /64 bucket. Duplicate and malformed-email submissions count as attempts. Further attempts receive HTTP 429 with `Retry-After`. Supabase uses an atomic PostgreSQL function so all Vercel instances share the limit. Only HMAC hashes are stored, never raw IPs; expired hashes are removed on subsequent requests. The limiter fails closed with 503 when unavailable. People sharing a network also share this limit.

On Vercel, the limiter automatically reads the platform's `x-vercel-forwarded-for` header. `WAITLIST_RATE_LIMIT_SECRET` optionally supplies a separate server-only HMAC secret; otherwise the configured Supabase server key is used. Rotating that secret resets client buckets. Other hosts must configure `WAITLIST_IP_HEADER` to a single-IP header their trusted proxy overwrites and must prevent direct access around that proxy. Local development ignores forwarding headers and uses one shared development bucket.

For the preview check, submit an email you control on desktop, repeat it, and verify exactly one normalized row in Supabase. Check a mobile signup, keyboard focus, readable success/error states, and horizontal overflow. On the sixth attempt within 15 minutes, confirm 429, a positive `Retry-After`, and no extra email row. Confirm another attempt succeeds after expiry. The browser suite below uses local SQLite and cannot establish hosted Supabase connectivity.

SQLite is also usable on a persistent single-server deployment by explicitly selecting `WAITLIST_STORAGE=sqlite` and setting `WAITLIST_DB_PATH` to a mounted volume. Do not use SQLite on an ephemeral/serverless filesystem. Back up persisted data and manage removal requests through your database administrator.

## Scope

This release captures launch interest only. The agency workflow graphic is explicitly a concept preview. Agent execution, workspace authentication, provider vaults, project memory, telemetry, and Figma export belong to later phases.

See `docs/design-references.md` for the current minimal visual direction and references. Unit/integration tests exercise real SQLite persistence, concurrent rate limiting, and the Supabase HTTP contract. PGlite (a test-only PostgreSQL WASM dependency) validates both migrations, duplicate constraints, function behavior, and denied public access. These do not establish connectivity to a live Supabase project.

## Browser checks

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

Browser tests cover desktop signup and duplicates through the real API with a database assertion, mobile overflow and retry behavior, reduced motion, rate-limit feedback, and the disabled image optimizer. They launch a production server on port 3100 with a temporary SQLite file. If using an existing Chromium install, set `PLAYWRIGHT_EXECUTABLE_PATH` to its binary.

Run `npm run verify` for tests, build, the full dependency audit, and browser checks. `npm run audit:production` isolates runtime findings. `.github/workflows/checks.yml` runs application checks and independent full/production audits on push and pull requests once the repository is hosted on GitHub, retaining audit JSON artifacts even on failure. See [current results and remaining blockers](docs/predeploy-checks.md).
