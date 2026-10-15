import { database } from '@/lib/database';
import { serviceAuthorized, unauthorized } from '@/lib/service-auth';
import { openaiProvider } from '@/providers/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  if (!serviceAuthorized(request)) return unauthorized();
  const workspaceId = new URL(request.url).searchParams.get('workspaceId') || '';
  if (!uuid.test(workspaceId)) return Response.json({ error: 'Invalid workspace.' }, { status: 400 });
  if (!openaiProvider.configured()) return Response.json({ connected: false, configured: false }, { headers: { 'Cache-Control': 'no-store' } });
  const { data, error } = await database().from('ai_provider_connections').select('provider,email,display_name,picture_url,scopes,expires_at').eq('workspace_id', workspaceId).eq('provider', 'openai').maybeSingle();
  if (error) return Response.json({ error: 'Could not read provider connection.' }, { status: 503 });
  if (!data) return Response.json({ connected: false, configured: openaiProvider.configured() }, { headers: { 'Cache-Control': 'no-store' } });
  return Response.json({ connected: true, configured: openaiProvider.configured(), provider: data.provider, identity: { email: data.email, name: data.display_name, picture: data.picture_url }, scopes: data.scopes, expiresAt: data.expires_at }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: Request) {
  if (!serviceAuthorized(request)) return unauthorized();
  const workspaceId = new URL(request.url).searchParams.get('workspaceId') || '';
  if (!uuid.test(workspaceId)) return Response.json({ error: 'Invalid workspace.' }, { status: 400 });
  const { error } = await database().from('ai_provider_connections').delete().eq('workspace_id', workspaceId).eq('provider', 'openai');
  if (error) return Response.json({ error: 'Could not remove provider connection.' }, { status: 503 });
  return Response.json({ connected: false }, { headers: { 'Cache-Control': 'no-store' } });
}
