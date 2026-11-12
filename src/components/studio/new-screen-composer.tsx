'use client';
import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, IconButton, InputBase, Paper, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { ImagePlus, Monitor, Smartphone, Tablet, X } from 'lucide-react';
import type { HtmlDevice } from '@/lib/studio/html-screen';
import { imageFiles, MAX_REFERENCE_IMAGES, ReferenceThumbnails, useReferenceImages } from './reference-images';

const DEVICES: { id: HtmlDevice; label: string; size: string; Icon: typeof Smartphone }[] = [
 { id: 'mobile', label: 'Mobile', size: '375', Icon: Smartphone },
 { id: 'tablet', label: 'Tablet', size: '768', Icon: Tablet },
 { id: 'desktop', label: 'Desktop', size: '1440', Icon: Monitor },
];
const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * New screen: describe it, pick the device, and optionally attach up to four reference
 * images (pick, paste or drop) that the agents design from. Opens above the board dock.
 */
export function NewScreenComposer({ projectId, pickOnOpen, onClose, onQueued }: {
 projectId: string; pickOnOpen: boolean; onClose: () => void; onQueued: (device: HtmlDevice) => void;
}) {
 const [device, setDevice] = useState<HtmlDevice>('mobile');
 const [text, setText] = useState('');
 const [dragging, setDragging] = useState(false);
 const [sending, setSending] = useState(false);
 const [error, setError] = useState('');
 const references = useReferenceImages(projectId);
 const fileInput = useRef<HTMLInputElement>(null), input = useRef<HTMLTextAreaElement>(null);
 useEffect(() => { if (pickOnOpen) fileInput.current?.click(); else input.current?.focus(); }, [pickOnOpen]);
 useEffect(() => {
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !sending) { event.stopPropagation(); onClose(); } };
  window.addEventListener('keydown', onKey, true);
  return () => window.removeEventListener('keydown', onKey, true);
 }, [onClose, sending]);
 const ready = !!text.trim() && !references.uploading && !sending;
 const submit = async () => {
  if (!ready) return;
  setSending(true); setError('');
  try {
   const message = text.trim();
   const response = await fetch('/api/studio/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, versionId: null, anchor: 'page', mentionedRole: null, text: message, displayMessage: message, device, ...(references.ids.length ? { references: references.ids } : {}), requestId: crypto.randomUUID() }) });
   const data = await response.json().catch(() => ({}));
   if (!response.ok) throw new Error(data.error || 'Could not start the new screen.');
   references.clear(); setText(''); onQueued(device);
  } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start the new screen.'); }
  finally { setSending(false); }
 };
 return <Paper role="dialog" aria-label="New screen" elevation={0}
  onDragOver={event => { if ([...event.dataTransfer.types].includes('Files')) { event.preventDefault(); setDragging(true); } }}
  onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
  onDrop={event => { event.preventDefault(); setDragging(false); references.add(imageFiles(event.dataTransfer)); }}
  sx={{ position: 'absolute', bottom: 76, left: '50%', transform: 'translateX(-50%)', zIndex: 6, width: 'min(560px, calc(100% - 32px))', bgcolor: '#fff', borderRadius: '14px',
   border: '1px solid', borderColor: dragging ? '#4c8b6b' : '#e2e7e5', boxShadow: dragging ? '0 0 0 4px rgba(76,139,107,.15), 0 16px 40px rgba(16,24,40,.14)' : '0 16px 40px rgba(16,24,40,.14), 0 2px 6px rgba(16,24,40,.06)',
   transition: 'border-color .15s ease, box-shadow .15s ease', animation: 'composer-in .16s ease-out', '@keyframes composer-in': { from: { opacity: 0, transform: 'translate(-50%, 6px)' }, to: { opacity: 1, transform: 'translate(-50%, 0)' } } }}>
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, pt: 1.75, pb: 1 }}>
   <Typography sx={{ fontSize: 14, fontWeight: 650, color: '#1f2a33', flex: 1 }}>New screen</Typography>
   <ToggleButtonGroup exclusive size="small" value={device} onChange={(_, value) => value && setDevice(value)} aria-label="Device"
    sx={{ bgcolor: '#f3f5f4', p: .375, borderRadius: '9px', gap: .25, '& .MuiToggleButton-root': { border: 0, borderRadius: '7px !important', textTransform: 'none', fontSize: 12.5, fontWeight: 550, color: '#5b6770', px: 1.1, py: .45, gap: .6 }, '& .Mui-selected': { bgcolor: '#fff !important', color: '#1f2a33 !important', boxShadow: '0 1px 2px rgba(16,24,40,.12)' } }}>
    {DEVICES.map(({ id, label, size, Icon }) => <ToggleButton key={id} value={id} aria-label={`${label} · ${size}px`}><Icon size={14}/>{label}</ToggleButton>)}
   </ToggleButtonGroup>
   <IconButton size="small" aria-label="Close new screen" onClick={onClose} sx={{ color: '#7b8790' }}><X size={16}/></IconButton>
  </Box>
  <Box sx={{ px: 2 }}>
   <InputBase inputRef={input} multiline minRows={3} maxRows={10} fullWidth value={text} onChange={event => setText(event.target.value.slice(0, 2000))}
    onPaste={event => { const files = imageFiles(event.clipboardData); if (files.length) { event.preventDefault(); references.add(files); } }}
    onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void submit(); } }}
    placeholder={`Describe the ${device} screen. For example: "A checkout with saved cards, order summary and a promo code field."`}
    slotProps={{ input: { 'aria-label': 'Describe the screen' } }} sx={{ fontSize: 14, lineHeight: 1.55, color: '#1f2a33', '& textarea::placeholder': { color: '#8a949b', opacity: 1 } }}/>
   {references.images.length > 0 && <Box sx={{ pt: 1.25 }}><ReferenceThumbnails images={references.images} onRemove={references.remove}/></Box>}
   {error && <Alert severity="error" sx={{ mt: 1.25, py: 0 }}>{error}</Alert>}
  </Box>
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 1.25, mt: 1, borderTop: '1px solid #eef1f0' }}>
   <input ref={fileInput} type="file" hidden multiple accept="image/png,image/jpeg,image/webp" aria-label="Reference image files" onChange={event => { references.add(event.target.files || []); event.target.value = ''; input.current?.focus(); }}/>
   <Tooltip arrow title={references.full ? `Up to ${MAX_REFERENCE_IMAGES} images` : 'Screenshots, mood boards or brand material the agents design from'}>
    <span><Button size="small" startIcon={<ImagePlus size={15}/>} disabled={references.full} onClick={() => fileInput.current?.click()}
     sx={{ textTransform: 'none', color: '#3f4b55', fontSize: 12.5, fontWeight: 550, borderRadius: '8px', px: 1.1, '&:hover': { bgcolor: '#f1f4f3' } }}>Add reference</Button></span>
   </Tooltip>
   <Typography sx={{ fontSize: 12, color: '#8a949b', display: { xs: 'none', sm: 'block' }, flex: 1 }}>or paste and drop images</Typography>
   <Button variant="contained" disableElevation disabled={!ready} onClick={() => void submit()}
    sx={{ ml: 'auto', textTransform: 'none', fontSize: 13, fontWeight: 600, borderRadius: '9px', px: 1.75, py: .7, bgcolor: '#24533e', '&:hover': { bgcolor: '#1c4332' } }}>
    {sending ? 'Starting…' : references.uploading ? 'Uploading…' : 'Generate'}
    <Box component="span" sx={{ ml: 1, fontSize: 11.5, opacity: .7, fontWeight: 500 }}>{isMac() ? '⌘↵' : 'Ctrl ↵'}</Box>
   </Button>
  </Box>
 </Paper>;
}
