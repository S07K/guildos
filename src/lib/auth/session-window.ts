import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { SESSION_MAX_AGE_SECONDS } from './config.ts';

type SessionWindow = { issuedAt: number; userId: string; sessionId: string };
function secret() {
  const key = process.env.AUTH_SESSION_SECRET || process.env.STUDIO_VAULT_KEY;
  if (!key || key.length < 32) throw new Error('Configure AUTH_SESSION_SECRET (at least 32 characters) or STUDIO_VAULT_KEY.');
  return key;
}
const sign = (value: string) => createHmac('sha256', secret()).update(`guildos-session-v1:${value}`).digest('base64url');
/** Payload decoding is only for binding an already Auth-server-verified token, never authentication. */
export function tokenSessionId(token: string): string | null {
  try {const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());return typeof payload.session_id === 'string' && payload.session_id.length <= 100 ? payload.session_id : null;} catch {return null;}
}
export function issueSessionWindow(session: Session, now = Math.floor(Date.now()/1000)): string {
  const sessionId = tokenSessionId(session.access_token);
  if (!sessionId || !session.user.id) throw new Error('The sign-in response did not contain a session identity.');
  const payload = Buffer.from(JSON.stringify({issuedAt:now,userId:session.user.id,sessionId})).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
export function readSessionWindow(value?: string, now = Math.floor(Date.now()/1000)): SessionWindow | null {
  if (!value || value.length > 1500) return null;
  try {
    const [payload,signature,...extra] = value.split('.');
    if (extra.length || !signature) return null;
    const actual = Buffer.from(signature), expected = Buffer.from(sign(payload));
    if (actual.length !== expected.length || !timingSafeEqual(actual,expected)) return null;
    const window = JSON.parse(Buffer.from(payload,'base64url').toString()) as SessionWindow;
    if (!Number.isSafeInteger(window.issuedAt) || window.issuedAt > now || now-window.issuedAt >= SESSION_MAX_AGE_SECONDS || typeof window.userId !== 'string' || typeof window.sessionId !== 'string') return null;
    return window;
  } catch {return null;}
}
export function sessionExpiresAt(value?: string) {
  const window = readSessionWindow(value);
  return window ? (window.issuedAt + SESSION_MAX_AGE_SECONDS)*1000 : null;
}
/** Both proxy and backend authorize independently; never trust forwarded identity headers. */
export async function validateStudioSession(client: SupabaseClient, marker?: string) {
  const window = readSessionWindow(marker);
  if (!window) return null;
  const {data:{user},error} = await client.auth.getUser();
  if (error || !user || user.id !== window.userId) return null;
  const {data:{session}} = await client.auth.getSession();
  if (!session || tokenSessionId(session.access_token) !== window.sessionId || !readSessionWindow(marker)) return null;
  return user;
}
