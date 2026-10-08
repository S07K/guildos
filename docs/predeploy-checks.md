# Predeploy checks — 2026-10-08

Target: Vercel. No preview URL or Supabase configuration is available yet.

## Implemented

- Persistent five-attempt/15-minute limiter with trusted Vercel IP handling, hashed identities, atomic database updates, and 429/Retry-After responses.
- Supabase migration for the limiter, restricted to the server service role.
- Backend, PostgreSQL migration, and browser tests; GitHub Actions application and separate full/production dependency-audit jobs with JSON artifacts.
- Next.js updated to 16.4.0. The unused image optimizer is disabled.
- PostCSS updated from 8.5.6 to 8.5.23 to address the reviewed source-map disclosure and CSS stringification advisories.
- Tailwind migrated from 3.4.19 to 4.2.4 with the matching `@tailwindcss/postcss` plugin. Removed Autoprefixer and moved brand tokens into CSS `@theme`; the custom page styles and SVG animations remain in place.
- Supabase setup supports current server secret keys as well as legacy service-role JWTs.

## Verification status

| Check | Result |
| --- | --- |
| Backend and database tests | 15 passed, including real SQLite writes, cross-process concurrency, both Supabase key formats, and PostgreSQL migration/access-control checks in PGlite |
| Production build and TypeScript | Passed on Next.js 16.4.0 after the Tailwind 4 migration |
| Playwright browser checks | All five passed: desktop signup/deduplication, mobile layout/error recovery, disabled image optimizer, reduced motion, and rate limit UI. |
| Production npm audit | Passed: zero vulnerabilities. |
| Full npm audit | Passed: zero vulnerabilities. |
| Live preview signup/mobile/Supabase | Pending a preview and Supabase configuration |

## Dependency findings

The user's latest connected full audit reported zero vulnerabilities after the Tailwind migration. The earlier seven development findings were removed through the dependency changes below.

- The direct PostCSS 8.5.6 build dependency was affected by [source-map path traversal](https://github.com/postcss/postcss/security/advisories/GHSA-r28c-9q8g-f849), its [incomplete-fix advisory](https://github.com/postcss/postcss/security/advisories/GHSA-fxqj-rqcc-2cmp), and [CSS stringification XSS](https://github.com/postcss/postcss/security/advisories/GHSA-qx2v-qp2m-jg93). Updated the direct pin and lockfile to 8.5.23, which contains the documented fixes. Next.js's transitive PostCSS was already 8.5.23. This app builds repository CSS and does not accept user-supplied CSS.
- Next.js 16.4.0 is beyond the documented fixes for [AVIF image optimization RCE](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) and [Node.js next/og ImageResponse RCE](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j). The installed version builds successfully.
- The [braces stack-exhaustion advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) has no patched braces release listed. Tailwind 3 brought it in through Chokidar, Micromatch, and Fast Glob. Migrating to Tailwind 4 removes all four packages.
- The [selector parser CPU-exhaustion advisory](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) affected Tailwind 3's direct parser and PostCSS Nested dependencies. Both packages are removed from the new tree.

Tailwind 4.2.4 was selected because its complete package metadata and binaries were available locally. It replaces the affected dependency chains without dependency overrides or suppressed audit findings. The migration follows the [official guide](https://tailwindcss.com/docs/upgrade-guide). All five browser checks pass. Tailwind 4 targets modern browsers (Safari 16.4+, Chrome 111+, Firefox 128+).

Local verification is complete. A live preview signup against Supabase remains the final infrastructure check before production.

## Finish verification

```sh
npm ci
npm run audit:all
npm run audit:production
PLAYWRIGHT_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run verify
```

`verify` passed locally. The prepared GitHub Actions workflow runs full and production audits as independent matrix jobs, preserving their JSON results even on failure; it has not run yet.

Supabase is unnecessary for those local/CI checks. Add it **before testing the Vercel preview**: apply both migrations and set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in Vercel's Preview environment (or use `SUPABASE_SERVICE_ROLE_KEY` for a legacy key). Leave `NEXT_PUBLIC_APP_URL` unset for previews; set the canonical origin in Production. Never share the server key in chat or expose it to the client.

Follow the [deployment and live-check steps](../README.md#deploy-to-vercel-with-supabase) to confirm one row after duplicate submission, mobile behavior, rate limiting, and recovery after the window expires against the actual hosted database.
