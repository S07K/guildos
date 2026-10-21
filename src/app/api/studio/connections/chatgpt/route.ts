import { authConfig, sessionClient } from '@/lib/studio/supabase';
import { localCodex, localCodexEnabled } from '@/lib/studio/codex-local';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

async function context(request: Request) {
 const origin = request.headers.get('origin');
 const expected = process.env.STUDIO_APP_URL || new URL(request.url).origin;
 const crossSite = request.headers.get('sec-fetch-site') === 'cross-site';
 if (crossSite || (origin && origin !== new URL(expected).origin) || (request.method !== 'GET' && !origin)) return { response: json({ error: 'Submit this request from your GuildOS studio.' }, 403) };
 if (!authConfig()) return { response: json({ status: 'unconfigured', error: 'Studio access is not configured.' }, 503) };
 const client = await sessionClient();
 const { data: { user } } = await client.auth.getUser();
 if (!user) return { response: json({ error: 'Your session expired. Sign in again.' }, 401) };
 const { data: workspace } = await client.from('studio_workspaces').select('id').eq('owner_id', user.id).maybeSingle();
 if (!workspace) return { response: json({ error: 'Workspace not found.' }, 404) };
 return { workspaceId: workspace.id };
}

function serviceConfig() {
 const base = process.env.AI_SIGNIN_SERVICE_URL?.replace(/\/$/, '');
 const token = process.env.AI_SIGNIN_SERVICE_TOKEN;
 return base && token ? { base, token } : null;
}

async function serviceRequest(path: string, init: RequestInit = {}) {
 const config = serviceConfig();
 if (!config) return json({ status: 'unconfigured', error: 'The GuildOS AI sign-in service is not configured.' }, 503);
 try {
  const response = await fetch(`${config.base}${path}`, { ...init, headers: { Authorization: `Bearer ${config.token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers }, cache: 'no-store', signal: AbortSignal.timeout(12000) });
  const data = await response.json().catch(() => ({}));
  return json(data, response.status);
 } catch { return json({ error: 'The GuildOS AI sign-in service is unavailable. Please try again shortly.' }, 503); }
}

export async function GET(request: Request) {
 const ctx = await context(request); if ('response' in ctx) return ctx.response;
 if (localCodexEnabled()) {
  try { return json(await localCodex.status(ctx.workspaceId)); } catch(error) { return localError(error); }
 }
 return serviceRequest(`/api/v1/connections/openai?workspaceId=${encodeURIComponent(ctx.workspaceId)}`);
}

export async function POST(request: Request) {
 const ctx = await context(request); if ('response' in ctx) return ctx.response;
 let body; try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
 if (body?.action !== 'start') return json({ error: 'Invalid action.' }, 400);
 if (localCodexEnabled()) {
  try { return json(await localCodex.start(ctx.workspaceId)); } catch(error) { return localError(error); }
 }
 const returnTo = new URL('/studio/settings', process.env.STUDIO_APP_URL || new URL(request.url).origin).toString();
 return serviceRequest('/api/v1/oauth/openai/start', { method: 'POST', body: JSON.stringify({ workspaceId: ctx.workspaceId, returnTo }) });
}

export async function DELETE(request: Request) {
 const ctx = await context(request); if ('response' in ctx) return ctx.response;
 if (localCodexEnabled()) {
  try { await localCodex.disconnect(ctx.workspaceId); return json({ status: 'idle' }); } catch(error) { return localError(error); }
 }
 return serviceRequest(`/api/v1/connections/openai?workspaceId=${encodeURIComponent(ctx.workspaceId)}`, { method: 'DELETE' });
}

function localError(error: unknown) {
 const message = error instanceof Error ? error.message : '';
 const safe = /^(Install the Codex|Codex |ChatGPT |This workspace|The studio key vault)/.test(message) ? message : 'Could not load this local ChatGPT connection. Retry sign-in.';
 return json({ status: 'error', error: safe }, 503);
}
