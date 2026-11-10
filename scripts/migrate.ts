import { spawn } from 'node:child_process';
import nextEnv from '@next/env';

/**
 * Applies pending Supabase migrations to the local development database.
 * Production is migrated only by the GitHub deploy workflow, with the same CLI version.
 *
 *   npm run db:migrate              apply pending migrations (fails without SUPABASE_DB_URL)
 *   node scripts/migrate.ts --dev   used by `npm run dev`: skips with a notice when unconfigured
 */
const cliVersion = '2.118.0'; // Keep in step with supabase/setup-cli in .github/workflows/checks.yml.

nextEnv.loadEnvConfig(process.cwd(), true);
const devStartup = process.argv.includes('--dev');
const url = process.env.SUPABASE_DB_URL?.trim();

function finish(code: number, message: string) {
 (code ? console.error : console.log)(message);
 process.exit(code);
}

if (process.env.VERCEL || process.env.CI || process.env.NODE_ENV === 'production') {
 finish(1, 'Refusing to migrate from this environment. Production migrations run in the GitHub deploy workflow.');
}
if (devStartup && process.env.STUDIO_SKIP_MIGRATIONS === '1') finish(0, 'Skipping database migrations (STUDIO_SKIP_MIGRATIONS=1).');
if (!url) {
 const help = 'Add SUPABASE_DB_URL (Supabase → Project Settings → Database → connection string) to .env.local to apply migrations automatically.';
 finish(devStartup ? 0 : 1, devStartup ? `Database migrations not checked. ${help}` : help);
}

console.log('Applying pending Supabase migrations to the local database…');
// --include-all also applies older-dated files that arrive from merged branches.
// The connection string is passed as an argument and never printed.
const child = spawn('npx', ['--yes', `supabase@${cliVersion}`, 'db', 'push', '--db-url', url!, '--include-all', '--yes'], { stdio: 'inherit', env: process.env });
child.once('error', error => finish(1, `Could not run the Supabase CLI: ${error.message}`));
child.once('exit', code => {
 if (code === 0) finish(0, 'Database migrations are up to date.');
 finish(code || 1, [
  'Database migrations failed. The app was not started against an outdated schema.',
  'If this database was migrated by hand, mark those files as applied first, e.g.',
  `  npx supabase@${cliVersion} migration repair --db-url "$SUPABASE_DB_URL" --status applied <version>…`,
  'To start anyway, set STUDIO_SKIP_MIGRATIONS=1.',
 ].join('\n'));
});
