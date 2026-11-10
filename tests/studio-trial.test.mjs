import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { trialConfig, firstRunDisplay, waitingForModelMessages, noModelMessage, trialExhaustedMessage } from '../src/lib/studio/trial.ts';

test('trial config prefers Groq, falls back to OpenRouter, and can be disabled', () => {
 assert.equal(trialConfig({}), null);
 assert.deepEqual(trialConfig({ STUDIO_TRIAL_GROQ_KEY: ' gsk_x ', STUDIO_TRIAL_OPENROUTER_KEY: 'sk-or' }), { provider: 'groq', key: 'gsk_x', model: 'openai/gpt-oss-120b', runs: 3 });
 assert.equal(trialConfig({ STUDIO_TRIAL_OPENROUTER_KEY: 'sk-or', STUDIO_TRIAL_MODEL: 'm', STUDIO_TRIAL_RUNS: '5' })?.provider, 'openrouter');
 assert.equal(trialConfig({ STUDIO_TRIAL_OPENROUTER_KEY: 'sk-or', STUDIO_TRIAL_RUNS: '5' })?.runs, 5);
 assert.equal(trialConfig({ STUDIO_TRIAL_GROQ_KEY: 'g', STUDIO_TRIAL_RUNS: '0' }), null);
 assert.equal(trialConfig({ STUDIO_TRIAL_GROQ_KEY: 'g', STUDIO_TRIAL_RUNS: 'abc' })?.runs, 3);
 assert.equal(trialConfig({ STUDIO_TRIAL_GROQ_KEY: 'g', STUDIO_TRIAL_RUNS: '9999' })?.runs, 50);
});

test('the brief becomes the first chat message within the note size limit', () => {
 assert.equal(firstRunDisplay('  A calm landing page for a budgeting app  '), 'A calm landing page for a budgeting app');
 const long = firstRunDisplay('x'.repeat(5000));
 assert.equal(long.length, 2000);
 assert.ok(long.endsWith('…'));
 assert.deepEqual(waitingForModelMessages, [noModelMessage, trialExhaustedMessage]);
 assert.ok(waitingForModelMessages.every(message => message.length <= 2000));
});

test('trial runs are capped per workspace, idempotent per run, releasable, and server-only', async () => {
 const db = new PGlite();
 try {
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;");
  const directory = new URL('../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(file, directory), 'utf8'));

  const [owner, otherOwner] = [randomUUID(), randomUUID()];
  await db.query('insert into auth.users(id) values($1),($2)', [owner, otherOwner]);
  const { rows: [{ id: workspace }] } = await db.query('insert into public.studio_workspaces(owner_id) values($1) returning id', [owner]);
  const { rows: [{ id: other }] } = await db.query('insert into public.studio_workspaces(owner_id) values($1) returning id', [otherOwner]);
  const claim = async (ws, run, limit = 2) => (await db.query('select public.claim_studio_trial_run($1,$2,$3) as ok', [ws, run, limit])).rows[0].ok;

  const [first, second, third] = [randomUUID(), randomUUID(), randomUUID()];
  assert.equal(await claim(workspace, first), true);
  assert.equal(await claim(workspace, first), true, 'later stages of the same run stay admitted');
  assert.equal(await claim(workspace, second), true);
  assert.equal(await claim(workspace, third), false, 'the limit applies per workspace');
  assert.equal(await claim(other, third), true, 'another workspace has its own allowance');

  await db.query('select public.release_studio_trial_run($1,$2)', [workspace, second]);
  assert.equal(await claim(workspace, third), true, 'a released run frees its slot');

  await db.exec('set role authenticated');
  await assert.rejects(db.query('select public.claim_studio_trial_run($1,$2,$3)', [workspace, randomUUID(), 99]));
  await assert.rejects(db.query('select * from public.studio_trial_runs'));
  await db.exec('reset role');
 } finally { await db.close(); }
});
