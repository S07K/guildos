import { storageProvider, supabaseRequest, openWaitlistDatabase } from './waitlist-storage.mjs';

export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email)) return null;
  const [local, domain] = email.split('@');
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..') || domain.split('.').some(label => label.length > 63)) return null;
  return email;
}

export async function saveEmail(email) {
  const provider = storageProvider();
  if (provider === 'supabase') {
    await supabaseRequest('/rest/v1/waitlist?on_conflict=email', { email }, { Prefer: 'resolution=ignore-duplicates,return=minimal' });
    return;
  }
  if (provider !== 'sqlite') throw new Error('Unsupported waitlist storage');
  const db = await openWaitlistDatabase();
  try {
    db.exec("CREATE TABLE IF NOT EXISTS waitlist (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))");
    db.prepare('INSERT INTO waitlist (email) VALUES (?) ON CONFLICT(email) DO NOTHING').run(email);
  } finally { db.close(); }
}
