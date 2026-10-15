import type { ProviderTokenSet } from '@guildos/provider-auth';
import { database } from '../../../../../../lib/database';
import { serviceAuthorized, unauthorized } from '../../../../../../lib/service-auth';
import { open, seal } from '../../../../../../lib/vault';
import { openaiProvider } from '../../../../../../providers/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!serviceAuthorized(request)) return unauthorized();
  let body: { workspaceId?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (typeof body.workspaceId !== 'string' || !uuid.test(body.workspaceId)) return Response.json({ error: 'Invalid workspace.' }, { status: 400 });
  const workspaceId = body.workspaceId;
  const db = database();
  const { data, error } = await db.from('ai_provider_connections').select('subject,credentials_ciphertext,expires_at,scopes').eq('workspace_id', workspaceId).eq('provider', 'openai').maybeSingle();
  if (error) return Response.json({ error: 'Could not read provider connection.' }, { status: 503 });
  if (!data) return Response.json({ error: 'OpenAI is not connected for this workspace.' }, { status: 404 });
  let tokens: ProviderTokenSet;
  try { tokens = JSON.parse(open(data.credentials_ciphertext, workspaceId, 'openai')) as ProviderTokenSet; }
  catch { return Response.json({ error: 'OpenAI credentials could not be decrypted. Reconnect the account.' }, { status: 503 }); }
  if (!tokens.accessToken || tokens.identity.subject !== data.subject) return Response.json({ error: 'OpenAI credentials are invalid. Reconnect the account.' }, { status: 503 });
  let expiresAt = data.expires_at as string;
  if (new Date(data.expires_at).getTime() <= Date.now() + 120_000) {
    if (!tokens.refreshToken || !openaiProvider.refresh) return Response.json({ error: 'OpenAI connection expired. Reconnect the account.' }, { status: 401 });
    try {
      const renewed = await openaiProvider.refresh({ refreshToken: tokens.refreshToken, expectedSubject: data.subject });
      tokens = { ...renewed, scopes: renewed.scopes.length ? renewed.scopes : data.scopes };
      expiresAt = new Date(Date.now() + renewed.expiresIn * 1000).toISOString();
      const { error: updateError } = await db.from('ai_provider_connections').update({
        credentials_ciphertext: seal(JSON.stringify(tokens), workspaceId, 'openai'), scopes: tokens.scopes,
        expires_at: expiresAt, email: tokens.identity.email, display_name: tokens.identity.name, picture_url: tokens.identity.picture,
        updated_at: new Date().toISOString(),
      }).eq('workspace_id', workspaceId).eq('provider', 'openai');
      if (updateError) return Response.json({ error: 'Could not refresh OpenAI connection.' }, { status: 503 });
    } catch (refreshError) {
      return Response.json({ error: refreshError instanceof Error ? refreshError.message : 'OpenAI connection expired. Reconnect the account.' }, { status: 401 });
    }
  }
  return Response.json({ accessToken: tokens.accessToken, tokenType: tokens.tokenType, scopes: tokens.scopes, expiresAt }, { headers: { 'Cache-Control': 'no-store' } });
}
