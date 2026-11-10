import test from 'node:test';
import assert from 'node:assert/strict';
import { drainQueue, hostedWorkerEnabled, kickWorker } from '../src/lib/studio/agents/hosted-worker.ts';

test('the hosted worker drains until the queue is empty', async () => {
 let remaining = 3;
 const result = await drainQueue({}, { run: async () => remaining-- > 0 });
 assert.deepEqual(result, { processed: 3, more: false });
});

test('the hosted worker stops starting actions at its time budget and reports leftover work', async () => {
 let clock = 0;
 const result = await drainQueue({}, { budgetMs: 100, now: () => clock, run: async () => { clock += 40; return true; } });
 assert.deepEqual(result, { processed: 3, more: true });
});

test('a queue failure ends the run instead of crashing the function', async () => {
 const original = console.error; console.error = () => {};
 try {
  const result = await drainQueue({}, { run: async () => { throw new Error('Task queue unavailable.'); } });
  assert.deepEqual(result, { processed: 0, more: false });
 } finally { console.error = original; }
});

test('only hosted deployments with a secret wake the worker endpoint', async () => {
 const env = { VERCEL: '1', STUDIO_WORKER_SECRET: 's3cret', STUDIO_APP_URL: 'https://www.guildos.design' };
 assert.equal(hostedWorkerEnabled({}), false);
 assert.equal(hostedWorkerEnabled({ ...env, VERCEL: '' }), false, 'local development uses its own worker process');
 assert.equal(hostedWorkerEnabled({ ...env, STUDIO_WORKER_SECRET: '' }), false);
 let called;
 assert.equal(await kickWorker(env, async (url, init) => { called = { url: String(url), auth: init.headers.Authorization, method: init.method }; return new Response(null, { status: 202 }); }), true);
 assert.deepEqual(called, { url: 'https://www.guildos.design/api/worker', auth: 'Bearer s3cret', method: 'POST' });
 assert.equal(await kickWorker({}, async () => { throw new Error('should not be called'); }), false);
 assert.equal(await kickWorker(env, async () => { throw new TypeError('network down'); }), false, 'a failed kick is left to the schedule');
});
