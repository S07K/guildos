import type { SupabaseClient } from '@supabase/supabase-js';
import { runNextTask } from './worker.ts';

/**
 * Hosted worker: on Vercel there is no always-on process, so short-lived
 * invocations drain the queue instead. Each task action holds a lease with a
 * heartbeat, so an invocation cut off mid-action simply lets the lease expire
 * and the next invocation (or the Supabase schedule) picks the work back up.
 */
export async function drainQueue(client: SupabaseClient, options: { budgetMs?: number; run?: (client: SupabaseClient) => Promise<boolean>; now?: () => number } = {}) {
 const { budgetMs = 200_000, run = (client: SupabaseClient) => runNextTask(client), now = Date.now } = options;
 const started = now();
 let processed = 0;
 // Start new actions only within the budget; the function limit (300s) leaves room to finish the last one.
 while (now() - started < budgetMs) {
  let worked: boolean;
  try { worked = await run(client); }
  catch (error) { console.error('Hosted worker stopped:', error instanceof Error ? error.message : 'unknown error'); return { processed, more: false }; }
  if (!worked) return { processed, more: false };
  processed++;
 }
 return { processed, more: true };
}

/** True when this deployment should process tasks itself (hosted, with a worker secret). */
export function hostedWorkerEnabled(env: NodeJS.ProcessEnv = process.env) {
 return !!env.VERCEL && !!env.STUDIO_WORKER_SECRET && !!env.STUDIO_APP_URL;
}

/** Asks the worker endpoint to start draining. Locally the separate worker process does this. */
export async function kickWorker(env: NodeJS.ProcessEnv = process.env, request: typeof fetch = fetch) {
 if (!hostedWorkerEnabled(env)) return false;
 try {
  const response = await request(new URL('/api/worker', env.STUDIO_APP_URL), {
   method: 'POST', headers: { Authorization: `Bearer ${env.STUDIO_WORKER_SECRET}` }, cache: 'no-store', signal: AbortSignal.timeout(10_000),
  });
  return response.ok;
 } catch { return false; /* The Supabase schedule retries within a minute. */ }
}
