import type { SupabaseClient } from '@supabase/supabase-js';
import { isHtmlScreen, type HtmlScreenDocument } from './html-screen.ts';

/** A screen on a project's board with the document of its head version. */
export type BoardScreen = { id: string; name: string; device: 'mobile' | 'tablet' | 'desktop'; x: number; y: number; headVersionId: string | null; updatedAt: string; document: HtmlScreenDocument | null };
export type ScreenVersion = { id: string; screen_id: string; document: HtmlScreenDocument; feedback: string; model: string; input_tokens: number; output_tokens: number; created_at: string };

/**
 * Loads the board through the caller's client. With a session client, RLS limits it
 * to the caller's workspace; callers still pass the project they already checked.
 */
export async function loadBoard(client: SupabaseClient, projectId: string): Promise<BoardScreen[]> {
 const { data: screens, error } = await client.from('studio_screens').select('id,name,device,x,y,head_version_id,updated_at,deleted_at,created_at').eq('project_id', projectId).order('created_at', { ascending: true });
 if (error) throw new Error(['PGRST205', '42P01'].includes(error.code) ? 'Screens need the latest database migration.' : 'The board could not be loaded.');
 const live = (screens || []).filter(screen => !screen.deleted_at);
 const heads = live.map(screen => screen.head_version_id).filter((id): id is string => !!id);
 const { data: versions, error: versionError } = heads.length ? await client.from('studio_screen_versions').select('id,document').in('id', heads) : { data: [], error: null };
 if (versionError) throw new Error('The board could not be loaded.');
 const documents = new Map((versions || []).map(version => [version.id, version.document]));
 return live.map(screen => ({
  id: screen.id, name: screen.name, device: screen.device, x: screen.x, y: screen.y, headVersionId: screen.head_version_id, updatedAt: screen.updated_at,
  document: isHtmlScreen(documents.get(screen.head_version_id)) ? documents.get(screen.head_version_id) as HtmlScreenDocument : null,
 }));
}
