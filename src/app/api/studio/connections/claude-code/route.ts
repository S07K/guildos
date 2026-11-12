import { studioUser } from '@/lib/studio/supabase';
import { authConfig, sessionClient } from '@/lib/studio/supabase';
import { ClaudeCodeError, claudeCodeStatus, connectClaudeCode, disconnectClaudeCode, localClaudeCodeEnabled } from '@/lib/studio/claude-code-local';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

async function context(request: Request) {
 if (!localClaudeCodeEnabled()) return { response: json({ status: 'unconfigured', transport: 'claude-code', error: 'Claude Code sign-in is available only in local development.' }, 404) };
 const origin = request.headers.get('origin');
 const expected = process.env.STUDIO_APP_URL || new URL(request.url).origin;
 const crossSite = request.headers.get('sec-fetch-site') === 'cross-site';
 if (crossSite || (origin && origin !== new URL(expected).origin) || (request.method !== 'GET' && !origin)) return { response: json({ error: 'Submit this request from your GuildOS studio.' }, 403) };
 if (!authConfig()) return { response: json({ status: 'unconfigured', error: 'Studio access is not configured.' }, 503) };
 const client = await sessionClient();
 const { data: { user } } = await studioUser(client);
 if (!user) return { response: json({ error: 'Your session expired. Sign in again.' }, 401) };
 const { data: workspace } = await client.from('studio_workspaces').select('id').eq('owner_id', user.id).maybeSingle();
 if (!workspace) return { response: json({ error: 'Workspace not found.' }, 404) };
 return { workspaceId: workspace.id as string };
}

function failure(error: unknown) {
 const message = error instanceof ClaudeCodeError ? error.message : 'Could not connect Claude Code. Retry.';
 return json({ status: 'error', transport: 'claude-code', error: message }, error instanceof ClaudeCodeError && error.kind === 'auth' ? 409 : 503);
}

export async function GET(request: Request) {
 const ctx = await context(request); if ('response' in ctx) return ctx.response;
 try { return json(await claudeCodeStatus(ctx.workspaceId)); } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
 const ctx = await context(request); if ('response' in ctx) return ctx.response;
 let body; try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
 if (body?.action !== 'connect') return json({ error: 'Invalid action.' }, 400);
 try { return json(await connectClaudeCode(ctx.workspaceId)); } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
 const ctx = await context(request); if ('response' in ctx) return ctx.response;
 try { await disconnectClaudeCode(ctx.workspaceId); return json({ status: 'idle', transport: 'claude-code' }); } catch (error) { return failure(error); }
}
