'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Slider, Stack, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, ArrowUpLeft, ChevronDown, ChevronRight, Copy, Minus, Plus, Redo2, Trash2, Undo2, X } from 'lucide-react';
import { HTML_DEVICE_FRAME, IMAGE_PLACEHOLDER, type HtmlScreenDocument, type StyleRecipes } from '@/lib/studio/html-screen';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GuildOSMark } from './brand';
import { pathWithin } from './html-screen-frame';
import { captureBrowserZoom } from './pinch-zoom';

const DEVICES = [{ id: 'mobile', label: 'Mobile', width: 375 }, { id: 'tablet', label: 'Tablet', width: 768 }, { id: 'desktop', label: 'Desktop', width: 1440 }, { id: 'desktop-hd', label: 'Desktop HD', width: 1920 }];
const ZOOMS = [25, 50, 75, 100];
const EDITOR_ATTRIBUTES = ['contenteditable', 'data-guildos-drawing', 'spellcheck'];
type Selection = { sectionId: string; path: string };
type Box4 = { x: number; y: number; width: number; height: number };

const toHex = (color: string) => {
 const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(color);
 if (!match) return color.startsWith('#') ? color : '#000000';
 return '#' + match.slice(1, 4).map(value => Number(value).toString(16).padStart(2, '0')).join('');
};
const px = (value: string) => { const number = parseFloat(value); return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0; };
const ownText = (element: Element) => [...element.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent || '').join(' ').trim().replace(/\s+/g, ' ');
const TAG_NAMES: Record<string, string> = { div: 'Frame', section: 'Section', header: 'Header', footer: 'Footer', nav: 'Navigation', main: 'Main', a: 'Link', button: 'Button', img: 'Image', svg: 'Icon', ul: 'List', ol: 'List', li: 'List item', input: 'Input', textarea: 'Text area', p: 'Text', span: 'Text', h1: 'Heading', h2: 'Heading', h3: 'Heading', h4: 'Heading', label: 'Label', figure: 'Figure', figcaption: 'Caption', aside: 'Aside', article: 'Article', hr: 'Divider' };
const kind = (element: Element) => TAG_NAMES[element.tagName.toLowerCase()] || element.tagName.toLowerCase();
const layerName = (element: Element) => {
 if (element.hasAttribute('data-section-id')) return element.getAttribute('data-section-id')!;
 if (element.tagName === 'IMG') return element.getAttribute('alt') || 'Image';
 const text = ownText(element) || (element.children.length ? '' : (element.textContent || '').trim());
 return text ? text.slice(0, 40) : kind(element);
};

/** Building blocks, styled with the screen's own recipes so inserted elements match the design. */
function blocks(recipes: StyleRecipes | undefined): { id: string; label: string; html: string }[] {
 const r = recipes;
 return [
  { id: 'heading', label: 'Heading', html: `<h2 class="${r?.heading || ''}">New heading</h2>` },
  { id: 'paragraph', label: 'Paragraph', html: `<p class="${r?.body || ''}">Write something useful here.</p>` },
  { id: 'button', label: 'Button', html: `<button type="button" class="${r?.primary_button || ''}">Button</button>` },
  { id: 'image', label: 'Image', html: `<img src="${IMAGE_PLACEHOLDER}" alt="" style="width: 100%; height: 200px; object-fit: cover; border-radius: 16px">` },
  { id: 'card', label: 'Card', html: `<div class="${r?.card || ''}"><h3 class="${r?.heading || ''}">Card title</h3><p class="${r?.muted || ''}">Supporting text for this card.</p></div>` },
  { id: 'container', label: 'Container', html: `<div style="display: flex; flex-direction: column; gap: 8px; padding: 16px"><p class="${r?.body || ''}">Container</p></div>` },
  { id: 'columns', label: '2 Column Grid', html: `<div style="display: flex; gap: 12px"><div style="flex: 1"><p class="${r?.body || ''}">Left column</p></div><div style="flex: 1"><p class="${r?.body || ''}">Right column</p></div></div>` },
  { id: 'list', label: 'List', html: `<ul style="padding-left: 20px; list-style-type: disc" class="${r?.body || ''}"><li>First item</li><li>Second item</li></ul>` },
  { id: 'input', label: 'Input Field', html: `<input type="text" placeholder="Type here" class="${r?.input || ''}">` },
  { id: 'chip', label: 'Chip', html: `<span class="${r?.chip || ''}">Label</span>` },
  { id: 'divider', label: 'Divider', html: `<hr style="border-style: solid; border-width: 1px 0 0 0; border-color: #e5e7eb; margin-top: 12px; margin-bottom: 12px">` },
 ];
}

function Accordion({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
 return <Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
  <Box component="button" type="button" onClick={onToggle} aria-expanded={open} sx={{ all: 'unset', boxSizing: 'border-box', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.4, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, letterSpacing: '.08em', color: '#55606a', '&:hover': { color: '#1f2a33' } }}>
   {title}{open ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}
  </Box>
  {open && <Stack spacing={1.25} sx={{ px: 2, pb: 2 }}>{children}</Stack>}
 </Box>;
}
const Field = ({ label, children }: { label: string; children: ReactNode }) => <Box sx={{ display: 'grid', gridTemplateColumns: '78px minmax(0,1fr)', alignItems: 'center', gap: 1 }}><Typography sx={{ fontSize: 12.5, color: '#5b6770' }}>{label}</Typography>{children}</Box>;

/**
 * Manual Edit: a full-screen editor for one HTML screen, replacing the board while open.
 * Layers on the left, the screen in the middle, Style and Blocks on the right. Edits are
 * applied to the screen's live document (same origin, no scripts) and saved as a new
 * version; the server re-sanitises every section and keeps only safe inline styles.
 */
export function ManualEditor({ projectId, document: screen, saving, onClose, onSave }: { projectId: string; document: HtmlScreenDocument; saving: boolean; onClose: () => void; onSave: (next: HtmlScreenDocument) => Promise<boolean> }) {
 const frame = useRef<HTMLIFrameElement>(null);
 const stage = useRef<HTMLDivElement>(null);
 const layerList = useRef<HTMLDivElement>(null);
 const [srcDoc, setSrcDoc] = useState('');
 const [error, setError] = useState('');
 const [doc, setDoc] = useState<Document | null>(null);
 const [width, setWidth] = useState(HTML_DEVICE_FRAME[screen.device].width);
 const [height, setHeight] = useState(HTML_DEVICE_FRAME[screen.device].height);
 const [zoom, setZoom] = useState<number | 'fit'>('fit');
 const [stageWidth, setStageWidth] = useState(900);
 const [rev, setRev] = useState(0);
 const [history, setHistory] = useState<{ items: string[]; index: number }>({ items: [], index: -1 });
 const [selected, setSelected] = useState<Element | null>(null);
 const [hovered, setHovered] = useState<Element | null>(null);
 const [editingText, setEditingText] = useState<Element | null>(null);
 const [collapsed, setCollapsed] = useState<Set<Element>>(new Set());
 const [tab, setTab] = useState<'blocks' | 'style'>('style');
 const [open, setOpen] = useState<Record<string, boolean>>({ size: true, typography: true, spacing: false, appearance: false, fill: false, colors: false });
 // Unsaved edits are confirmed before closing the editor or leaving through the logo.
 const [confirmClose, setConfirmClose] = useState<null | 'close' | 'studio'>(null);
 const router = useRouter();
 const scale = zoom === 'fit' ? Math.min(1, (stageWidth - 80) / width) : zoom / 100;
 const scaleRef = useRef(scale);
 scaleRef.current = scale;
 const dirty = history.index > 0;
 const main = doc?.querySelector('main') ?? null;
 const bump = () => setRev(value => value + 1);

 // The frame loads the screen once: saving keeps the open document and its undo history.
 const [opened] = useState(screen);
 useEffect(() => {
  const controller = new AbortController();
  (async () => {
   try {
    const response = await fetch('/api/studio/screen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, document: opened }), signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The screen could not be opened for editing.');
    setSrcDoc(data.html);
   } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'The screen could not be opened for editing.'); }
  })();
  return () => controller.abort();
 }, [projectId, opened]);

 useEffect(() => {
  const element = stage.current;
  if (!element) return;
  const observer = new ResizeObserver(() => setStageWidth(element.clientWidth));
  observer.observe(element);
  return () => observer.disconnect();
 }, []);

 // Pinch zooms the screen, never the page, including while text is edited inside the frame.
 useEffect(() => {
  const element = stage.current;
  if (!element) return;
  return captureBrowserZoom((target, x, y) => {
   if (target instanceof Node && target.ownerDocument === doc) return true;
   const bounds = element.getBoundingClientRect();
   return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  }, factor => setZoom(Math.max(10, Math.min(200, Math.round(scaleRef.current * 100 * factor)))), () => doc ? [doc] : []);
 }, [doc]);

 // A fresh document starts a fresh history; links never navigate inside the editor.
 const onLoad = () => {
  const loaded = frame.current?.contentDocument ?? null;
  if (!loaded?.querySelector('main')) return;
  loaded.addEventListener('click', event => event.preventDefault(), true);
  loaded.addEventListener('submit', event => event.preventDefault(), true);
  setDoc(loaded); setSelected(null); setHovered(null); setEditingText(null);
  setHistory({ items: [loaded.querySelector('main')!.innerHTML], index: 0 });
 };

 useEffect(() => {
  if (!doc?.body) return;
  const measure = () => setHeight(Math.max(HTML_DEVICE_FRAME[screen.device].height, Math.ceil(doc.documentElement.scrollHeight)));
  measure();
  const observer = new ResizeObserver(measure);
  observer.observe(doc.body);
  return () => observer.disconnect();
 }, [doc, width, screen.device]);

 const locate = useCallback((element: Element): Selection | null => {
  const section = element.closest('[data-section-id]');
  return section ? { sectionId: section.getAttribute('data-section-id')!, path: element === section ? '' : pathWithin(section, element) } : null;
 }, []);
 const resolve = useCallback((selection: Selection | null) => {
  if (!selection || !doc) return null;
  const section = doc.querySelector(`[data-section-id="${CSS.escape(selection.sectionId)}"]`);
  if (!section || !selection.path) return section;
  try { return section.querySelector(`:scope > ${selection.path}`); } catch { return section; }
 }, [doc]);

 /** Records the current document as an undo step after an edit. */
 const record = useCallback(() => {
  if (!main) return;
  const snapshot = main.innerHTML;
  setHistory(current => current.items[current.index] === snapshot ? current : { items: [...current.items.slice(0, current.index + 1), snapshot].slice(-80), index: Math.min(current.index + 1, 79) });
  bump();
 }, [main]);
 const travel = (step: number) => {
  if (!main) return;
  const index = history.index + step;
  if (index < 0 || index >= history.items.length) return;
  const keep = selected ? locate(selected) : null;
  main.innerHTML = history.items[index];
  setHistory(current => ({ ...current, index }));
  setEditingText(null); setHovered(null); setSelected(resolve(keep)); bump();
 };

 const finishTextEdit = useCallback(() => {
  if (!editingText) return;
  editingText.removeAttribute('contenteditable'); editingText.removeAttribute('spellcheck');
  setEditingText(null); record();
 }, [editingText, record]);

 const hit = (clientX: number, clientY: number) => {
  const rect = stage.current?.querySelector('[data-editor-surface]')?.getBoundingClientRect();
  if (!rect || !doc) return null;
  const element = doc.elementFromPoint((clientX - rect.left) / scale, (clientY - rect.top) / scale);
  return element && element.closest('[data-section-id]') ? element.closest('svg') || element : null;
 };
 const boxOf = (element: Element | null): Box4 | null => {
  if (!element || !element.isConnected) return null;
  const r = element.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
 };

 const startTextEdit = (element: Element) => {
  if (element.tagName === 'IMG' || element.tagName === 'INPUT' || element.closest('svg') || element.children.length > 3) return;
  element.setAttribute('contenteditable', 'true'); element.setAttribute('spellcheck', 'false');
  setEditingText(element); setSelected(element);
  // Focus right away so typing that follows the double-click lands in the element.
  (element as HTMLElement).focus();
  const range = doc!.createRange(); range.selectNodeContents(element);
  const selection = doc!.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
 };

 // Element actions.
 const isSectionRoot = (element: Element | null) => !!element?.hasAttribute('data-section-id');
 const selectParent = () => { const parent = selected?.parentElement; if (parent && parent.closest('[data-section-id]')) setSelected(parent); };
 const move = (direction: -1 | 1) => {
  if (!selected || isSectionRoot(selected)) return;
  const sibling = direction < 0 ? selected.previousElementSibling : selected.nextElementSibling;
  if (!sibling) return;
  if (direction < 0) sibling.before(selected); else sibling.after(selected);
  record();
 };
 const duplicate = () => { if (!selected || isSectionRoot(selected)) return; const copy = selected.cloneNode(true) as Element; selected.after(copy); setSelected(copy); record(); };
 const remove = () => { if (!selected || isSectionRoot(selected)) return; const next = selected.parentElement; selected.remove(); setSelected(next && next.closest('[data-section-id]') ? next : null); record(); };
 const insert = (html: string) => {
  if (!selected || !doc) return;
  const template = doc.createElement('template');
  template.innerHTML = html;
  const node = template.content.firstElementChild;
  if (!node) return;
  if (isSectionRoot(selected)) selected.appendChild(node); else selected.after(node);
  setSelected(node); setTab('style'); record();
 };

 useEffect(() => {
  const onKey = (event: KeyboardEvent) => {
   const meta = event.metaKey || event.ctrlKey;
   if (meta && event.key.toLowerCase() === 'z') { event.preventDefault(); travel(event.shiftKey ? 1 : -1); return; }
   if (editingText) { if (event.key === 'Escape') { event.preventDefault(); finishTextEdit(); } return; }
   const target = event.target as HTMLElement | null;
   if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
   if ((event.key === 'Delete' || event.key === 'Backspace') && selected) { event.preventDefault(); remove(); }
   if (event.key === 'Escape') { if (selected && !isSectionRoot(selected)) selectParent(); else setSelected(null); }
   if (event.key === 'Enter' && selected) { event.preventDefault(); startTextEdit(selected); }
  };
  window.addEventListener('keydown', onKey);
  doc?.addEventListener('keydown', onKey);
  return () => { window.removeEventListener('keydown', onKey); doc?.removeEventListener('keydown', onKey); };
 });

 // Keep the selected layer row visible.
 useEffect(() => { layerList.current?.querySelector('[data-layer-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [selected]);

 const serialize = (): HtmlScreenDocument => {
  const sections = new Map([...(main?.querySelectorAll(':scope > [data-section-id]') || [])].map(section => {
   const clone = section.cloneNode(true) as Element;
   clone.querySelectorAll('*').forEach(node => EDITOR_ATTRIBUTES.forEach(name => node.removeAttribute(name)));
   return [section.getAttribute('data-section-id')!, clone.innerHTML.trim()];
  }));
  return { ...screen, sections: screen.sections.map(section => section.status === 'ready' && sections.has(section.id) ? { ...section, html: sections.get(section.id)! } : section) };
 };
 const save = async () => { finishTextEdit(); if (await onSave(serialize()) && main) setHistory({ items: [main.innerHTML], index: 0 }); };
 const discard = () => { if (!main) return; main.innerHTML = history.items[0]; setHistory(current => ({ items: [current.items[0]], index: 0 })); setSelected(null); setEditingText(null); bump(); };

 // ---- Style panel ----
 const view = doc?.defaultView;
 const computed = selected && view ? view.getComputedStyle(selected) : null;
 const setStyle = (property: string, value: string, commit = false) => {
  if (!selected) return;
  const element = selected as HTMLElement;
  if (value === '') element.style.removeProperty(property); else element.style.setProperty(property, value);
  bump(); if (commit) record();
 };
 const sizeMode = (axis: 'width' | 'height') => { const inline = (selected as HTMLElement | null)?.style[axis]; return inline === '100%' ? 'fill' : inline === 'fit-content' || inline === 'auto' ? 'hug' : 'fixed'; };
 const selectionColors = useMemo(() => {
  if (!selected || !view) return [] as string[];
  const colors = new Set<string>();
  for (const element of [selected, ...selected.querySelectorAll('*')].slice(0, 400)) {
   const style = view.getComputedStyle(element);
   for (const value of [style.color, style.backgroundColor]) if (value && !/rgba\(0, 0, 0, 0\)|transparent/.test(value)) colors.add(toHex(value));
  }
  return [...colors].slice(0, 12);
  // rev re-reads colours after every edit.
 }, [selected, view, rev]);
 const replaceColor = (from: string, to: string) => {
  if (!selected || !view) return;
  for (const element of [selected, ...selected.querySelectorAll('*')] as HTMLElement[]) {
   const style = view.getComputedStyle(element);
   if (toHex(style.color) === from) element.style.setProperty('color', to);
   if (toHex(style.backgroundColor) === from) element.style.setProperty('background-color', to);
  }
  bump();
 };
 const fonts = [screen.tokens.fontDisplay, screen.tokens.fontSans, 'system-ui'].filter((font): font is string => !!font);

 // ---- Layers ----
 const layers = useMemo(() => {
  if (!main) return [] as { element: Element; depth: number; hasChildren: boolean }[];
  const rows: { element: Element; depth: number; hasChildren: boolean }[] = [];
  const walk = (element: Element, depth: number) => {
   if (rows.length > 1500) return;
   const children = element.closest('svg') ? [] : [...element.children].filter(child => !['SCRIPT', 'STYLE'].includes(child.tagName));
   rows.push({ element, depth, hasChildren: children.length > 0 });
   if (!collapsed.has(element)) children.forEach(child => walk(child, depth + 1));
  };
  main.querySelectorAll(':scope > [data-section-id]').forEach(section => walk(section, 0));
  return rows;
  // rev rebuilds the tree after edits.
 }, [main, collapsed, rev]);

 const selectedBox = boxOf(selected), hoverBox = hovered !== selected ? boxOf(hovered) : null;
 const iconButton = (label: string, icon: ReactNode, action: () => void, disabled = false) => <Tooltip title={label}><span><IconButton size="small" aria-label={label} disabled={disabled} onClick={action}>{icon}</IconButton></span></Tooltip>;
 const numberField = (label: string, property: string, value: number, unit = 'px') => <Field label={label}><TextField size="small" type="number" value={value} slotProps={{ htmlInput: { 'aria-label': label, step: unit === '' ? 0.1 : 1 } }} onChange={event => setStyle(property, event.target.value === '' ? '' : `${event.target.value}${unit}`)} onBlur={record}/></Field>;
 const colorField = (label: string, property: string, value: string) => <Field label={label}><Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><input type="color" aria-label={label} value={toHex(value)} onChange={event => setStyle(property, event.target.value)} onBlur={record} style={{ width: 30, height: 30, border: '1px solid #d8e0e5', borderRadius: 6, padding: 0, background: 'none' }}/><Typography sx={{ fontSize: 12.5, fontFamily: 'ui-monospace, monospace' }}>{toHex(value).toUpperCase()}</Typography></Stack></Field>;

 return <Box role="dialog" aria-label="Manual edit" sx={{ position: 'fixed', inset: 0, zIndex: 1300, bgcolor: '#f4f6f5', display: 'grid', gridTemplateRows: '58px minmax(0,1fr)' }}>
  <Stack direction="row" spacing={1} sx={{ px: 2, alignItems: 'center', bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
   <Link href="/studio" className="editor-logo" aria-label="Back to dashboard" onClick={event => { if (dirty) { event.preventDefault(); setConfirmClose('studio'); } }}><GuildOSMark/></Link>
   <Box sx={{ width: '1px', height: 26, bgcolor: 'divider', mx: .5 }}/>
   <Button size="small" variant="outlined" startIcon={<X size={16}/>} onClick={() => dirty ? setConfirmClose('close') : onClose()}>Close</Button>
   {iconButton('Undo', <Undo2 size={17}/>, () => travel(-1), history.index <= 0)}
   {iconButton('Redo', <Redo2 size={17}/>, () => travel(1), history.index >= history.items.length - 1)}
   <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600, color: '#34424d', ml: 1 }}>{screen.name}</Typography>
   <Box sx={{ flex: 1 }}/>
   {iconButton('Zoom out', <Minus size={16}/>, () => setZoom(Math.max(10, Math.round(scale * 100) - 10)))}
   <TextField select size="small" value={zoom} onChange={event => setZoom(event.target.value === 'fit' ? 'fit' : Number(event.target.value))} slotProps={{ htmlInput: { 'aria-label': 'Zoom' } }} sx={{ width: 128 }}>
    <MenuItem value="fit">Fit · {Math.round(scale * 100)}%</MenuItem>
    {ZOOMS.map(value => <MenuItem key={value} value={value}>{value}%</MenuItem>)}
    {zoom !== 'fit' && !ZOOMS.includes(zoom) && <MenuItem value={zoom}>{zoom}%</MenuItem>}
   </TextField>
   {iconButton('Zoom in', <Plus size={16}/>, () => setZoom(Math.min(200, Math.round(scale * 100) + 10)))}
   <TextField select size="small" value={DEVICES.find(device => device.width === width)?.id || 'custom'} onChange={event => { const device = DEVICES.find(item => item.id === event.target.value); if (device) setWidth(device.width); }} slotProps={{ htmlInput: { 'aria-label': 'Device' } }} sx={{ width: 140 }}>
    {DEVICES.map(device => <MenuItem key={device.id} value={device.id}>{device.label}</MenuItem>)}
    {!DEVICES.some(device => device.width === width) && <MenuItem value="custom">Custom</MenuItem>}
   </TextField>
   <TextField size="small" type="number" value={width} onChange={event => setWidth(Math.max(240, Math.min(2560, Number(event.target.value) || 0)))} slotProps={{ htmlInput: { 'aria-label': 'Width' }, input: { endAdornment: <Typography sx={{ fontSize: 12, color: '#7b8790' }}>W</Typography> } }} sx={{ width: 104 }}/>
   <TextField size="small" value={height} slotProps={{ htmlInput: { 'aria-label': 'Height', readOnly: true }, input: { endAdornment: <Typography sx={{ fontSize: 12, color: '#7b8790' }}>H</Typography> } }} sx={{ width: 96 }}/>
   <Box sx={{ flex: 1 }}/>
   <Button size="small" variant="outlined" disabled={!dirty || saving} onClick={discard}>Discard</Button>
   <Button size="small" variant="contained" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save Changes'}</Button>
  </Stack>

  <Box sx={{ display: 'grid', gridTemplateColumns: '264px minmax(0,1fr) 300px', minHeight: 0 }}>
   <Box component="nav" aria-label="Layers" sx={{ bgcolor: 'background.paper', borderRight: '1px solid', borderColor: 'divider', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
    <Typography sx={{ px: 2, py: 1.5, fontSize: 13.5, fontWeight: 650, borderBottom: '1px solid', borderColor: 'divider' }}>Layers</Typography>
    <Box ref={layerList} role="tree" sx={{ overflowY: 'auto', py: .5, flex: 1 }}>
     {layers.map(({ element, depth, hasChildren }, index) => <Box key={index} role="treeitem" aria-selected={element === selected} aria-expanded={hasChildren ? !collapsed.has(element) : undefined} data-layer-selected={element === selected}
      onClick={() => { setSelected(element); setTab('style'); }} onMouseEnter={() => setHovered(element)} onMouseLeave={() => setHovered(null)}
      sx={{ display: 'flex', alignItems: 'center', gap: .5, pl: 1 + depth * 1.4, pr: 1, height: 28, cursor: 'pointer', fontSize: 12.5, color: element.hasAttribute('data-section-id') ? '#1f2a33' : '#43505a', fontWeight: element.hasAttribute('data-section-id') ? 650 : 400, bgcolor: element === selected ? '#e7efe9' : 'transparent', '&:hover': { bgcolor: element === selected ? '#e7efe9' : '#f2f5f3' } }}>
      {hasChildren ? <Box component="span" role="button" aria-label={collapsed.has(element) ? 'Expand layer' : 'Collapse layer'} onClick={event => { event.stopPropagation(); setCollapsed(current => { const next = new Set(current); if (next.has(element)) next.delete(element); else next.add(element); return next; }); }} sx={{ display: 'inline-flex', color: '#7b8790' }}>{collapsed.has(element) ? <ChevronRight size={13}/> : <ChevronDown size={13}/>}</Box> : <Box component="span" sx={{ width: 13 }}/>}
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{layerName(element)}</Box>
     </Box>)}
    </Box>
   </Box>

   <Box ref={stage} sx={{ overflow: 'auto', minWidth: 0, position: 'relative' }}>
    {error && <Typography role="alert" sx={{ p: 3, color: 'error.main' }}>{error}</Typography>}
    <Box sx={{ width: width * scale, height: height * scale, mx: 'auto', my: 5, position: 'relative' }}>
     <Box data-editor-surface sx={{ width, height, transform: `scale(${scale})`, transformOrigin: '0 0', position: 'absolute', left: 0, top: 0, boxShadow: '0 14px 44px #1b263320', bgcolor: '#fff' }}>
      <iframe ref={frame} title={`${screen.name} (editing)`} srcDoc={srcDoc} onLoad={onLoad} sandbox="allow-same-origin" referrerPolicy="no-referrer" style={{ display: 'block', width, height, border: 0, pointerEvents: editingText ? 'auto' : 'none' }}/>
      {!editingText && <Box data-screen-layer="true" sx={{ position: 'absolute', inset: 0, cursor: 'default' }}
       onPointerMove={event => setHovered(hit(event.clientX, event.clientY))} onPointerLeave={() => setHovered(null)}
       onClick={event => { const element = hit(event.clientX, event.clientY); setSelected(element); if (element) setTab('style'); }}
       onDoubleClick={event => { const element = hit(event.clientX, event.clientY); if (element) startTextEdit(element); }}/>}
      {editingText && <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}/>}
      {hoverBox && <Box sx={{ position: 'absolute', left: hoverBox.x, top: hoverBox.y, width: hoverBox.width, height: hoverBox.height, outline: `${1 / scale}px solid #8fbf9f`, pointerEvents: 'none' }}>
       <Box component="span" sx={{ position: 'absolute', left: -1 / scale, top: -18 / scale, fontSize: 10.5 / scale, lineHeight: `${16 / scale}px`, px: .5 / scale, bgcolor: '#1f2a33', color: '#fff', borderRadius: `${3 / scale}px`, whiteSpace: 'nowrap' }}>{kind(hovered!)}</Box>
      </Box>}
      {selectedBox && <Box data-editor-selection sx={{ position: 'absolute', left: selectedBox.x, top: selectedBox.y, width: selectedBox.width, height: selectedBox.height, outline: `${2 / scale}px solid #426a55`, pointerEvents: 'none' }}>
       {!editingText && <Stack direction="row" sx={{ position: 'absolute', right: 0, top: -34 / scale, transform: `scale(${1 / scale})`, transformOrigin: '100% 0', bgcolor: '#1f2a33', borderRadius: 1, pointerEvents: 'auto', '& button': { color: '#fff', p: .6 } }}>
        {iconButton('Select parent', <ArrowUpLeft size={14}/>, selectParent, isSectionRoot(selected))}
        {iconButton('Move up', <ArrowUp size={14}/>, () => move(-1), isSectionRoot(selected) || !selected?.previousElementSibling)}
        {iconButton('Move down', <ArrowDown size={14}/>, () => move(1), isSectionRoot(selected) || !selected?.nextElementSibling)}
        {iconButton('Duplicate', <Copy size={14}/>, duplicate, isSectionRoot(selected))}
        {iconButton('Delete', <Trash2 size={14}/>, remove, isSectionRoot(selected))}
       </Stack>}
      </Box>}
     </Box>
    </Box>
   </Box>

   <Box component="aside" aria-label="Selected element properties" sx={{ bgcolor: 'background.paper', borderLeft: '1px solid', borderColor: 'divider', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
    <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="fullWidth" sx={{ borderBottom: '1px solid', borderColor: 'divider', minHeight: 44, '& .MuiTab-root': { minHeight: 44, textTransform: 'none', fontWeight: 600 } }}>
     <Tab value="blocks" label="Blocks"/><Tab value="style" label="Style"/>
    </Tabs>
    <Box sx={{ overflowY: 'auto', flex: 1 }}>
     {tab === 'blocks' && <Box sx={{ p: 2 }}>
      <Typography sx={{ fontSize: 12.5, color: '#5b6770', mb: 1.5 }}>{selected ? 'Inserts after the selection, or inside a selected section.' : 'Select an element on the screen to choose where blocks go.'}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
       {blocks(screen.art?.recipes).map(block => <Button key={block.id} variant="outlined" disabled={!selected} onClick={() => insert(block.html)} sx={{ height: 64, textTransform: 'none', fontSize: 13, borderColor: '#d8e0e5', color: '#1f2a33' }}>{block.label}</Button>)}
      </Box>
     </Box>}
     {tab === 'style' && (!selected || !computed ? <Typography sx={{ p: 3, textAlign: 'center', color: '#6b7680', fontSize: 14 }}>Select an element to edit its styles. Double-click text to edit it.</Typography> : <>
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}><Typography sx={{ fontSize: 13, fontWeight: 650 }}>{kind(selected)}</Typography><Typography noWrap sx={{ fontSize: 12, color: '#6b7680' }}>{layerName(selected)}</Typography></Box>
      {selected.tagName === 'IMG' && <Accordion title="IMAGE" open onToggle={() => {}}>
       <Field label="Alt text"><TextField size="small" value={selected.getAttribute('alt') || ''} onChange={event => { selected.setAttribute('alt', event.target.value); bump(); }} onBlur={record}/></Field>
       <Field label="Fit"><TextField select size="small" value={computed.objectFit} onChange={event => setStyle('object-fit', event.target.value, true)}>{['cover', 'contain', 'fill'].map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField></Field>
      </Accordion>}
      <Accordion title="SIZE" open={open.size} onToggle={() => setOpen(current => ({ ...current, size: !current.size }))}>
       {(['width', 'height'] as const).map(axis => <Field key={axis} label={axis === 'width' ? 'Width' : 'Height'}><Stack direction="row" spacing={.75}>
        <TextField size="small" type="number" value={Math.round(px(computed[axis]))} disabled={sizeMode(axis) !== 'fixed'} slotProps={{ htmlInput: { 'aria-label': axis } }} onChange={event => setStyle(axis, `${event.target.value}px`)} onBlur={record}/>
        <TextField select size="small" value={sizeMode(axis)} onChange={event => setStyle(axis, event.target.value === 'fill' ? '100%' : event.target.value === 'hug' ? 'fit-content' : `${px(computed[axis])}px`, true)} sx={{ width: 96, flex: 'none' }}>
         <MenuItem value="fixed">Fixed</MenuItem><MenuItem value="fill">Fill</MenuItem><MenuItem value="hug">Hug</MenuItem>
        </TextField>
       </Stack></Field>)}
      </Accordion>
      <Accordion title="TYPOGRAPHY" open={open.typography} onToggle={() => setOpen(current => ({ ...current, typography: !current.typography }))}>
       <Field label="Align"><ToggleButtonGroup exclusive size="small" value={computed.textAlign === 'start' ? 'left' : computed.textAlign} onChange={(_, value) => value && setStyle('text-align', value, true)}>
        <ToggleButton value="left" aria-label="Align left"><AlignLeft size={15}/></ToggleButton><ToggleButton value="center" aria-label="Align center"><AlignCenter size={15}/></ToggleButton><ToggleButton value="right" aria-label="Align right"><AlignRight size={15}/></ToggleButton>
       </ToggleButtonGroup></Field>
       <Field label="Font"><TextField select size="small" value={fonts.find(font => computed.fontFamily.includes(font)) || ''} onChange={event => setStyle('font-family', `"${event.target.value}", system-ui, sans-serif`, true)} slotProps={{ select: { displayEmpty: true } }}>
        <MenuItem value="" disabled>Inherited</MenuItem>{fonts.map(font => <MenuItem key={font} value={font}>{font}</MenuItem>)}
       </TextField></Field>
       <Field label="Weight"><TextField select size="small" value={String(Math.round(Number(computed.fontWeight) / 100) * 100)} onChange={event => setStyle('font-weight', event.target.value, true)}>{[300, 400, 500, 600, 700, 800].map(value => <MenuItem key={value} value={String(value)}>{value}</MenuItem>)}</TextField></Field>
       {numberField('Size', 'font-size', px(computed.fontSize))}
       {numberField('Line', 'line-height', computed.lineHeight === 'normal' ? 1.2 : Math.round(px(computed.lineHeight) / px(computed.fontSize) * 100) / 100, '')}
       {numberField('Letter', 'letter-spacing', px(computed.letterSpacing))}
       {colorField('Color', 'color', computed.color)}
      </Accordion>
      <Accordion title="SPACING" open={open.spacing} onToggle={() => setOpen(current => ({ ...current, spacing: !current.spacing }))}>
       {(['padding', 'margin'] as const).map(box => <Box key={box}><Typography sx={{ fontSize: 12.5, color: '#5b6770', mb: .75 }}>{box === 'padding' ? 'Padding' : 'Margin'}</Typography><Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: .75 }}>
        {(['top', 'right', 'bottom', 'left'] as const).map(side => <TextField key={side} size="small" type="number" label={side[0].toUpperCase()} value={px(computed.getPropertyValue(`${box}-${side}`))} onChange={event => setStyle(`${box}-${side}`, `${event.target.value}px`)} onBlur={record} slotProps={{ htmlInput: { 'aria-label': `${box} ${side}` } }}/>)}
       </Box></Box>)}
       {numberField('Gap', 'gap', px(computed.gap))}
      </Accordion>
      <Accordion title="STYLE & APPEARANCE" open={open.appearance} onToggle={() => setOpen(current => ({ ...current, appearance: !current.appearance }))}>
       <Field label="Opacity"><Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}><Slider size="small" min={0} max={100} value={Math.round(Number(computed.opacity) * 100)} onChange={(_, value) => setStyle('opacity', String(Number(value) / 100))} onChangeCommitted={record} aria-label="Opacity"/><Typography sx={{ fontSize: 12.5, width: 38 }}>{Math.round(Number(computed.opacity) * 100)}%</Typography></Stack></Field>
       {numberField('Radius', 'border-radius', px(computed.borderTopLeftRadius))}
       {numberField('Border', 'border-width', px(computed.borderTopWidth))}
       {px(computed.borderTopWidth) > 0 && colorField('Border color', 'border-color', computed.borderTopColor)}
       <Field label="Shadow"><TextField select size="small" value={computed.boxShadow === 'none' ? 'none' : 'custom'} onChange={event => setStyle('box-shadow', { none: 'none', sm: '0 1px 3px rgba(0,0,0,.12)', md: '0 6px 16px rgba(0,0,0,.12)', lg: '0 16px 40px rgba(0,0,0,.16)' }[event.target.value] || '', true)}>
        <MenuItem value="none">None</MenuItem><MenuItem value="sm">Small</MenuItem><MenuItem value="md">Medium</MenuItem><MenuItem value="lg">Large</MenuItem>{computed.boxShadow !== 'none' && <MenuItem value="custom" disabled>Current</MenuItem>}
       </TextField></Field>
      </Accordion>
      <Accordion title="FILL" open={open.fill} onToggle={() => setOpen(current => ({ ...current, fill: !current.fill }))}>
       {colorField('Background', 'background-color', computed.backgroundColor)}
       <Button size="small" variant="text" onClick={() => setStyle('background-color', 'transparent', true)} sx={{ alignSelf: 'flex-start', textTransform: 'none' }}>Remove fill</Button>
      </Accordion>
      <Accordion title="SELECTION COLORS" open={open.colors} onToggle={() => setOpen(current => ({ ...current, colors: !current.colors }))}>
       {selectionColors.map(color => <Stack key={color} direction="row" spacing={1} sx={{ alignItems: 'center' }}><input type="color" aria-label={`Replace ${color}`} value={color} onChange={event => replaceColor(color, event.target.value)} onBlur={record} style={{ width: 30, height: 30, border: '1px solid #d8e0e5', borderRadius: 6, padding: 0, background: 'none' }}/><Typography sx={{ fontSize: 12.5, fontFamily: 'ui-monospace, monospace' }}>{color.toUpperCase()}</Typography></Stack>)}
      </Accordion>
     </>)}
    </Box>
   </Box>
  </Box>

  <Dialog open={!!confirmClose} onClose={() => setConfirmClose(null)} maxWidth="xs" fullWidth>
   <DialogTitle>Discard unsaved edits?</DialogTitle>
   <DialogContent><Typography variant="body2">Save your changes first, or close the editor and lose them.</Typography></DialogContent>
   <DialogActions><Button onClick={() => setConfirmClose(null)}>Keep editing</Button><Button color="error" onClick={() => { const target = confirmClose; setConfirmClose(null); if (target === 'studio') router.push('/studio'); else onClose(); }}>{confirmClose === 'studio' ? 'Discard and leave' : 'Discard and close'}</Button></DialogActions>
  </Dialog>
 </Box>;
}
