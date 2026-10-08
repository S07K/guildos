import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL SQL/PLpgSQL in WASM, without a socket or Supabase credentials.
// This validates schema semantics; hosted Supabase connectivity still needs a preview.
test('PostgreSQL migrations enforce persistence, deduplication, rate limits, and access control', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;');
    for (const file of ['202610070001_waitlist.sql', '202610080001_waitlist_rate_limit.sql']) {
      const sql = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
      await db.exec(sql);
      await db.exec(sql); // Migrations are safe to rerun.
    }
    await db.exec('SET ROLE service_role');
    await db.query("INSERT INTO public.waitlist(email) VALUES ('a@example.com') ON CONFLICT(email) DO NOTHING");
    await db.query("INSERT INTO public.waitlist(email) VALUES ('a@example.com') ON CONFLICT(email) DO NOTHING");
    assert.equal((await db.query('SELECT count(*)::int AS total FROM public.waitlist')).rows[0].total, 1);
    const consume = async bucket => (await db.query('SELECT public.consume_waitlist_rate_limit($1) AS result', [bucket])).rows[0].result;
    const bucket = 'a'.repeat(64);
    for (let i = 0; i < 5; i++) assert.equal((await consume(bucket)).allowed, true);
    const blocked = await consume(bucket);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retry_after > 0 && blocked.retry_after <= 900);
    assert.equal((await consume('b'.repeat(64))).allowed, true);
    await db.query("UPDATE public.waitlist_rate_limits SET expires_at = now() - interval '1 second' WHERE bucket = $1", [bucket]);
    assert.equal((await consume(bucket)).allowed, true);
    await assert.rejects(consume('raw-ip-is-not-a-hash'));
    await db.exec('RESET ROLE');
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(db.query('SELECT * FROM public.waitlist'));
      await assert.rejects(db.query("INSERT INTO public.waitlist(email) VALUES ('attack@example.com')"));
      await assert.rejects(db.query('SELECT * FROM public.waitlist_rate_limits'));
      await assert.rejects(consume(bucket));
      await db.exec('RESET ROLE');
    }
  } finally { await db.close(); }
});
