'use client';
import { useRef, useState } from 'react';
import { CANVAS_WORKSPACE_MARGIN } from '@/lib/studio/canvas';
import { HTML_DEVICE_FRAME, type HtmlScreenDocument } from '@/lib/studio/html-screen';
import type { BoardScreen } from '@/lib/studio/screens';
import type { AgentRole } from '@/lib/studio/agent-roles';
import { HtmlScreenFrame, type ScreenSelection } from './html-screen-frame';

/** A screen being generated: an existing screen's live draft, or a new screen at its future position. */
export type BoardDraft = { screenId: string | null; position: { x: number; y: number } | null; document: HtmlScreenDocument; role: AgentRole };
const GAP = 160;

/**
 * The board: every screen of a project at its position on the infinite workspace,
 * each with a title you drag to move it (double-click to rename). Screens are selected by clicking them; a
 * click inside a selected screen picks an element for section edits.
 */
export function BoardView({ projectId, screens, draft, zoom, selectedScreenId, selection, onSelect, onMove, onRename }: {
 projectId: string; screens: BoardScreen[]; draft: BoardDraft | null; zoom: number;
 selectedScreenId: string | null; selection: ScreenSelection | null;
 onSelect: (screenId: string, selection: ScreenSelection | null) => void;
 onMove: (screenId: string, x: number, y: number) => void;
 onRename: (screenId: string, name: string) => void;
}) {
 const [dragging, setDragging] = useState<{ id: string; x: number; y: number } | null>(null);
 const [renaming, setRenaming] = useState<string | null>(null);
 const start = useRef<{ id: string; pointerX: number; pointerY: number; x: number; y: number; moved: boolean; to?: { x: number; y: number } } | null>(null);
 // A new screen appears where the server will place it: to the right of the board.
 const right = screens.reduce((max, screen) => Math.max(max, screen.x + HTML_DEVICE_FRAME[screen.device].width + GAP), 0);
 const items = [
  ...screens.map(screen => ({ id: screen.id, name: screen.name, x: screen.x, y: screen.y, document: draft?.screenId === screen.id ? draft.document : screen.document, live: draft?.screenId === screen.id })),
  ...(draft && !draft.screenId ? [{ id: 'new-screen', name: draft.document.name, x: draft.position?.x ?? right, y: draft.position?.y ?? 0, document: draft.document, live: true }] : []),
 ];
 return <>{items.map(item => {
  const position = dragging?.id === item.id ? dragging : item;
  const selected = selectedScreenId === item.id;
  return <div key={item.id} data-screen-id={item.id} style={{ position: 'absolute', left: CANVAS_WORKSPACE_MARGIN + position.x, top: CANVAS_WORKSPACE_MARGIN + position.y }}>
   {renaming === item.id
    ? <input aria-label="Screen name" autoFocus defaultValue={item.name} maxLength={80}
      onFocus={event => event.currentTarget.select()} onPointerDown={event => event.stopPropagation()}
      onBlur={event => { const name = event.currentTarget.value.trim(); setRenaming(null); if (name && name !== item.name) onRename(item.id, name); }}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { event.currentTarget.value = item.name; event.currentTarget.blur(); } event.stopPropagation(); }}
      style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 6 / (zoom / 100), font: `${500} ${14 / (zoom / 100)}px/1.2 system-ui, sans-serif`, width: 300 / (zoom / 100), padding: `${2 / (zoom / 100)}px ${4 / (zoom / 100)}px`, border: `${1 / (zoom / 100)}px solid #426a55`, borderRadius: 4 / (zoom / 100), outline: 'none' }}/>
    : <div data-screen-title="true" role="button" tabIndex={0} aria-label={`${item.name}: drag to move`}
    onPointerDown={event => { if (item.id === 'new-screen' || event.button !== 0) return; event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); start.current = { id: item.id, pointerX: event.clientX, pointerY: event.clientY, x: item.x, y: item.y, moved: false }; }}
    onPointerMove={event => { const drag = start.current; if (!drag) return; const dx = (event.clientX - drag.pointerX) / (zoom / 100), dy = (event.clientY - drag.pointerY) / (zoom / 100); if (!drag.moved && Math.hypot(dx, dy) < 3) return; drag.moved = true; drag.to = { x: Math.round(drag.x + dx), y: Math.round(drag.y + dy) }; setDragging({ id: drag.id, ...drag.to }); }}
    onPointerUp={() => { const drag = start.current; start.current = null; setDragging(null); if (!drag) return; if (drag.moved && drag.to) onMove(drag.id, drag.to.x, drag.to.y); else onSelect(drag.id, null); }}
    onPointerCancel={() => { start.current = null; setDragging(null); }}
    onDoubleClick={() => { if (item.id !== 'new-screen' && !item.live) setRenaming(item.id); }}
    style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 10 / (zoom / 100), font: `${500} ${14 / (zoom / 100)}px/1.2 system-ui, sans-serif`, color: selected ? '#2f5f48' : '#55606a', whiteSpace: 'nowrap', cursor: item.id === 'new-screen' ? 'default' : 'grab', userSelect: 'none', maxWidth: 600 }}>
    {item.name}{item.live ? ' · drawing…' : ''}
   </div>}
   <div style={{ outline: selected ? `${2 / (zoom / 100)}px solid #426a55` : 'none', outlineOffset: 3 / (zoom / 100), borderRadius: 4 }}>
    {item.document
     ? <HtmlScreenFrame projectId={projectId} document={item.document} agent={item.live ? draft!.role : undefined}
       selection={selected ? selection : null} onSelect={next => item.id !== 'new-screen' && onSelect(item.id, next)}/>
     : <div style={{ width: 375, height: 812, background: '#fff' }}/>}
   </div>
  </div>;
 })}</>;
}
