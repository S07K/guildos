'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentRole } from '@/lib/studio/agent-roles';
import { HTML_DEVICE_FRAME, type HtmlScreenDocument } from '@/lib/studio/html-screen';
import { sectionsInProgress } from '@/lib/studio/agents/section-pipeline';
import { AgentCursor } from './agent-cursor';

const DRAW_MS = 1200;
type Point = { x: number; y: number; message: string; glideMs?: number };
export type Box = { x: number; y: number; width: number; height: number };
/** An element picked on the screen: its section and a CSS path inside that section, for edits. */
/** What the composer needs to show a live thumbnail of the selection: the screen's srcdoc and the element's box in it. */
export type SelectionPreview = { html: string; frameWidth: number; box: Box };
export type ScreenSelection = { sectionId: string; path: string; tag: string; text: string; preview?: SelectionPreview };

/** nth-child path from the section to the element, the same shape section edits address. */
export function pathWithin(section: Element, element: Element) {
 const parts: string[] = [];
 for (let node: Element | null = element; node && node !== section; node = node.parentElement) {
  const index = node.parentElement ? [...node.parentElement.children].indexOf(node) + 1 : 1;
  parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${index})`);
 }
 return parts.join(' > ');
}

/**
 * Applies a newly composed screen to the live document instead of reloading the
 * frame: compiled CSS and changed sections are swapped in place, and sections that
 * just finished are marked to draw in. Returns those section ids, or null when the
 * page shell changed and a full reload is needed.
 */
function patchScreen(doc: Document, html: string): string[] | null {
 const next = new DOMParser().parseFromString(html, 'text/html');
 const shell = (d: Document) => [...d.querySelectorAll('link[rel="stylesheet"], meta[name="guildos:frame"]')].map(node => node.outerHTML).join('');
 const currentMain = doc.querySelector('main'), nextMain = next.querySelector('main');
 const currentStyle = doc.querySelector('head style'), nextStyle = next.querySelector('head style');
 if (!currentMain || !nextMain || !currentStyle || !nextStyle || shell(doc) !== shell(next)) return null;
 const ids = (main: Element) => [...main.querySelectorAll(':scope > [data-section-id]')].map(node => node.getAttribute('data-section-id'));
 if (ids(currentMain).join() !== ids(nextMain).join()) return null;
 if (currentStyle.textContent !== nextStyle.textContent) currentStyle.textContent = nextStyle.textContent;
 const drawn: string[] = [];
 for (const incoming of nextMain.querySelectorAll(':scope > [data-section-id]')) {
  const id = incoming.getAttribute('data-section-id')!;
  const existing = currentMain.querySelector(`:scope > [data-section-id="${CSS.escape(id)}"]`);
  if (!existing || existing.outerHTML === incoming.outerHTML) continue;
  const replacement = doc.importNode(incoming, true) as Element;
  if (existing.getAttribute('data-section-status') !== 'ready' && incoming.getAttribute('data-section-status') === 'ready') { replacement.setAttribute('data-guildos-drawing', ''); drawn.push(id); }
  existing.replaceWith(replacement);
 }
 return drawn;
}

/**
 * Shows an HTML screen at device width. The srcdoc is composed on the server
 * (Tailwind compiled, markup sanitised); the iframe never gets allow-scripts,
 * so generated markup cannot run code. While an agent works, its cursor moves
 * over the sections being built and follows each one as it draws in.
 */
export function HtmlScreenFrame({ projectId, document, agent, selection = null, onSelect }: { projectId: string; document: HtmlScreenDocument; agent?: AgentRole; selection?: ScreenSelection | null; onSelect?: (selection: ScreenSelection | null) => void }) {
 const frame = useRef<HTMLIFrameElement>(null);
 const { width, height: minHeight } = HTML_DEVICE_FRAME[document.device];
 const [srcDoc, setSrcDoc] = useState('');
 const [error, setError] = useState('');
 const [height, setHeight] = useState(minHeight);
 const [loaded, setLoaded] = useState<Document | null>(null);
 const [drawing, setDrawing] = useState<string[]>([]);
 const [cursor, setCursor] = useState<Point | null>(null);
 const key = JSON.stringify(document);

 useEffect(() => {
  const controller = new AbortController();
  (async () => {
   try {
    const response = await fetch('/api/studio/screen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, document }), signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The screen could not be rendered.');
    setError('');
    const live = frame.current?.contentDocument;
    const drawn = live?.querySelector('main') ? patchScreen(live, data.html) : null;
    if (drawn) { if (drawn.length) setDrawing(drawn); } else setSrcDoc(data.html);
   } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'The screen could not be rendered.'); }
  })();
  return () => controller.abort();
  // The serialized document is the dependency; the object identity changes on every poll.
 }, [projectId, key]);

 useEffect(() => {
  const doc = loaded;
  if (!doc?.body) return;
  const measure = () => { const next = Math.max(minHeight, Math.ceil(doc.documentElement.scrollHeight)); setHeight(next); };
  measure();
  const observer = new ResizeObserver(measure);
  observer.observe(doc.body);
  doc.fonts?.ready.then(measure).catch(() => {});
  return () => observer.disconnect();
 }, [loaded, minHeight]);

 // Iframe coordinates equal frame coordinates: the frame is as tall as its content, so it never scrolls.
 const box = useCallback((id: string) => loaded?.querySelector(`[data-section-id="${CSS.escape(id)}"]`)?.getBoundingClientRect() ?? null, [loaded]);
 const building = agent ? sectionsInProgress(document).map(section => section.id) : [];
 const buildingKey = building.join();

 // A section that just finished draws in top to bottom; the cursor rides the drawing edge.
 useEffect(() => {
  if (!agent || !drawing.length) return;
  const id = drawing[0], rect = box(id);
  if (!rect) { setDrawing([]); return; }
  const x = Math.min(rect.left + rect.width * 0.72, width - 40);
  setCursor({ x, y: rect.top + 8, message: `Drawing ${id}` });
  const down = setTimeout(() => setCursor({ x, y: rect.bottom - 8, message: `Drawing ${id}`, glideMs: DRAW_MS }), 60);
  const done = setTimeout(() => setDrawing(rest => rest.slice(1)), DRAW_MS + 200);
  return () => { clearTimeout(down); clearTimeout(done); };
 }, [agent, drawing, box, width]);

 // Otherwise it works over the sections still being built, moving between them.
 useEffect(() => {
  if (!agent || drawing.length) return;
  const ids = buildingKey ? buildingKey.split(',') : [];
  if (!ids.length) { setCursor(null); return; }
  let step = 0;
  const visit = () => {
   const id = ids[step % ids.length], rect = box(id);
   if (rect) setCursor({ x: rect.left + rect.width * (0.25 + 0.5 * ((step * 0.37) % 1)), y: rect.top + Math.min(rect.height - 12, 28 + (step % 3) * 18), message: `Building ${id}` });
   step++;
  };
  visit();
  const timer = setInterval(visit, 2200);
  return () => clearInterval(timer);
 }, [agent, drawing.length, buildingKey, box]);

 // The screen never receives pointer or wheel events: a transparent layer above it does.
 // Canvas zoom and pan keep working over the screen, generated links cannot navigate the
 // frame, and hover/selection are hit-tested inside the screen's document.
 const [hover, setHover] = useState<Box | null>(null);
 const [picked, setPicked] = useState<Box | null>(null);
 const layer = useRef<HTMLDivElement>(null);
 const hit = useCallback((clientX: number, clientY: number) => {
  const rect = layer.current?.getBoundingClientRect();
  if (!rect || !loaded) return null;
  const scale = rect.width / width;
  const element = loaded.elementFromPoint((clientX - rect.left) / scale, (clientY - rect.top) / scale);
  const section = element?.closest('[data-section-id]');
  return element && section && element !== loaded.body ? { element, section } : null;
 }, [loaded, width]);
 const toBox = (element: Element): Box => { const r = element.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; };
 useEffect(() => {
  if (!loaded || !selection) { setPicked(null); return; }
  const section = loaded.querySelector(`[data-section-id="${CSS.escape(selection.sectionId)}"]`);
  let element: Element | null = section;
  try { if (section && selection.path) element = section.querySelector(`:scope > ${selection.path}`); } catch { element = section; }
  setPicked(element ? toBox(element) : null);
 }, [loaded, selection, srcDoc, height]);

 if (error && !srcDoc) return <p role="alert" style={{ width, margin: 0, padding: 16, font: '13px/1.5 system-ui, sans-serif', color: '#9b2c2c' }}>{error}</p>;
 return <div data-screen-frame="true" style={{ position: 'relative', width, height }}>
  <iframe ref={frame} title={document.name} srcDoc={srcDoc} onLoad={() => setLoaded(frame.current?.contentDocument ?? null)} sandbox="allow-same-origin" referrerPolicy="no-referrer"
   style={{ display: 'block', width, height, border: 0, background: '#fff', borderRadius: 4, boxShadow: '0 12px 40px #1b263318', pointerEvents: 'none' }} />
  {onSelect && <div ref={layer} data-screen-layer="true" aria-label={`${document.name}: select an element`} style={{ position: 'absolute', inset: 0, cursor: 'default' }}
   onPointerMove={event => { const target = hit(event.clientX, event.clientY); setHover(target ? toBox(target.element) : null); }}
   onPointerLeave={() => setHover(null)}
   onClick={event => {
    const target = hit(event.clientX, event.clientY);
    if (!target) { onSelect(null); return; }
    const sectionId = target.section.getAttribute('data-section-id')!;
    onSelect({ sectionId, path: target.element === target.section ? '' : pathWithin(target.section, target.element), tag: target.element.tagName.toLowerCase(), text: (target.element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160), preview: { html: `<!DOCTYPE html>${loaded!.documentElement.outerHTML}`, frameWidth: width, box: toBox(target.element) } });
   }}/>}
  {hover && <div data-export-ignore="true" style={{ position: 'absolute', left: hover.x, top: hover.y, width: hover.width, height: hover.height, outline: '1px solid #6f9b7e', pointerEvents: 'none' }}/>}
  {picked && <div data-export-ignore="true" data-screen-selection="true" style={{ position: 'absolute', left: picked.x, top: picked.y, width: picked.width, height: picked.height, outline: '2px solid #426a55', outlineOffset: -1, pointerEvents: 'none' }}/>}
  {agent && cursor && <AgentCursor role={agent} x={cursor.x} y={cursor.y} message={cursor.message} glideMs={cursor.glideMs}/>}
 </div>;
}
