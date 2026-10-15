import { authConfig, sessionClient } from '@/lib/studio/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

async function context(request: Request) {
 const origin = request.headers.get('origin');
 const expected = process.env.STUDIO_APP_URL || new URL(request.url).origin;
 const crossSite = request.headers.get('sec-fetch-site') === 'cross-site';
 if (crossSite || (origin && origin !== new URL(expected).origin) || (request.method !== 'GET' && !origin)) return { response: json({ error: 'Submit this request from your GuildOS studio.' }, 403) };
 if (!authConfig() || !process.env.CODEX_BRIDGE_URL || !process.env.CODEX_BRIDGE_TOKEN) return { response: json({ error: 'ChatGPT device connection is not configured for this deployment.' }, 503) };
 const client = await sessionClient();
 const { data: { user } } = await client.auth.getUser();
 if (!user) return { response: json({ error: 'Your session expired. Sign in again.' }, 401) };
 const { data: workspace } = await client.from('studio_workspaces').select('id').eq('owner_id', user.id).maybeSingle();
 if (!workspace) return { response: json({ error: 'Workspace not found.' }, 404) };
 return { workspaceId: workspace.id };
}

async function bridge(request: Request, workspaceId: string, method: string, action?: string) {
 const base = process.env.CODEX_BRIDGE_URL!.replace(/\/$/, '');
 try {
  const response = await fetch(`${base}/v1/device/session?workspace_id=${encodeURIComponent(workspaceId)}`, {
   method, headers: { Authorization: `Bearer ${process.env.CODEX_BRIDGE_TOKEN}`, ...(action ? { 'Content-Type': 'application/json' } : {}) },
   ...(action ? { body: JSON.stringify({ action }) } : {}), cache: 'no-store', signal: AbortSignal.timeout(12000),
  });
  const data = await response.json().catch(() => ({}));
  return json(data, response.status);
 } catch { return json({ error: 'ChatGPT connection service is unavailable. Please try again shortly.' }, 503); }
}

export async function GET(request: Request) {
 const ctx = await context(request); if ('response' in ctx) return ctx.response;
 return bridge(request, ctx.workspaceId, 'GET');
}
export async function POST(request: Request) {
 const ctx = await context(request); if ('response' in ctx) return ctx.response;
 let body; try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
 if (body?.action !== 'start') return json({ error: 'Invalid action.' }, 400);
 return bridge(request, ctx.workspaceId, 'POST', 'start');
}
export async function DELETE(request: Request) {
 const ctx = await context(request); if ('response' in ctx) return ctx.response;
 return bridge(request, ctx.workspaceId, 'DELETE');
}
