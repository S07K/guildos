# Contributing to GuildOS

Thanks for your interest in GuildOS! Bug reports, fixes, documentation and feature work are all welcome. This guide explains how to get a change from your fork into `main`.

By participating you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Table of contents

- [Ways to contribute](#ways-to-contribute)
- [Development setup](#development-setup)
- [Workflow](#workflow)
- [Branch naming](#branch-naming)
- [Commit messages](#commit-messages)
- [Pull requests and review](#pull-requests-and-review)
- [Code style](#code-style)
- [Database migrations](#database-migrations)
- [Checks to run before opening a PR](#checks-to-run-before-opening-a-pr)
- [Licensing of contributions](#licensing-of-contributions)

## Ways to contribute

- **Report a bug** with the [bug report form](https://github.com/S07K/guildos/issues/new?template=bug_report.yml).
- **Suggest a feature** with the [feature request form](https://github.com/S07K/guildos/issues/new?template=feature_request.yml), or start a [Discussion](https://github.com/S07K/guildos/discussions) for open-ended ideas.
- **Pick up an issue.** Comment on it first so work is not duplicated. For larger changes, agree on the approach in the issue before writing code.
- **Report a security problem privately**, never in a public issue. See [SECURITY.md](SECURITY.md).

## Development setup

Requirements:

- [Node.js](https://nodejs.org/) **24 or newer** (see `engines` in `package.json`) and npm
- A [Supabase](https://supabase.com/) project for development (keep it separate from any production project)
- Optional: Chromium for the Playwright studio tests (`npx playwright install chromium`)

```sh
git clone https://github.com/<your-username>/guildos.git
cd guildos
npm ci
cp .env.example .env.local   # then fill in the values
npm run dev
```

`npm run dev` applies pending migrations from `supabase/migrations/` to `SUPABASE_DB_URL`, then starts the web app, the local AI sign-in service and the agent worker. See the [README](README.md#getting-started) and [docs/studio-setup.md](docs/studio-setup.md) for the full setup, including Supabase Auth configuration.

## Workflow

1. **Fork** the repository and clone your fork.
2. **Create a branch** from an up-to-date `main` (see [Branch naming](#branch-naming)).
3. **Make your change** with tests where it makes sense.
4. **Run the checks** listed below.
5. **Commit** using [Conventional Commits](#commit-messages).
6. **Push** to your fork and **open a pull request** against `S07K/guildos:main`.
7. **Address review feedback.** A maintainer approval is required before merge.

## Branch naming

Use a short, kebab-case description with a type prefix, matching the existing history:

| Prefix | Use for | Example |
| --- | --- | --- |
| `feat/` | New features | `feat/board-sticky-notes` |
| `fix/` | Bug fixes | `fix/oauth-root-callback` |
| `polish/` | UI and UX refinements without new behaviour | `polish/studio-ui` |
| `security/` | Security fixes and dependency upgrades for advisories | `security/next-16-4-3` |
| `docs/` | Documentation only | `docs/self-hosting-guide` |
| `chore/` | Tooling, dependencies, CI, housekeeping | `chore/open-source-release` |

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>(<optional scope>): <short summary in the imperative mood>

<optional body explaining what and why>

<optional footer, e.g. "Closes #123" or "BREAKING CHANGE: ...">
```

Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Useful scopes include `studio`, `worker`, `pipeline`, `auth`, `ai-signin`, `db`, `landing` and `deps`.

Examples:

```text
feat(studio): add sticky notes to the board
fix(worker): release the lease when a task is cancelled
docs: explain hosted worker setup
```

Pull requests are squash-merged, so the PR title should also be a valid Conventional Commit message.

## Pull requests and review

- Keep pull requests focused: one logical change per PR.
- Fill in the [pull request template](.github/pull_request_template.md), link the issue (`Closes #123`) and include screenshots for UI changes.
- `main` is protected. Every PR needs **one approving review from the code owner (@S07K)**, all review conversations resolved, and passing checks. New pushes dismiss stale approvals.
- CI (`.github/workflows/checks.yml`) runs the typecheck, unit tests, production build, Playwright studio tests and dependency audits on every PR.
- Do not force-push to `main`; history on `main` is never rewritten.

## Code style

- **TypeScript** throughout (`strict` mode). Run `npm run typecheck`.
- There is no separate lint script yet; the typecheck and `npm run build` (which runs Next.js's checks) are the gate. Match the formatting and conventions of the surrounding code.
- **Studio UI** uses MUI with the shared theme; the **marketing site** uses Tailwind CSS v4. Do not mix the two within a surface.
- Generated screen HTML is untrusted: keep it sanitised (`src/lib/studio/html-screen.ts`) and rendered only in sandboxed iframes.
- Keep secrets server-side. Never prefix secrets with `NEXT_PUBLIC_`, and never log keys.
- Respect tenant isolation: every studio query must be scoped to the caller's workspace (RLS or explicit `workspace_id` checks).

## Database migrations

- Add a **new** timestamped file to `supabase/migrations/` for every schema change (`YYYYMMDDNNNN_description.sql`). Never edit a migration that has been merged.
- Prefer backward-compatible changes: production migrates before the new app version is deployed (see [docs/deployment.md](docs/deployment.md)).
- `npm test` applies the whole migration chain to a fresh PGlite database, so ordering and SQL errors are caught locally.

## Checks to run before opening a PR

```sh
npm run typecheck   # TypeScript
npm test            # Node test runner (unit, SQL via PGlite, vault crypto)
npm run build       # Production build
npm run test:studio # Playwright studio tests (requires a prior build and Chromium)
```

`npm run verify` runs tests, build, the dependency audit and the browser tests in one go.

## Licensing of contributions

GuildOS is licensed under the [GNU Affero General Public License v3.0](LICENSE). By submitting a contribution you agree that it is licensed under the same terms (inbound = outbound), and you confirm you have the right to submit it.
