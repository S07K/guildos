import { timingSafeEqual } from 'node:crypto';
import { requiredEnv } from './env';

export function serviceAuthorized(request: Request): boolean {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  const expected = process.env.AI_SIGNIN_SERVICE_TOKEN || '';
  if (!expected || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(requiredEnv('AI_SIGNIN_SERVICE_TOKEN')));
}

export function unauthorized() {
  return Response.json({ error: 'Unauthorized service request.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
}
