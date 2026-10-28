import { studioUser } from '@/lib/studio/supabase';
import { authConfig, sessionClient } from '@/lib/studio/supabase';
import { privateJson as json } from '@/lib/studio/version-commit';
import { isUnsplashImageUrl } from '@/lib/studio/image-source';

export const runtime = 'nodejs';
const MAX_BYTES = 12 * 1024 * 1024;
/** An authenticated, fixed-CDN proxy. Never follow redirects or forward cookies upstream. */
export async function GET(request: Request) {
  if (!authConfig()) return json({error:'Studio access is not configured.'},503);
  const client = await sessionClient();
  const {data:{user}} = await studioUser(client);
  if (!user) return json({error:'Sign in to export images.'},401);
  const url = new URL(request.url).searchParams.get('url');
  if (!isUnsplashImageUrl(url)) return json({error:'Only verified Unsplash image URLs are supported.'},400);
  try {
    const response = await fetch(url, {redirect:'error', signal:AbortSignal.timeout(15000), cache:'no-store', headers:{Accept:'image/png,image/jpeg,image/webp'}});
    const type = response.headers.get('content-type')?.split(';')[0];
    if (!response.ok || !type || !['image/png','image/jpeg','image/webp','image/avif'].includes(type) || !response.body) throw new Error('Invalid upstream image');
    if (Number(response.headers.get('content-length')) > MAX_BYTES) {await response.body.cancel(); return json({error:'Image exceeds the 12 MB export limit.'},413);}
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const {done,value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) {await reader.cancel(); return json({error:'Image exceeds the 12 MB export limit.'},413);}
        chunks.push(value);
      }
    } finally {reader.releaseLock();}
    return new Response(Buffer.concat(chunks), {headers:{'Content-Type':type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  } catch {return json({error:'The source image could not be fetched. Please retry.'},502);}
}
