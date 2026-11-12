import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isHtmlScreen, type HtmlScreenDocument } from './html-screen.ts';
import { ASSET_BUCKET } from './project-assets.ts';

/**
 * Read-only share links. A token is a 192-bit bearer secret in the URL; the database keeps
 * only its SHA-256 for lookup, plus a workspace-bound encrypted copy for the owner.
 */
export const newShareToken = () => randomBytes(24).toString('base64url');
export const isShareToken = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{32}$/.test(value);
export const hashShareToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const sharePath = (token: string) => `/share/${token}`;

export type SharedScreen = { id: string; name: string; device: HtmlScreenDocument['device']; document: HtmlScreenDocument };
export type SharedBoard = { linkId: string; scope: 'screen' | 'board'; project: { id: string; workspace_id: string; name: string }; screens: SharedScreen[] };

/** Resolves an active link to its project and screens (service role: viewers are anonymous). */
export async function loadSharedBoard(admin: SupabaseClient, token: string): Promise<SharedBoard | null> {
 if (!isShareToken(token)) return null;
 const { data: link } = await admin.from('studio_share_links').select('id,project_id,workspace_id,screen_id,revoked_at').eq('token_hash', hashShareToken(token)).maybeSingle();
 if (!link || link.revoked_at) return null;
 const { data: project } = await admin.from('studio_projects').select('id,workspace_id,name').eq('id', link.project_id).eq('workspace_id', link.workspace_id).maybeSingle();
 if (!project) return null;
 let query = admin.from('studio_screens').select('id,name,device,x,y,head_version_id,deleted_at').eq('project_id', project.id).eq('workspace_id', project.workspace_id);
 if (link.screen_id) query = query.eq('id', link.screen_id);
 const { data: rows } = await query;
 const live = (rows || []).filter(row => !row.deleted_at && row.head_version_id).sort((a, b) => a.y - b.y || a.x - b.x);
 if (!live.length) return null;
 const { data: versions } = await admin.from('studio_screen_versions').select('id,document').in('id', live.map(row => row.head_version_id)).eq('workspace_id', project.workspace_id);
 const documents = new Map((versions || []).map(version => [version.id, version.document]));
 const screens = live.flatMap(row => { const document = documents.get(row.head_version_id); return isHtmlScreen(document) ? [{ id: row.id, name: row.name, device: row.device, document: document as HtmlScreenDocument }] : []; });
 return screens.length ? { linkId: link.id, scope: link.screen_id ? 'screen' : 'board', project, screens } : null;
}

/** Points the screen's private project images at the share link's own image route. */
export const shareImageUrls = (html: string, projectId: string, token: string) =>
 html.replace(new RegExp(`/api/studio/assets/([0-9a-f-]{36})\\?projectId=${projectId}`, 'g'), (_, id) => `${sharePath(token)}/images/${id}`);

/** An image of a shared project, only when the board actually uses it. */
export async function sharedImage(admin: SupabaseClient, board: SharedBoard, imageId: string) {
 if (!/^[0-9a-f-]{36}$/.test(imageId)) return null;
 const used = board.screens.some(screen => JSON.stringify(screen.document).includes(`/api/studio/assets/${imageId}?projectId=${board.project.id}`));
 if (!used) return null;
 const { data } = await admin.storage.from(ASSET_BUCKET).download(`${board.project.workspace_id}/${board.project.id}/${imageId}`);
 return data && ['image/png', 'image/jpeg', 'image/webp'].includes(data.type) ? data : null;
}
