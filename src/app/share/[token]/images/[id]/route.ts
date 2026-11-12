import { loadSharedBoard, sharedImage } from '@/lib/studio/share-links';
import { adminClient } from '@/lib/studio/supabase';

export const runtime = 'nodejs';

/** Images of a shared board, served only while the link is active and only if a shared screen uses them. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
 const { token, id } = await params;
 const admin = adminClient();
 const board = await loadSharedBoard(admin, token);
 const image = board ? await sharedImage(admin, board, id) : null;
 if (!image) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
 return new Response(image, { headers: { 'Content-Type': image.type, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Cross-Origin-Resource-Policy': 'same-origin', 'Referrer-Policy': 'no-referrer' } });
}
