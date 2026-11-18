# Security Policy

GuildOS stores encrypted model-provider credentials and runs AI-generated HTML, so we take security reports seriously. Thank you for helping keep users safe.

## Supported versions

GuildOS is pre-1.0 and ships continuously from `main`. Only the latest commit on `main` (and the hosted service at [guildos.design](https://www.guildos.design)) receives security fixes.

| Version | Supported |
| --- | --- |
| `main` (latest) | :white_check_mark: |
| Older commits, forks and unmaintained self-hosted copies | :x: |

## Reporting a vulnerability

**Please do not open a public issue, discussion or pull request for security problems.**

Report vulnerabilities privately through GitHub's private vulnerability reporting:

1. Go to the [Security tab](https://github.com/S07K/guildos/security) of this repository.
2. Click **Report a vulnerability** (or open [a new advisory](https://github.com/S07K/guildos/security/advisories/new) directly).
3. Include as much of the following as you can:
   - the affected area (for example the studio API, agent worker, credential vault, HTML sanitiser, share links, `apps/ai-signin`, or a migration),
   - steps to reproduce or a proof of concept,
   - the impact you believe it has (for example cross-workspace data access, key disclosure, script execution in a preview),
   - any suggested fix.

Please never include real third-party credentials or other people's data in a report.

## What to expect

- We aim to acknowledge reports within **3 business days** and to share an initial assessment within **10 business days**.
- We will keep you informed while we work on a fix and coordinate a disclosure date with you.
- With your permission, we will credit you in the published advisory.

GuildOS is maintained by a small team, so these timelines are goals rather than guarantees.

## Scope

In scope:

- Code in this repository, including `apps/ai-signin`, `packages/provider-auth`, `scripts/` and `supabase/migrations/`.
- Tenant isolation (row-level security and workspace scoping), the credential vault, session handling, the hosted worker endpoint, the HTML sanitiser and preview sandbox, and share links.

Out of scope:

- Vulnerabilities in third-party services (Supabase, Vercel, model providers) — please report those to the vendor.
- Issues that require a compromised machine, leaked `.env` secrets or physical access.
- Denial of service through volume, rate-limit tuning, and missing security headers without a demonstrated impact.
- Social engineering of maintainers or users.

## Safe harbour

We will not pursue legal action against researchers who act in good faith: test only against your own accounts and self-hosted instances, avoid privacy violations and service disruption, do not access or modify other users' data, and give us reasonable time to fix the issue before disclosure.
