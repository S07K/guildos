import { after } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { adminClient } from '@/lib/studio/supabase';
import { drainQueue, kickWorker } from '@/lib/studio/agents/hosted-worker';

// Draining continues after the response, within this function's time limit.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Called by the app after work is queued, and every minute by Supabase while work is pending. */
export async function POST(request: Request) {
 const secret = process.env.STUDIO_WORKER_SECRET;
 if (!secret) return Response.json({ error: 'The hosted worker is not configured.' }, { status: 503 });
 const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
 if (!timingSafeEqual(digest(given), digest(secret))) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
 after(async () => {
  const { processed, more } = await drainQueue(adminClient());
  if (processed) console.log(`Hosted worker processed ${processed} task action${processed === 1 ? '' : 's'}.`);
  // Out of time with work left: hand over to a fresh invocation.
  if (more) await kickWorker();
 });
 return Response.json({ accepted: true }, { status: 202 });
}
