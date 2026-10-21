# Production deployment

Push to `main` to run `.github/workflows/checks.yml`. After application tests, the production build, browser checks, and dependency audits pass, the production job builds the checked revision, applies pending Supabase migrations, and uploads that build to Vercel. Pull requests and other branches never migrate production. **Run workflow** on `main` reruns checks and deployment after configuration or a transient failure.

`vercel.json` disables Vercel's independent Git auto-deployment for `main` so it cannot publish ahead of migrations. Preview branches retain Vercel auto-deployment; point previews at a separate Supabase project. This workflow deploys the root GuildOS app; the optional standalone AI Sign-In service retains its own deployment setup.

## One-time configuration

In GitHub, open **Settings → Environments → production** and add these environment secrets (repository secrets also work):

| Secret | Value |
| --- | --- |
| `SUPABASE_DB_URL` | Production PostgreSQL connection URI from Supabase **Connect**, with the database password percent-encoded and `sslmode=require`. Use the **session pooler on port 5432** for GitHub-hosted IPv4 runners, not the transaction pooler. This is not the HTTPS API URL or service-role key. |
| `VERCEL_TOKEN` | Vercel access token with access to the deployment project. |
| `VERCEL_ORG_ID` | Team/account ID from Vercel project settings or `.vercel/project.json` after `vercel link`. |
| `VERCEL_PROJECT_ID` | Root GuildOS project ID from Vercel project settings or `.vercel/project.json`. |

Configure the application's production environment variables in Vercel, including its Supabase credentials and vault key, as described in [studio setup](studio-setup.md). The workflow pulls those settings for the build. Keep credentials out of Git and workflow logs. Until the four GitHub secrets are present, the production job fails with the missing secret's name and leaves production unchanged.

## Existing databases and migration history

The CLI applies unapplied files in `supabase/migrations/` in filename order and records them in `supabase_migrations.schema_migrations`. Keep applied migrations immutable; add a new migration for each change. The test suite applies the entire directory to a fresh PGlite database to catch ordering and SQL failures; it does not replace validation against your existing hosted data.

If SQL was previously pasted into Supabase's SQL Editor, reconcile its migration history **once before the first automated deployment**. Inspect the actual schema and each file to determine which migrations are already fully applied. Using the same database URL locally:

```sh
supabase migration list --db-url "$SUPABASE_DB_URL"
# Only for an individually verified, already-applied migration:
supabase migration repair MIGRATION_VERSION --status applied --db-url "$SUPABASE_DB_URL"
supabase db push --db-url "$SUPABASE_DB_URL" --dry-run
```

Replace `MIGRATION_VERSION` with that file's numeric prefix. Never mark every file applied without verifying it. The workflow deliberately does not reset databases, automatically repair history, or force out-of-order migrations. A history mismatch or SQL failure blocks the deployment for investigation.

Production jobs are serialized and never automatically cancel an in-progress migration. A queued revision superseded on `main` is rejected before building. Successful migrations remain applied if a later migration or Vercel upload fails; rerunning uses migration history to skip them. Use backward-compatible schema additions so the currently deployed app continues working between migration and release. Roll back application code independently; repair schema changes with a reviewed forward migration.

The workflow follows [Supabase's migration workflow](https://supabase.com/docs/guides/deployment/database-migrations) and [Vercel's GitHub Actions deployment flow](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel).
