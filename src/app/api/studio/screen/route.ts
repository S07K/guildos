import { studioUser } from '@/lib/studio/supabase';
import { authConfig, sessionClient } from '@/lib/studio/supabase';
import { composeHtmlScreen, MAX_SCREEN_SECTIONS, MAX_SECTION_HTML_BYTES, validateHtmlScreen, type HtmlScreenDocument } from '@/lib/studio/html-screen';
import { compileScreenCss } from '@/lib/studio/html-screen-css';
import { privateJson as json, readCommitBody, uuid } from '@/lib/studio/version-commit';
import { adminClient } from '@/lib/studio/supabase';
import { ASSET_BUCKET } from '@/lib/studio/project-assets';

const MAX_INLINED_BYTES = 12 * 1024 * 1024;

/** Exports must work outside GuildOS, so the project's private images are embedded as data URIs. */
async function inlineProjectImages(html: string, project: { id: string; workspace_id: string }) {
 const pattern = new RegExp(`/api/studio/assets/([0-9a-f-]{36})\\?projectId=${project.id}`, 'g');
 const ids = [...new Set([...html.matchAll(pattern)].map(match => match[1]))].slice(0, 40);
 let total = 0;
 for (const id of ids) {
  const { data } = await adminClient().storage.from(ASSET_BUCKET).download(`${project.workspace_id}/${project.id}/${id}`);
  if (!data || !['image/png', 'image/jpeg', 'image/webp'].includes(data.type)) continue;
  const bytes = Buffer.from(await data.arrayBuffer());
  if ((total += bytes.length) > MAX_INLINED_BYTES) break;
  html = html.split(`/api/studio/assets/${id}?projectId=${project.id}`).join(`data:${data.type};base64,${bytes.toString('base64')}`);
 }
 return html;
}

export const runtime = 'nodejs';

/** Composes an HTML screen into the script-free srcdoc the editor shows in a sandboxed frame, or a standalone export. */
export async function POST(request: Request) {
 const origin = request.headers.get('origin');
 if (!origin || origin !== new URL(process.env.STUDIO_APP_URL || request.url).origin) return json({ error: 'Submit this request from your GuildOS studio.' }, 403);
 if (!authConfig()) return json({ error: 'Studio access is not configured.' }, 503);
 const client = await sessionClient();
 const { data: { user } } = await studioUser(client);
 if (!user) return json({ error: 'Your session expired. Sign in again.' }, 401);
 let body;
 try { body = await readCommitBody(request, MAX_SCREEN_SECTIONS * MAX_SECTION_HTML_BYTES + 65536); }
 catch { return json({ error: 'Invalid screen data.' }, 400); }
 if (typeof body.projectId !== 'string' || !uuid.test(body.projectId)) return json({ error: 'Invalid project.' }, 400);
 const issues = validateHtmlScreen(body.document);
 if (issues.length) return json({ error: issues[0] }, 400);
 // Rendering is scoped to projects the caller can read through RLS.
 const { data: project, error } = await client.from('studio_projects').select('id,workspace_id').eq('id', body.projectId).maybeSingle();
 if (error) return json({ error: 'The project could not be checked.' }, 503);
 if (!project) return json({ error: 'Project not found.' }, 404);
 const document = body.document as HtmlScreenDocument;
 const css = await compileScreenCss(document);
 if (body.export === true) {
  const html = await inlineProjectImages(composeHtmlScreen(document, css, { exportOnly: true }), project);
  const filename = `${document.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'screen'}.html`;
  return json({ html, filename });
 }
 return json({ html: composeHtmlScreen(document, css) });
}
