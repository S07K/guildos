'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, IconButton, Tooltip } from '@mui/material';
import { AlertCircle, X } from 'lucide-react';

export const MAX_REFERENCE_IMAGES = 4;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
export type ReferenceImage = { key: string; preview: string; id?: string; error?: string };

/**
 * Reference images for a request: each file uploads to the project's private image
 * storage straight away, so sending only passes ids. Previews are local object URLs.
 */
export function useReferenceImages(projectId: string) {
 const [images, setImages] = useState<ReferenceImage[]>([]);
 const live = useRef(images);
 live.current = images;
 useEffect(() => () => live.current.forEach(image => URL.revokeObjectURL(image.preview)), []);
 const add = useCallback((files: Iterable<File>) => {
  const room = MAX_REFERENCE_IMAGES - live.current.length;
  const accepted = [...files].filter(file => ACCEPTED.includes(file.type)).slice(0, Math.max(0, room));
  for (const file of accepted) {
   const key = crypto.randomUUID(), preview = URL.createObjectURL(file);
   setImages(items => [...items, { key, preview }]);
   const form = new FormData();
   form.set('projectId', projectId); form.set('image', file);
   void fetch('/api/studio/assets', { method: 'POST', body: form })
    .then(async response => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Upload failed.'); return data.id as string; })
    .then(id => setImages(items => items.map(item => item.key === key ? { ...item, id } : item)))
    .catch(error => setImages(items => items.map(item => item.key === key ? { ...item, error: error instanceof Error ? error.message : 'Upload failed.' } : item)));
  }
  return accepted.length;
 }, [projectId]);
 const remove = (key: string) => setImages(items => { const gone = items.find(item => item.key === key); if (gone) URL.revokeObjectURL(gone.preview); return items.filter(item => item.key !== key); });
 const clear = () => setImages(items => { items.forEach(item => URL.revokeObjectURL(item.preview)); return []; });
 return {
  images, add, remove, clear,
  ids: images.flatMap(image => image.id ? [image.id] : []),
  uploading: images.some(image => !image.id && !image.error),
  full: images.length >= MAX_REFERENCE_IMAGES,
 };
}

/** Image files from a paste or drop, if any. */
export const imageFiles = (data: DataTransfer | null) => [...(data?.files || [])].filter(file => ACCEPTED.includes(file.type));

/** Thumbnails of attached references, with progress, errors and remove buttons. */
export function ReferenceThumbnails({ images, onRemove, size = 56 }: { images: ReferenceImage[]; onRemove?: (key: string) => void; size?: number }) {
 return <Box role="list" aria-label="Reference images" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
  {images.map((image, index) => <Box role="listitem" key={image.key} aria-label={`Reference ${index + 1}${image.error ? `: ${image.error}` : image.id ? '' : ' (uploading)'}`}
   sx={{ position: 'relative', width: size, height: size, borderRadius: '8px', overflow: 'hidden', border: '1px solid', borderColor: image.error ? '#e5a3a3' : '#e2e7e5', bgcolor: '#f4f6f5', flex: 'none' }}>
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img src={image.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: image.id ? 1 : .55, transition: 'opacity .2s ease' }}/>
   {!image.id && !image.error && <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}><CircularProgress size={18} thickness={5} sx={{ color: '#2f5f48' }}/></Box>}
   {image.error && <Tooltip title={image.error}><Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(255,255,255,.7)', color: '#b42318' }}><AlertCircle size={18}/></Box></Tooltip>}
   {onRemove && <IconButton size="small" aria-label={`Remove reference ${index + 1}`} onClick={() => onRemove(image.key)}
    sx={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, bgcolor: 'rgba(17,24,39,.72)', color: '#fff', '&:hover': { bgcolor: 'rgba(17,24,39,.9)' } }}><X size={11}/></IconButton>}
  </Box>)}
 </Box>;
}
