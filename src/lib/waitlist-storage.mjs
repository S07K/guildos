import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function storageProvider() {
  return process.env.WAITLIST_STORAGE || (process.env.NODE_ENV === 'production' ? 'supabase' : 'sqlite');
}

export function supabaseServerKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export async function supabaseRequest(path, body, headers = {}, timeout = 8000) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = supabaseServerKey();
  if (!url || !key) throw new Error('Waitlist storage is not configured');
  const base = new URL(url);
  if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) throw new Error('Supabase requires HTTPS');
  const response = await fetch(new URL(path, base), {
    method: 'POST',
    // Opaque Supabase secret keys authenticate through apikey; only legacy keys are JWTs.
    headers: { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }), 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeout), cache: 'no-store',
  });
  if (!response.ok) throw new Error('Waitlist storage failed');
  return response;
}

export async function openWaitlistDatabase() {
  const { DatabaseSync } = await import('node:sqlite');
  const path = resolve(process.env.WAITLIST_DB_PATH || '.data/waitlist.sqlite');
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  try {
    chmodSync(path, 0o600);
    db.exec('PRAGMA busy_timeout = 5000');
    return db;
  } catch (error) { db.close(); throw error; }
}
