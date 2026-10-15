import { createHash } from 'node:crypto';
import { database } from '@/lib/database';
import { open, seal } from '@/lib/vault';
import { openaiProvider } from '@/providers/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Transaction = { workspace_id: string; nonce: string; code_verifier_ciphertext: string; redirect_uri: string; return_url: string; expires_at: string };

function resultRedirect(returnUrl: string, status: string) {
  const target = new URL(returnUrl);
  target.searchParams.set('ai_connection', 'openai');
  target.searchParams.set('status', status);
  return Response.redirect(target, 303);
}

export async function GET(request: Request) {
  const callback = new URL(request.url);
  const state = callback.searchParams.get('state');
  if (!state || state.length > 200) return Response.json({ error: 'Invalid sign-in state.' }, { status: 400 });
  const stateHash = createHash('sha256').update(state).digest('hex');
  const { data, error } = await database().rpc('consume_ai_signin_transaction', { p_state_hash: stateHash });
  const transaction = (Array.isArray(data) ? data[0] : data) as Transaction | null;
  if (error || !transaction || new Date(transaction.expires_at).getTime() < Date.now()) return Response.json({ error: 'Sign-in expired. Start again from GuildOS.' }, { status: 400 });
  if (callback.searchParams.has('error')) return resultRedirect(transaction.return_url, 'cancelled');
  const code = callback.searchParams.get('code');
  if (!code || code.length > 4096) return resultRedirect(transaction.return_url, 'failed');
  try {
    const callbackClientId = callback.searchParams.get('client_id');
    if (callbackClientId && callbackClientId !== process.env.OPENAI_CLIENT_ID) throw new Error('OpenAI client ID did not match.');
    const tokens = await openaiProvider.exchange({ code, redirectUri: transaction.redirect_uri, codeVerifier: open(transaction.code_verifier_ciphertext, transaction.workspace_id, 'openai:transaction'), nonce: transaction.nonce });
    const { data: existing, error: existingError } = await database().from('ai_provider_connections').select('subject').eq('workspace_id', transaction.workspace_id).eq('provider', 'openai').maybeSingle();
    if (existingError) throw new Error('Could not verify the existing provider connection.');
    if (existing && existing.subject !== tokens.identity.subject) return resultRedirect(transaction.return_url, 'account_mismatch');
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();
    const { error: saveError } = await database().from('ai_provider_connections').upsert({
      workspace_id: transaction.workspace_id, provider: 'openai', subject: tokens.identity.subject, email: tokens.identity.email,
      display_name: tokens.identity.name, picture_url: tokens.identity.picture, scopes: tokens.scopes, expires_at: expiresAt,
      credentials_ciphertext: seal(JSON.stringify(tokens), transaction.workspace_id, 'openai'), updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,provider' });
    if (saveError) throw new Error('Could not save the provider connection.');
    return resultRedirect(transaction.return_url, 'connected');
  } catch {
    return resultRedirect(transaction.return_url, 'failed');
  }
}
