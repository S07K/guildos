import { createHash, randomBytes } from 'node:crypto';
import { database } from '../../../../../../lib/database';
import { publicBaseUrl } from '../../../../../../lib/env';
import { serviceAuthorized, unauthorized } from '../../../../../../lib/service-auth';
import { seal } from '../../../../../../lib/vault';
import { openaiProvider } from '../../../../../../providers/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!serviceAuthorized(request)) return unauthorized();
  if (!openaiProvider.configured()) return Response.json({ error: 'OpenAI Sign in with ChatGPT is not configured for this service.' }, { status: 503 });
  let body: { workspaceId?: unknown; returnTo?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (typeof body.workspaceId !== 'string' || !uuid.test(body.workspaceId) || typeof body.returnTo !== 'string') return Response.json({ error: 'Invalid workspace or return URL.' }, { status: 400 });
  let returnTo: URL;
  try { returnTo = new URL(body.returnTo); } catch { return Response.json({ error: 'Invalid return URL.' }, { status: 400 }); }
  const allowedOrigins = [process.env.GUILDOS_APP_URL, ...(process.env.AI_SIGNIN_RETURN_ORIGINS || '').split(',')].map(value => value?.trim()).filter((value): value is string => Boolean(value)).map(value => new URL(value).origin);
  if (!allowedOrigins.includes(returnTo.origin) || returnTo.username || returnTo.password) return Response.json({ error: 'Return URL is not allowed.' }, { status: 400 });

  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const redirectUri = new URL('/api/oauth/openai/callback', publicBaseUrl()).toString();
  const authorizationUrl = openaiProvider.begin({ redirectUri, state, nonce, codeChallenge: challenge });
  const db = database();
  await db.from('ai_signin_transactions').delete().lt('expires_at', new Date().toISOString());
  const { error } = await db.from('ai_signin_transactions').insert({
    state_hash: createHash('sha256').update(state).digest('hex'), provider: 'openai', workspace_id: body.workspaceId,
    nonce, code_verifier_ciphertext: seal(verifier, body.workspaceId, 'openai:transaction'), redirect_uri: redirectUri,
    return_url: returnTo.toString(), expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) return Response.json({ error: 'Could not start provider sign-in.' }, { status: 503 });
  return Response.json({ authorizationUrl: authorizationUrl.toString() }, { headers: { 'Cache-Control': 'no-store' } });
}
