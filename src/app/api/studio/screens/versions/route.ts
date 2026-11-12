import { studioUser } from '@/lib/studio/supabase';
import { authConfig, sessionClient } from '@/lib/studio/supabase';
import { privateJson as json, uuid } from '@/lib/studio/version-commit';

export const runtime = 'nodejs';

/** A screen's version history, newest first (RLS-scoped to the caller's workspace). */
export async function GET(request: Request) {
 if (!authConfig()) return json({ error: 'Studio access is not configured.' }, 503);
 const client = await sessionClient();
 const { data: { user } } = await studioUser(client);
 if (!user) return json({ error: 'Your session expired. Sign in again.' }, 401);
 const params = new URL(request.url).searchParams;
 const projectId = params.get('projectId'), screenId = params.get('screenId');
 if (!projectId || !uuid.test(projectId) || !screenId || !uuid.test(screenId)) return json({ error: 'Invalid screen.' }, 400);
 const { data, error } = await client.from('studio_screen_versions').select('id,screen_id,document,feedback,model,input_tokens,output_tokens,created_at')
  .eq('project_id', projectId).eq('screen_id', screenId).order('created_at', { ascending: false }).limit(50);
 if (error) return json({ error: 'Versions could not be loaded.' }, 503);
 return json({ versions: data || [] });
}
