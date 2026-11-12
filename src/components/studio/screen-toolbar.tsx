'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type React from 'react';
import { Box, Button, Dialog, DialogContent, Divider, IconButton, MenuItem, MenuList, Paper, Popper, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { ChevronDown, Code2, Copy, Download, Eye, MoreHorizontal, Pencil, Share2, Sparkles, X } from 'lucide-react';
import type { HtmlScreenDocument } from '@/lib/studio/html-screen';

type Action = { label: string; shortcut?: string; disabled?: boolean; onSelect: () => void };
const PREVIEW_DEVICES = [{ id: 'mobile', label: 'Mobile', width: 375 }, { id: 'tablet', label: 'Tablet', width: 768 }, { id: 'desktop', label: 'Desktop', width: 1440 }];

/** A toolbar menu that opens on hover (like UX Pilot) and on click or keyboard. */
function HoverMenu({ label, icon, actions }: { label: string; icon: ReactNode; actions: Action[] }) {
 const anchor = useRef<HTMLButtonElement>(null);
 const [open, setOpen] = useState(false);
 const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
 const show = () => { clearTimeout(timer.current); setOpen(true); };
 const hide = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 160); };
 useEffect(() => () => clearTimeout(timer.current), []);
 return <Box onMouseEnter={show} onMouseLeave={hide}>
  <Button ref={anchor} size="small" startIcon={icon} endIcon={<ChevronDown size={14}/>} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}
   sx={{ textTransform: 'none', color: '#1f2a33', fontWeight: 600, px: 1.25, '&:hover': { bgcolor: '#eef2ef' } }}>{label}</Button>
  <Popper open={open} anchorEl={anchor.current} placement="bottom-start" sx={{ zIndex: 1250 }}>
   <Paper elevation={6} sx={{ mt: .75, minWidth: 236, borderRadius: 2 }} onMouseEnter={show} onMouseLeave={hide}>
    <MenuList aria-label={label} autoFocusItem={false} onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
     {actions.map(action => <MenuItem key={action.label} disabled={action.disabled} onClick={() => { setOpen(false); action.onSelect(); }} sx={{ fontSize: 14, py: 1, display: 'flex', justifyContent: 'space-between', gap: 3 }}>
      {action.label}{action.shortcut && <Typography component="span" sx={{ fontSize: 12, color: '#7b8790' }}>{action.shortcut}</Typography>}
     </MenuItem>)}
    </MenuList>
   </Paper>
  </Popper>
 </Box>;
}

/**
 * Where to float the toolbar: centred above the element matching `selector` inside the
 * container, kept inside the container when the screen's top is scrolled out of view.
 * Re-measured every frame (cheap) and only re-rendered when the position changes.
 */
export function useFloatingAnchor(container: React.RefObject<HTMLElement | null>, selector: string, enabled: boolean) {
 const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
 useEffect(() => {
  if (!enabled) { setPosition(null); return; }
  let frame = 0;
  const measure = () => {
   const host = container.current, target = host?.querySelector(selector);
   if (host && target) {
    const outer = host.getBoundingClientRect(), inner = target.getBoundingClientRect();
    const left = Math.round(Math.min(Math.max(inner.left + inner.width / 2 - outer.left, 280), outer.width - 280)), top = Math.round(Math.max(inner.top - outer.top - 10, 64));
    setPosition(current => current && current.left === left && current.top === top ? current : { left, top });
   } else setPosition(current => current ? null : current);
   frame = requestAnimationFrame(measure);
  };
  frame = requestAnimationFrame(measure);
  return () => cancelAnimationFrame(frame);
 }, [container, selector, enabled]);
 return position;
}

const iconButton = (label: string, icon: ReactNode, onClick: () => void, disabled = false) => <Tooltip title={label}><span><IconButton aria-label={label} disabled={disabled} onClick={onClick} sx={{ color: '#1f2a33', borderRadius: 1.5 }}>{icon}</IconButton></span></Tooltip>;

/**
 * The floating toolbar above a screen on the board: prompt edits (global, section, add),
 * Manual Edit, copy/export, preview, code and version history. Menus open on hover.
 */
export function ScreenToolbar({ projectId, document: screen, busy, onGlobalEdit, onSectionEdit, onAddSection, onManualEdit, onHistory, onDeviceVersion, onVariations, onRegenerate, onDuplicate, onShare, onRemove, onNotice }: {
 projectId: string; document: HtmlScreenDocument; busy: boolean;
 onGlobalEdit: () => void; onSectionEdit: () => void; onAddSection: () => void; onManualEdit: () => void; onHistory: () => void;
 onDeviceVersion: (device: 'mobile' | 'tablet' | 'desktop') => void; onVariations: () => void; onRegenerate: () => void; onDuplicate: () => void; onShare: () => void; onRemove: () => void; onNotice: (message: string, error?: boolean) => void;
}) {
 const [preview, setPreview] = useState<{ html: string; device: string } | null>(null);
 const [code, setCode] = useState<{ html: string; filename: string } | null>(null);

 const compose = async (exportOnly: boolean) => {
  const response = await fetch('/api/studio/screen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, document: screen, export: exportOnly }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The screen could not be exported.');
  return data as { html: string; filename?: string };
 };
 const run = (task: () => Promise<void>) => () => { void task().catch(error => onNotice(error instanceof Error ? error.message : 'Something went wrong.', true)); };
 const copyHtml = run(async () => { const { html } = await compose(true); await navigator.clipboard.writeText(html); onNotice('HTML copied to the clipboard.'); });
 const download = (html: string, filename: string) => {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const link = Object.assign(window.document.createElement('a'), { href: url, download: filename });
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
 };
 const downloadHtml = run(async () => { const { html, filename } = await compose(true); download(html, filename || 'screen.html'); onNotice(`Downloaded ${filename || 'screen.html'}.`); });
 const openPreview = run(async () => { const { html } = await compose(true); setPreview({ html, device: screen.device }); });
 const openCode = run(async () => { const { html, filename } = await compose(true); setCode({ html, filename: filename || 'screen.html' }); });

 // ⌥ shortcuts, matching the menu labels. event.code keeps them working on macOS, where ⌥ changes the typed character.
 const handlers = useRef({ onGlobalEdit, onSectionEdit, onAddSection, onManualEdit, onVariations, onDuplicate, onShare, copyHtml });
 handlers.current = { onGlobalEdit, onSectionEdit, onAddSection, onManualEdit, onVariations, onDuplicate, onShare, copyHtml };
 useEffect(() => {
  const onKey = (event: KeyboardEvent) => {
   const target = event.target as HTMLElement | null;
   if (!event.altKey || event.metaKey || event.ctrlKey || busy || (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable))) return;
   const action = event.shiftKey ? { KeyH: handlers.current.copyHtml }[event.code] : { KeyG: handlers.current.onGlobalEdit, KeyS: handlers.current.onSectionEdit, KeyM: handlers.current.onManualEdit, KeyA: handlers.current.onAddSection, KeyO: handlers.current.onVariations, KeyD: handlers.current.onDuplicate, KeyL: handlers.current.onShare }[event.code];
   if (action) { event.preventDefault(); action(); }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
 }, [busy]);

 const width = PREVIEW_DEVICES.find(device => device.id === preview?.device)?.width || 375;
 return <>
  <Paper elevation={3} role="toolbar" aria-label={`${screen.name} toolbar`} sx={{ display: 'flex', alignItems: 'center', gap: .25, px: .75, py: .5, borderRadius: 2.5, border: '1px solid #dfe5e1' }}>
   <HoverMenu label="Generate" icon={<Sparkles size={15}/>} actions={[{ label: 'Variations', shortcut: '⌥O', disabled: busy, onSelect: onVariations }, { label: 'Regenerate', disabled: busy, onSelect: onRegenerate }, ...(['desktop', 'tablet', 'mobile'] as const).filter(device => device !== screen.device).map(device => (
    { label: `${device[0].toUpperCase()}${device.slice(1)} version`, shortcut: device === 'mobile' ? '⌥N' : undefined, disabled: busy, onSelect: () => onDeviceVersion(device) }))]}/>
   <HoverMenu label="Edit" icon={<Pencil size={15}/>} actions={[
    { label: 'Global Edit', shortcut: '⌥G', disabled: busy, onSelect: onGlobalEdit },
    { label: 'Section Edit', shortcut: '⌥S', disabled: busy, onSelect: onSectionEdit },
    { label: 'Manual Edit', shortcut: '⌥M', disabled: busy, onSelect: onManualEdit },
    { label: 'Add New Section', shortcut: '⌥A', disabled: busy, onSelect: onAddSection },
   ]}/>
   <HoverMenu label="Copy/Export" icon={<Share2 size={15}/>} actions={[
    { label: 'Copy as HTML', shortcut: '⌥⇧H', onSelect: copyHtml },
    { label: 'Download HTML', onSelect: downloadHtml },
   ]}/>
   <Divider orientation="vertical" flexItem sx={{ mx: .5 }}/>
   {iconButton('Preview', <Eye size={18}/>, openPreview)}
   {iconButton('Code', <Code2 size={18}/>, openCode)}
   <HoverMenu label="More" icon={<MoreHorizontal size={16}/>} actions={[{ label: 'Version history', onSelect: onHistory }, { label: 'Duplicate', shortcut: '⌥D', disabled: busy, onSelect: onDuplicate }, { label: 'Share', shortcut: '⌥L', onSelect: onShare }, { label: 'Remove screen', disabled: busy, onSelect: onRemove }]}/>
  </Paper>

  <Dialog fullScreen open={!!preview} onClose={() => setPreview(null)} slotProps={{ paper: { 'aria-label': 'Preview' } }}>
   <Stack direction="row" spacing={1.5} sx={{ px: 2, py: 1.25, alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
    <Typography sx={{ fontWeight: 650 }}>{screen.name}</Typography><Box sx={{ flex: 1 }}/>
    <ToggleButtonGroup exclusive size="small" value={preview?.device} onChange={(_, device) => device && setPreview(current => current && { ...current, device })} aria-label="Preview device">
     {PREVIEW_DEVICES.map(device => <ToggleButton key={device.id} value={device.id} sx={{ textTransform: 'none' }}>{device.label}</ToggleButton>)}
    </ToggleButtonGroup>
    <Box sx={{ flex: 1 }}/>
    <IconButton aria-label="Close preview" onClick={() => setPreview(null)}><X size={18}/></IconButton>
   </Stack>
   <DialogContent sx={{ bgcolor: '#eef1ef', display: 'flex', justifyContent: 'center', p: 3 }}>
    {preview && <iframe title={`${screen.name} preview`} srcDoc={preview.html} sandbox="allow-same-origin" referrerPolicy="no-referrer"
     onLoad={event => event.currentTarget.contentDocument?.addEventListener('click', click => click.preventDefault(), true)}
     style={{ width, maxWidth: '100%', height: '100%', minHeight: 640, border: 0, background: '#fff', boxShadow: '0 14px 44px #1b263320', borderRadius: 6 }}/>}
   </DialogContent>
  </Dialog>

  <Dialog open={!!code} onClose={() => setCode(null)} fullWidth maxWidth="lg" slotProps={{ paper: { 'aria-label': 'Code' } }}>
   <Stack direction="row" spacing={1} sx={{ px: 2, py: 1.25, alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
    <Typography sx={{ fontWeight: 650 }}>{code?.filename}</Typography>
    <Typography sx={{ fontSize: 12.5, color: '#6b7680' }}>Standalone HTML · compiled Tailwind · images embedded</Typography>
    <Box sx={{ flex: 1 }}/>
    <Button size="small" startIcon={<Copy size={15}/>} onClick={() => code && void navigator.clipboard.writeText(code.html).then(() => onNotice('HTML copied to the clipboard.'))}>Copy</Button>
    <Button size="small" startIcon={<Download size={15}/>} onClick={() => code && download(code.html, code.filename)}>Download</Button>
    <IconButton aria-label="Close code" onClick={() => setCode(null)}><X size={18}/></IconButton>
   </Stack>
   <DialogContent sx={{ p: 0 }}>
    <Box component="pre" sx={{ m: 0, p: 2, maxHeight: '70vh', overflow: 'auto', bgcolor: '#1b2229', color: '#dbe4ea', fontSize: 12.5, lineHeight: 1.55, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{code?.html}</Box>
   </DialogContent>
  </Dialog>
 </>;
}

