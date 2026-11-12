import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Private per-project image storage: `<workspace>/<project>/<id>`, served by /api/studio/assets/<id>. */
export const ASSET_BUCKET = 'studio-assets';
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;
export type AssetType = 'image/png' | 'image/jpeg' | 'image/webp';

export function imageType(bytes: Uint8Array): AssetType | null {
 if (bytes.length >= 8 && bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index])) return 'image/png';
 if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
 if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
 return null;
}

export const assetUrl = (projectId: string, id: string) => `/api/studio/assets/${id}?projectId=${projectId}`;

/** Stores image bytes for a project (service credentials; callers have already checked tenant scope). */
export async function storeProjectImage(admin: SupabaseClient, scope: { workspaceId: string; projectId: string }, bytes: Uint8Array) {
 const type = imageType(bytes);
 if (!type) throw new Error('Use a PNG, JPEG, or WebP image.');
 if (bytes.byteLength > MAX_ASSET_BYTES) throw new Error('Images must be under 5 MB.');
 const storage = admin.storage;
 if ((await storage.getBucket(ASSET_BUCKET)).error) {
  const created = await storage.createBucket(ASSET_BUCKET, { public: false, fileSizeLimit: MAX_ASSET_BYTES, allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'] });
  if (created.error && (await storage.getBucket(ASSET_BUCKET)).error) throw new Error('Private image storage is unavailable.');
 }
 const id = randomUUID(), path = `${scope.workspaceId}/${scope.projectId}/${id}`;
 const uploaded = await storage.from(ASSET_BUCKET).upload(path, bytes, { contentType: type, upsert: false, cacheControl: '3600' });
 if (uploaded.error) throw new Error('The image could not be stored securely.');
 return { id, type, path, size: bytes.byteLength };
}
