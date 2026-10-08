import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { normalizeEmail, saveEmail } from '../src/lib/waitlist.mjs';
import { handleWaitlist as handler } from '../src/lib/waitlist-handler.mjs';
// These isolate input/persistence behavior; rate limiting has separate integration tests.
const handleWaitlist = (request, save) => handler(request, save, async () => ({ allowed: true, retry_after: 900 }));
const request = (body, headers = {}) => new Request('http://localhost:3000/api/waitlist', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
test('validates and normalizes emails', () => {
  assert.equal(normalizeEmail('  Founder+guild@Example.COM '), 'founder+guild@example.com');
  for (const invalid of ['a..b@example.com', '.a@example.com', 'a.@example.com', 'nope', 'a@-example.com', 'a@example', 'a\n@example.com', null, 42, 'x'.repeat(65) + '@example.com']) assert.equal(normalizeEmail(invalid), null);
});
test('persists normalized emails once, survives database reopening', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'guildos-test-'));
  process.env.WAITLIST_STORAGE = 'sqlite'; process.env.WAITLIST_DB_PATH = join(folder, 'waitlist.sqlite');
  try {
    for (const email of ['  Founder@Example.com ', 'founder@example.com']) {
      assert.equal((await handleWaitlist(request({ email }))).status, 200);
    }
    const db = new DatabaseSync(process.env.WAITLIST_DB_PATH);
    assert.deepEqual({ ...db.prepare('SELECT email, count(*) AS total FROM waitlist').get() }, { email: 'founder@example.com', total: 1 });
    db.close();
  } finally { delete process.env.WAITLIST_STORAGE; delete process.env.WAITLIST_DB_PATH; rmSync(folder, { recursive: true }); }
});
test('rejects invalid, oversized, bot, and cross-origin requests without writing', async () => {
  let writes = 0;
  const save = async () => { writes++; };
  assert.equal((await handleWaitlist(request({ email: 'invalid' }), save)).status, 400);
  assert.equal((await handleWaitlist(request({ email: 'a@example.com', website: 'bot' }), save)).status, 400);
  assert.equal((await handleWaitlist(request({ email: 'a@example.com' }, { origin: 'https://evil.example' }), save)).status, 403);
  assert.equal((await handleWaitlist(request({ email: 'x'.repeat(3000) }), save)).status, 413);
  assert.equal((await handleWaitlist(request(null), save)).status, 400);
  assert.equal((await handleWaitlist(new Request('http://localhost:3000/api/waitlist', { method: 'POST', body: '{', headers: { 'content-type': 'application/json' } }), save)).status, 400);
  assert.equal(writes, 0);
});
test('database failure never returns a success response', async () => {
  const response = await handleWaitlist(request({ email: 'a@example.com' }), async () => { throw new Error('secret'); });
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('secret'));
});
test('Supabase uses server credentials, duplicate-safe inserts, and rejects failures', async () => {
  const previous = globalThis.fetch;
  process.env.WAITLIST_STORAGE = 'supabase'; process.env.SUPABASE_URL = 'https://test.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-secret';
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url.toString(), 'https://test.supabase.co/rest/v1/waitlist?on_conflict=email');
      assert.equal(init.headers.Authorization, 'Bearer test-secret');
      assert.equal(init.headers.Prefer, 'resolution=ignore-duplicates,return=minimal');
      assert.deepEqual(JSON.parse(init.body), { email: 'a@example.com' });
      return new Response(null, { status: 201 });
    };
    await saveEmail('a@example.com');
    globalThis.fetch = async () => new Response(null, { status: 500 });
    await assert.rejects(saveEmail('a@example.com'));
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await assert.rejects(saveEmail('a@example.com'));
  } finally { globalThis.fetch = previous; delete process.env.WAITLIST_STORAGE; delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; }
});
