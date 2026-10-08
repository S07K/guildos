import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const projectUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!projectUrl || !key) {
  console.error('Supabase config missing. Add SUPABASE_URL and SUPABASE_SECRET_KEY to .env.local.');
  process.exitCode = 1;
} else {
  let base;
  try { base = new URL(projectUrl); }
  catch { console.error('SUPABASE_URL is not a valid URL.'); process.exitCode = 1; }

  if (base && base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) {
    console.error('SUPABASE_URL must use HTTPS.');
    process.exitCode = 1;
  }

  if (base && !process.exitCode) {
    const headers = {
      apikey: key,
      ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }),
    };
    async function request(path, options = {}) {
      return fetch(new URL(path, base), {
        ...options,
        headers: { ...headers, ...options.headers },
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
      });
    }

    try {
      const table = await request('/rest/v1/waitlist?select=id&limit=0');
      if (!table.ok) {
        console.error(`Waitlist table check failed (HTTP ${table.status}). Confirm the first migration ran and the server key is correct.`);
        process.exitCode = 1;
      } else {
        console.log('PASS: Supabase credentials can access the waitlist table.');
      }

      // A dedicated deterministic HMAC bucket checks the RPC without creating a
      // signup or using an actual client IP. Remove the probe row afterwards.
      const rateSecret = process.env.WAITLIST_RATE_LIMIT_SECRET || key;
      const bucket = createHmac('sha256', rateSecret).update(`guildos-local-config-check:${base.host}`).digest('hex');
      try {
        const rpc = await request('/rest/v1/rpc/consume_waitlist_rate_limit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_bucket: bucket }),
        });
        const result = rpc.ok ? await rpc.json() : null;
        if (!rpc.ok || result?.allowed !== true || !Number.isInteger(result.retry_after)) {
          console.error(`Rate limiter check failed (HTTP ${rpc.status}). Confirm the second migration ran and the server key has permission.`);
          process.exitCode = 1;
        } else {
          console.log('PASS: Supabase rate-limit function is reachable and allowed a configuration probe.');
        }
      } finally {
        const cleanup = new URL('/rest/v1/waitlist_rate_limits', base);
        cleanup.searchParams.set('bucket', `eq.${bucket}`);
        const deleted = await request(`${cleanup.pathname}${cleanup.search}`, {
          method: 'DELETE', headers: { Prefer: 'return=minimal' },
        });
        if (!deleted.ok) {
          console.error(`Could not remove the temporary hashed rate-limit probe (HTTP ${deleted.status}).`);
          process.exitCode = 1;
        }
      }
    } catch (error) {
      const reason = error instanceof Error && error.name === 'TimeoutError' ? 'request timed out' : 'request failed';
      console.error(`Supabase connection check ${reason}. Verify the project URL, key, network connection, and migrations.`);
      process.exitCode = 1;
    }
  }
}
