# Vercel + Supabase setup

Local verification is complete: backend tests, production build, full and production dependency audits, and all five browser tests passed. Hosted signup verification still needs Supabase and a Vercel preview; see [the verification report](predeploy-checks.md).

## 1. Finish dependency and browser checks

Use Node.js 24 in a terminal with internet access. The manifest and lockfile already include Next.js 16.4.0, Tailwind CSS 4.2.4, its matching PostCSS plugin, and PostCSS 8.5.23. Install from the lockfile rather than applying another framework upgrade.

```sh
npm ci
npm run audit:all
npm run audit:production
npx playwright install chromium
npm run verify
```

Let the Chromium installer finish extracting after the download reaches 100%. If Chrome is already installed on macOS, skip the Chromium download and use:

```sh
PLAYWRIGHT_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run verify
```

`verify` stops at the first failure. A failed full audit prevents the browser suite from starting. To run browser checks independently after a successful build, use the same environment variable with `npm run test:e2e`.

Review any findings before deploying. Commit both `package.json` and `package-lock.json` after a successful update. The prepared GitHub Actions workflow runs backend tests, builds, browser checks, and separate full/production audits; failed audits preserve JSON reports as artifacts. It will run once this folder is pushed to a GitHub repository. No hosted CI run has been performed yet.

## 2. Create the database

Create a Supabase project. For a preview, use a separate project from the eventual production waitlist so test signups do not mix with real subscribers.

In its **SQL Editor**, run these files in order, copying each file's complete contents:

1. [`202610070001_waitlist.sql`](../supabase/migrations/202610070001_waitlist.sql)
2. [`202610080001_waitlist_rate_limit.sql`](../supabase/migrations/202610080001_waitlist_rate_limit.sql)

They create `public.waitlist`, `public.waitlist_rate_limits`, and `public.consume_waitlist_rate_limit(text)`. Both tables have RLS enabled; the browser has no direct access. The rate-limit migration is required even if the waitlist table already exists.

In Supabase's **Connect** dialog, copy your project URL. In **Settings → API Keys**, create/copy a backend secret key beginning `sb_secret_`. The app now supports these keys on the `apikey` header, as documented by [Supabase](https://supabase.com/docs/guides/getting-started/api-keys). Existing legacy service-role JWTs remain supported through `SUPABASE_SERVICE_ROLE_KEY`; configure one key type, not both. A publishable/anon key cannot perform these writes.

## 3. Configure Vercel

Import the repository as a Next.js project and use Node.js **24.x**. Keep the framework's default output directory and use `npm run build` as the build command.

Under **Project Settings → Environment Variables**, set:

| Variable | Preview | Production |
| --- | --- | --- |
| `SUPABASE_URL` | Preview project's HTTPS URL | Production project's HTTPS URL |
| `SUPABASE_SECRET_KEY` | Preview backend secret | Production backend secret |
| `NEXT_PUBLIC_APP_URL` | Leave unset | `https://guildos.design` or your canonical origin |
| `WAITLIST_STORAGE` | Leave unset; production runtime chooses Supabase | Leave unset |
| `WAITLIST_RATE_LIMIT_SECRET` | Optional separate secret | Optional separate secret |
| `WAITLIST_IP_HEADER` | Leave unset; Vercel is detected automatically | Leave unset |

If using a legacy key, set `SUPABASE_SERVICE_ROLE_KEY` instead of `SUPABASE_SECRET_KEY`. Never add `NEXT_PUBLIC_` to either key name. No browser Supabase key or database connection string is needed.

The rate limiter defaults to using the configured Supabase server key for HMAC hashing. To use a separate secret, generate one locally with `openssl rand -hex 32` and paste it only into the Vercel environment field. Keep it stable across deployments; rotating it resets IP buckets.

Do not copy `NEXT_PUBLIC_APP_URL=http://localhost:3000` or `WAITLIST_STORAGE=sqlite` into Vercel. Keep the production origin out of Preview variables: preview signups must pass the origin check against their own URL. Vercel environment changes apply to a **new deployment**, so redeploy after editing them. See [Vercel environment configuration](https://vercel.com/docs/environment-variables).

## 4. Verify the preview

Deploy a Preview after the variables are set. Use an email you control:

1. Submit it through the desktop hero form. Expect HTTP 200 and the success state.
2. Reload and submit it again. The same success state should appear, and Supabase should contain exactly one normalized email row.
3. Repeat on mobile. Check that the form fits the viewport, text is readable, and keyboard focus and success/error messages work.
4. Make six total submissions from the same network within 15 minutes. Duplicate submissions count. The sixth should return 429 with a positive `Retry-After`, show an error, and create no additional row. After the window expires, another submission should succeed.

In Supabase's SQL Editor, verify the controlled test address with:

```sql
select email, count(*) as rows
from public.waitlist
where email = lower('your-test-address@example.com')
group by email;
```

Replace the address with your test email. Expect one row with `rows = 1`. Browser automation here uses temporary SQLite; only these preview checks prove the Vercel-to-Supabase connection.

## 5. Enable production

Apply both migrations to the production Supabase project, configure the Production variables, and connect the canonical domain in Vercel. Deploy production after the checks pass, then repeat one signup and duplicate check on the canonical URL. There is no email-sending service in Phase 1: success confirms database capture, not delivery of a confirmation email.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| 503 for every submission | Both migrations applied, project running, correct project URL/server key, and a fresh Vercel deployment after setting variables |
| 403 on the preview | Remove `NEXT_PUBLIC_APP_URL` from Preview; do not use the production domain or localhost there |
| 429 during testing | Five attempts already used that network's 15-minute budget; wait for expiry |
| Secret key rejected | Use `sb_secret_` or legacy service-role credentials, never `sb_publishable_`/anon; both tables and RPC require the service role |
| Build passes but browser checks do not run locally | Playwright needs Chromium and permission to bind localhost:3100 |
| Audit returns `ENOTFOUND` | Run from a network-enabled terminal or GitHub Actions; an audit error does not mean zero vulnerabilities |

Enter credentials directly in Supabase/Vercel or your ignored `.env.local`; do not put them in chat or commit them.
