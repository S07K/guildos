import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { storageProvider, supabaseServerKey, supabaseRequest, openWaitlistDatabase } from './waitlist-storage.mjs';

export const RATE_LIMIT = 5;
export const WINDOW_SECONDS = 15 * 60;

// Equivalent IPv6 spellings share a bucket; /64 grouping limits address rotation.
export function normalizeClientIP(value) {
  if (isIP(value) === 4) return value;
  if (isIP(value) !== 6) throw new Error('Invalid client IP');
  const canonical = new URL(`http://[${value}]`).hostname.slice(1, -1);
  const [left, right] = canonical.split('::');
  const start = left ? left.split(':') : [];
  const end = right ? right.split(':') : [];
  const groups = right === undefined ? start : [...start, ...Array(8 - start.length - end.length).fill('0'), ...end];
  const parts = groups.map(part => parseInt(part, 16));
  if (parts.slice(0, 5).every(part => part === 0) && parts[5] === 65535) {
    return [parts[6] >> 8, parts[6] & 255, parts[7] >> 8, parts[7] & 255].join('.');
  }
  return `${parts.slice(0, 4).map(part => part.toString(16)).join(':')}::/64`;
}

export function clientBucket(request) {
  // Vercel overwrites this header. Other hosts must explicitly configure a header
  // that their trusted reverse proxy overwrites, and block direct origin access.
  const header = process.env.VERCEL === '1' ? 'x-vercel-forwarded-for' : process.env.WAITLIST_IP_HEADER;
  let address;
  if (header) {
    const value = request.headers.get(header)?.trim();
    if (!value) throw new Error('Trusted client IP is missing');
    address = normalizeClientIP(value); // Reject lists rather than trust an arbitrary first address.
  } else if (process.env.NODE_ENV !== 'production') {
    address = 'local-development'; // Ignore spoofable forwarding headers locally.
  } else {
    throw new Error('Trusted client IP header is not configured');
  }
  const secret = process.env.WAITLIST_RATE_LIMIT_SECRET || supabaseServerKey() ||
    (process.env.NODE_ENV !== 'production' ? 'guildos-local-development-only' : '');
  if (!secret) throw new Error('Rate limit secret is missing');
  return createHmac('sha256', secret).update(`guildos-waitlist:${address}`).digest('hex');
}

export async function consumeRateLimit(bucket, now = Math.floor(Date.now() / 1000)) {
  if (!/^[a-f0-9]{64}$/.test(bucket)) throw new Error('Invalid bucket');
  const provider = storageProvider();
  if (provider === 'supabase') {
    const response = await supabaseRequest('/rest/v1/rpc/consume_waitlist_rate_limit', { p_bucket: bucket }, {}, 3000);
    const result = await response.json();
    if (typeof result?.allowed !== 'boolean' || !Number.isInteger(result.retry_after) || result.retry_after < 0 || result.retry_after > WINDOW_SECONDS || (!result.allowed && result.retry_after === 0)) {
      throw new Error('Invalid rate limit response');
    }
    return result;
  }
  if (provider !== 'sqlite') throw new Error('Unsupported waitlist storage');
  const db = await openWaitlistDatabase();
  try {
    db.exec('CREATE TABLE IF NOT EXISTS waitlist_rate_limits (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS waitlist_rate_expiry ON waitlist_rate_limits(expires_at)');
    db.prepare('DELETE FROM waitlist_rate_limits WHERE expires_at <= ?').run(now);
    // One atomic statement prevents concurrent requests from bypassing the limit.
    const row = db.prepare(`INSERT INTO waitlist_rate_limits (bucket, attempts, expires_at) VALUES (?, 1, ?)
      ON CONFLICT(bucket) DO UPDATE SET
        attempts = CASE WHEN expires_at <= ? THEN 1 ELSE min(attempts + 1, ?) END,
        expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
      RETURNING attempts, expires_at`).get(bucket, now + WINDOW_SECONDS, now, RATE_LIMIT + 1, now);
    return { allowed: Number(row.attempts) <= RATE_LIMIT, retry_after: Math.max(1, Number(row.expires_at) - now) };
  } finally { db.close(); }
}

export async function checkRateLimit(request) {
  return consumeRateLimit(clientBucket(request));
}
