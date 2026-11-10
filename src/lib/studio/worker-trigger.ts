import { after } from 'next/server';
import { kickWorker } from './agents/hosted-worker.ts';

/** After the response is sent, wake the hosted worker so queued work starts right away. */
export function scheduleWorker() {
 try { after(() => kickWorker()); }
 catch { /* Outside a request (tests, scripts): the schedule or local worker handles it. */ }
}
