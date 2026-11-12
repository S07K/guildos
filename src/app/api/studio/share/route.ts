import { studioUser } from '@/lib/studio/supabase';
import { adminClient, authConfig, sessionClient } from '@/lib/studio/supabase';
import { hashShareToken, newShareToken, sharePath } from '@/lib/studio/share-links';
import { openKey, sealKey } from '@/lib/studio/vault.mjs';
import { privateJson as json, readCommitBody, uuid } from '@/lib/studio/version-commit';

export const runtime = 'nodejs';

/** The caller's session and a project it can read (RLS) before any service-role write. */
async function scope(projectId: unknown) {
 if (!authConfig()) return { response: json({ error: 'Studio access is not configured.' }, 503) };
 const client = await sessionClient();
 const { data: { user } } = await studioUser(client);
 if (!user) return { response: json({ error: 'Your session expired. Sign in again.' }, 401) };
 if (typeof projectId !== 'string' || !uuid.test(projectId)) return { response: json({ error: 'Invalid project.' }, 400) };
 const { data: project, error } = await client.from('studio_projects').select('id,workspace_id').eq('id', projectId).maybeSingle();
 if (error) return { response: json({ error: 'The project could not be checked.' }, 503) };
 if (!project) return { response: json({ error: 'Project not found.' }, 404) };
 return { client, user, project };
}
const linkUrl = (request: Request, token: string) => new URL(sharePath(token), process.env.STUDIO_APP_URL || request.url).toString();
type LinkRow = { id: string; screen_id: string | null; token_ciphertext: string; created_at: string };
const present = (request: Request, workspaceId: string, row: LinkRow) => ({ id: row.id, screenId: row.screen_id, createdAt: row.created_at, url: linkUrl(request, openKey(row.token_ciphertext, workspaceId)) });

/** Active share links of a project. */
export async function GET(request: Request) {
 const checked = await scope(new URL(request.url).searchParams.get('projectId'));
 if (checked.response) return checked.response;
 const { data, error } = await checked.client.from('studio_share_links').select('id,screen_id,token_ciphertext,created_at').eq('project_id', checked.project.id).is('revoked_at', null).order('created_at', { ascending: false });
 if (error) return json({ error: ['PGRST205', '42P01'].includes(error.code) ? 'Share links need the latest database migration.' : 'Share links could not be loaded.' }, 503);
 try { return json({ links: (data || []).map(row => present(request, checked.project.workspace_id, row)) }); }
 catch { return json({ error: 'Share links could not be read.' }, 503); }
}

/** Creates a link for one screen (screenId) or the whole board (screenId null); an active link for the same scope is reused. */
export async function POST(request: Request) {
 let body: Record<string, unknown>;
 try { body = await readCommitBody(request, 4096); } catch { return json({ error: 'Invalid request.' }, 400); }
 const checked = await scope(body.projectId);
 if (checked.response) return checked.response;
 const screenId = body.screenId ?? null;
 if (screenId !== null && (typeof screenId !== 'string' || !uuid.test(screenId))) return json({ error: 'Invalid screen.' }, 400);
 if (screenId) {
  const { data: screen } = await checked.client.from('studio_screens').select('id,deleted_at').eq('id', screenId).eq('project_id', checked.project.id).maybeSingle();
  if (!screen || screen.deleted_at) return json({ error: 'That screen is no longer on the board.' }, 404);
 }
 const admin = adminClient();
 let existing = admin.from('studio_share_links').select('id,screen_id,token_ciphertext,created_at').eq('project_id', checked.project.id).eq('workspace_id', checked.project.workspace_id).is('revoked_at', null);
 existing = screenId ? existing.eq('screen_id', screenId) : existing.is('screen_id', null);
 const { data: reuse, error: reuseError } = await existing.limit(1).maybeSingle();
 if (reuseError) return json({ error: 'Share links need the latest database migration.' }, 503);
 try {
  if (reuse) return json({ link: present(request, checked.project.workspace_id, reuse) });
  const token = newShareToken();
  const { data, error } = await admin.from('studio_share_links').insert({ project_id: checked.project.id, workspace_id: checked.project.workspace_id, screen_id: screenId, token_hash: hashShareToken(token), token_ciphertext: sealKey(token, checked.project.workspace_id), created_by: checked.user.id }).select('id,screen_id,token_ciphertext,created_at').single();
  if (error || !data) return json({ error: 'The share link could not be created.' }, 503);
  return json({ link: present(request, checked.project.workspace_id, data) }, 201);
 } catch { return json({ error: 'The share link could not be created.' }, 503); }
}

/** Revokes a link: its URL stops working immediately. */
export async function DELETE(request: Request) {
 let body: Record<string, unknown>;
 try { body = await readCommitBody(request, 4096); } catch { return json({ error: 'Invalid request.' }, 400); }
 const checked = await scope(body.projectId);
 if (checked.response) return checked.response;
 if (typeof body.linkId !== 'string' || !uuid.test(body.linkId)) return json({ error: 'Invalid link.' }, 400);
 const { data, error } = await adminClient().from('studio_share_links').update({ revoked_at: new Date().toISOString() }).eq('id', body.linkId).eq('project_id', checked.project.id).eq('workspace_id', checked.project.workspace_id).is('revoked_at', null).select('id').maybeSingle();
 if (error) return json({ error: 'The link could not be revoked.' }, 503);
 if (!data) return json({ error: 'Link not found.' }, 404);
 return json({ revoked: data.id });
}
