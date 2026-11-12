'use client';
import { useEffect, useRef, useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { Trash2 } from 'lucide-react';
import { CANVAS_WORKSPACE_MARGIN } from '@/lib/studio/canvas';
import { NOTE_COLORS, type BoardNote, type NoteColor } from '@/lib/studio/board-notes';

/**
 * A sticky note on the board. Drag it anywhere; double-click (or Enter) to write;
 * when selected, a small bar offers colours and delete. Changes save on drop and blur.
 */
export function BoardNoteCard({ note, zoom, selected, editing, onSelect, onEdit, onChange, onRemove }: {
 note: BoardNote; zoom: number; selected: boolean; editing: boolean;
 onSelect: () => void; onEdit: (editing: boolean) => void;
 onChange: (patch: Partial<Pick<BoardNote, 'body' | 'color' | 'x' | 'y'>>, save: boolean) => void; onRemove: () => void;
}) {
 const scale = zoom / 100, palette = NOTE_COLORS[note.color] ?? NOTE_COLORS.yellow;
 const drag = useRef<{ pointerX: number; pointerY: number; x: number; y: number; moved: boolean } | null>(null);
 const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);
 const text = useRef<HTMLTextAreaElement>(null);
 useEffect(() => { if (editing) { const field = text.current; field?.focus(); field?.setSelectionRange(field.value.length, field.value.length); } }, [editing]);
 const position = offset ?? note;
 return <Box data-board-note={note.id} role="group" aria-label={`Note: ${note.body.slice(0, 40) || 'empty'}`}
  onPointerDown={event => {
   if (editing || event.button !== 0 || (event.target as Element).closest('button')) return;
   event.stopPropagation(); onSelect();
   event.currentTarget.setPointerCapture(event.pointerId);
   drag.current = { pointerX: event.clientX, pointerY: event.clientY, x: note.x, y: note.y, moved: false };
  }}
  onPointerMove={event => {
   const current = drag.current; if (!current) return;
   const dx = (event.clientX - current.pointerX) / scale, dy = (event.clientY - current.pointerY) / scale;
   if (!current.moved && Math.hypot(dx, dy) < 3) return;
   current.moved = true; setOffset({ x: Math.round(current.x + dx), y: Math.round(current.y + dy) });
  }}
  onPointerUp={() => { const current = drag.current; drag.current = null; if (current?.moved && offset) onChange(offset, true); setOffset(null); }}
  onDoubleClick={event => { event.stopPropagation(); onEdit(true); }}
  onKeyDown={event => { if (!editing && event.key === 'Enter') { event.preventDefault(); onEdit(true); } }}
  tabIndex={0}
  sx={{
   position: 'absolute', left: CANVAS_WORKSPACE_MARGIN + position.x, top: CANVAS_WORKSPACE_MARGIN + position.y, width: note.width, minHeight: 120,
   bgcolor: palette.fill, border: `1px solid ${palette.edge}`, borderRadius: '10px', color: palette.ink, p: '14px 16px 16px',
   boxShadow: offset ? '0 18px 36px rgba(16,24,40,.18)' : '0 1px 2px rgba(16,24,40,.06), 0 6px 16px rgba(16,24,40,.06)',
   outline: selected ? `${2 / scale}px solid #4c8b6b` : 'none', outlineOffset: 3 / scale,
   cursor: editing ? 'text' : offset ? 'grabbing' : 'grab', transition: offset ? 'none' : 'box-shadow .15s ease', userSelect: editing ? 'text' : 'none', touchAction: 'none',
   '&:focus-visible': { outline: `${2 / scale}px solid #4c8b6b` },
  }}>
  {selected && !offset && <Box role="toolbar" aria-label="Note options" onPointerDown={event => event.stopPropagation()}
   sx={{ position: 'absolute', bottom: '100%', left: 0, mb: `${8 / scale}px`, transform: `scale(${1 / scale})`, transformOrigin: '0 100%', display: 'flex', alignItems: 'center', gap: .5, p: .5, bgcolor: '#fff', border: '1px solid #e2e7e5', borderRadius: '10px', boxShadow: '0 8px 20px rgba(16,24,40,.12)' }}>
   {(Object.keys(NOTE_COLORS) as NoteColor[]).map(color => <Tooltip key={color} title={color[0].toUpperCase() + color.slice(1)}>
    <Box component="button" type="button" aria-label={`${color} note`} aria-pressed={note.color === color} onClick={() => onChange({ color }, true)}
     sx={{ all: 'unset', cursor: 'pointer', width: 18, height: 18, borderRadius: '50%', bgcolor: NOTE_COLORS[color].fill, border: `1px solid ${NOTE_COLORS[color].edge}`, boxShadow: note.color === color ? '0 0 0 2px #fff, 0 0 0 3.5px #4c8b6b' : 'none', '&:focus-visible': { boxShadow: '0 0 0 2px #fff, 0 0 0 3.5px #4c8b6b' } }}/>
   </Tooltip>)}
   <Box sx={{ width: '1px', height: 18, bgcolor: '#e6eae8', mx: .25 }}/>
   <Tooltip title="Delete note"><IconButton size="small" aria-label="Delete note" onClick={onRemove} sx={{ width: 26, height: 26, color: '#5b6770', '&:hover': { color: '#b42318', bgcolor: '#fdecec' } }}><Trash2 size={15}/></IconButton></Tooltip>
  </Box>}
  {editing
   ? <Box component="textarea" ref={text} aria-label="Note text" defaultValue={note.body} maxLength={2000} placeholder="Write a note…"
     onPointerDown={event => event.stopPropagation()}
     onInput={event => { const field = event.currentTarget; field.style.height = 'auto'; field.style.height = `${field.scrollHeight}px`; }}
     onBlur={event => { onChange({ body: event.currentTarget.value }, true); onEdit(false); }}
     onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') event.currentTarget.blur(); }}
     sx={{ all: 'unset', display: 'block', width: '100%', minHeight: 88, font: '450 14px/1.5 ui-sans-serif, system-ui, sans-serif', color: 'inherit', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', '&::placeholder': { color: 'inherit', opacity: .5 } }}/>
   : <Box sx={{ font: '450 14px/1.5 ui-sans-serif, system-ui, sans-serif', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', minHeight: 88 }}>
     {note.body || <Box component="span" sx={{ opacity: .5 }}>Double-click to write</Box>}
    </Box>}
 </Box>;
}
