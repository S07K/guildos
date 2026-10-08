import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { clientBucket, consumeRateLimit, normalizeClientIP } from '../src/lib/waitlist-rate-limit.mjs';
import { handleWaitlist } from '../src/lib/waitlist-handler.mjs';
const exec = promisify(execFile);
const request = (email = 'person@example.com', headers = {}) => new Request('http://localhost:3000/api/waitlist', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '203.0.113.8', ...headers }, body: JSON.stringify({ email }),
});
function configure(t, changes = {}) {
  const folder = mkdtempSync(join(tmpdir(), 'guildos-rate-'));
  const vars = { NODE_ENV: 'production', VERCEL: '1', WAITLIST_STORAGE: 'sqlite', WAITLIST_DB_PATH: join(folder, 'waitlist.sqlite'), WAITLIST_RATE_LIMIT_SECRET: 'test-only-stable-secret', ...changes };
  const previous = Object.fromEntries(Object.keys(vars).map(key => [key, process.env[key]]));
  Object.entries(vars).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value);
  t.after(() => { Object.entries(previous).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value); rmSync(folder, { recursive: true, force: true }); });
}

test('Vercel identity ignores spoofed headers and normalizes IPv6 /64s', t => {
  configure(t);
  assert.equal(clientBucket(request()), clientBucket(request(undefined, { 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' })));
  assert.notEqual(clientBucket(request()), clientBucket(request(undefined, { 'x-vercel-forwarded-for': '203.0.113.9' })));
  assert.match(clientBucket(request()), /^[a-f0-9]{64}$/);
  assert.equal(normalizeClientIP('2001:db8:0:1::1'), normalizeClientIP('2001:0db8:0000:0001:ffff::2'));
  assert.equal(normalizeClientIP('::ffff:192.0.2.1'), '192.0.2.1');
  assert.equal(normalizeClientIP('::ffff:c000:201'), '192.0.2.1');
  assert.throws(() => clientBucket(request(undefined, { 'x-vercel-forwarded-for': '203.0.113.8, 1.2.3.4' })));
});

test('five requests persist, sixth is 429 with Retry-After and no extra signup', async t => {
  configure(t);
  for (let i = 0; i < 5; i++) assert.equal((await handleWaitlist(request(`person${i}@example.com`))).status, 200);
  const blocked = await handleWaitlist(request('blocked@example.com'));
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('Retry-After')) > 0);
  assert.equal(blocked.headers.get('Cache-Control'), 'no-store');
  const db = new DatabaseSync(process.env.WAITLIST_DB_PATH);
  assert.equal(db.prepare('SELECT count(*) AS total FROM waitlist').get().total, 5);
  assert.equal(db.prepare('SELECT count(*) AS total FROM waitlist_rate_limits').get().total, 1);
  assert.match(db.prepare('SELECT bucket FROM waitlist_rate_limits').get().bucket, /^[a-f0-9]{64}$/);
  db.close();
  assert.equal((await handleWaitlist(request('other@example.com', { 'x-vercel-forwarded-for': '203.0.113.9' }))).status, 200);
});

test('expired buckets reset and old entries are removed', async t => {
  configure(t);
  const bucket = 'a'.repeat(64);
  for (let i = 0; i < 5; i++) assert.equal((await consumeRateLimit(bucket, 1000)).allowed, true);
  assert.equal((await consumeRateLimit(bucket, 1899)).allowed, false);
  assert.equal((await consumeRateLimit(bucket, 1900)).allowed, true);
  await consumeRateLimit('b'.repeat(64), 3000);
  const db = new DatabaseSync(process.env.WAITLIST_DB_PATH);
  assert.equal(db.prepare('SELECT count(*) AS total FROM waitlist_rate_limits').get().total, 1);
  db.close();
});

test('separate concurrent processes share one persistent budget', async t => {
  configure(t);
  // Create the schema before racing twelve independent database connections.
  await consumeRateLimit('0'.repeat(64));
  const moduleURL = new URL('../src/lib/waitlist-rate-limit.mjs', import.meta.url).href;
  const script = `import {consumeRateLimit} from ${JSON.stringify(moduleURL)}; console.log(JSON.stringify(await consumeRateLimit('${'c'.repeat(64)}')));`;
  const results = await Promise.all(Array.from({ length: 12 }, () => exec(process.execPath, ['--input-type=module', '-e', script])));
  assert.equal(results.filter(result => JSON.parse(result.stdout).allowed).length, 5);
});

test('limiter failure blocks writes and missing trusted IP fails closed', async t => {
  configure(t);
  let writes = 0;
  const response = await handleWaitlist(request(), async () => { writes++; }, async () => { throw new Error('secret'); });
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('secret'));
  const missingIP = request(); missingIP.headers.delete('x-vercel-forwarded-for');
  assert.equal((await handleWaitlist(missingIP, async () => { writes++; })).status, 503);
  assert.equal(writes, 0);
});

test('malformed submissions consume budget before parsing', async t => {
  configure(t);
  for (let i = 0; i < 5; i++) assert.equal((await handleWaitlist(request('bad-email'))).status, 400);
  assert.equal((await handleWaitlist(request())).status, 429);
});

test('production refuses unconfigured proxy trust; development ignores forwarding spoofing', t => {
  configure(t, { VERCEL: undefined, WAITLIST_IP_HEADER: undefined });
  assert.throws(() => clientBucket(request()));
  process.env.NODE_ENV = 'development';
  assert.equal(clientBucket(request()), clientBucket(request(undefined, { 'x-vercel-forwarded-for': '1.2.3.4' })));
});

test('Supabase RPC contract fails closed on errors or malformed decisions', async t => {
  configure(t, { WAITLIST_STORAGE: 'supabase', SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-secret' });
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  globalThis.fetch = async (url, init) => {
    assert.equal(url.toString(), 'https://test.supabase.co/rest/v1/rpc/consume_waitlist_rate_limit');
    assert.equal(init.headers.Authorization, 'Bearer test-secret');
    assert.deepEqual(JSON.parse(init.body), { p_bucket: 'd'.repeat(64) });
    return Response.json({ allowed: false, retry_after: 600 });
  };
  assert.deepEqual(await consumeRateLimit('d'.repeat(64)), { allowed: false, retry_after: 600 });
  globalThis.fetch = async () => Response.json({ allowed: true });
  await assert.rejects(consumeRateLimit('d'.repeat(64)));
  globalThis.fetch = async () => new Response(null, { status: 500 });
  await assert.rejects(consumeRateLimit('d'.repeat(64)));
});

test('Supabase secret key authenticates both the limiter and signup without a bearer JWT', async t => {
  configure(t, {
    WAITLIST_STORAGE: 'supabase', SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_test-only', SUPABASE_SERVICE_ROLE_KEY: 'legacy-unused',
    WAITLIST_RATE_LIMIT_SECRET: undefined,
  });
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  const paths = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(init.headers.apikey, 'sb_secret_test-only');
    assert.equal(init.headers.Authorization, undefined);
    paths.push(url.pathname);
    if (url.pathname.endsWith('consume_waitlist_rate_limit')) {
      assert.match(JSON.parse(init.body).p_bucket, /^[a-f0-9]{64}$/);
      return Response.json({ allowed: true, retry_after: 900 });
    }
    assert.deepEqual(JSON.parse(init.body), { email: 'person@example.com' });
    return new Response(null, { status: 201 });
  };
  assert.equal((await handleWaitlist(request())).status, 200);
  assert.deepEqual(paths, ['/rest/v1/rpc/consume_waitlist_rate_limit', '/rest/v1/waitlist']);
});
