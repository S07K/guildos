'use client';
import { useState, type ReactNode } from 'react';
import { Box, Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Paper, Tooltip, Typography } from '@mui/material';
import { Hand, ImagePlus, Minus, MousePointer2, Plus, SquarePlus, StickyNote } from 'lucide-react';

export type BoardTool = 'select' | 'hand';

/** A keyboard shortcut chip, shown in tooltips and menus. */
export const Kbd = ({ children }: { children: ReactNode }) => <Box component="kbd" sx={{ font: '500 11px/1 ui-sans-serif, system-ui, sans-serif', color: 'inherit', opacity: .72, border: '1px solid currentColor', borderColor: 'rgba(255,255,255,.28)', borderRadius: '5px', px: .6, py: .3, ml: 1 }}>{children}</Box>;
const tip = (label: string, shortcut?: string) => <Box sx={{ display: 'flex', alignItems: 'center', fontSize: 12, fontWeight: 500 }}>{label}{shortcut && <Kbd>{shortcut}</Kbd>}</Box>;

const surface = { bgcolor: '#fff', border: '1px solid #e2e7e5', borderRadius: '12px', boxShadow: '0 1px 2px rgba(16,24,40,.05), 0 8px 24px rgba(16,24,40,.08)' } as const;
const toolButton = (active: boolean) => ({
 width: 36, height: 36, borderRadius: '8px', color: active ? '#24533e' : '#3f4b55', bgcolor: active ? '#e6f0ea' : 'transparent',
 transition: 'background-color .12s ease, color .12s ease', '&:hover': { bgcolor: active ? '#dcebe2' : '#f1f4f3' }, '&.Mui-focusVisible': { outline: '2px solid #4c8b6b', outlineOffset: 1 },
});

/**
 * The board's bottom dock: navigation tools and the ways to add to the board
 * (a new screen, a reference image for the agents, a sticky note).
 */
export function BoardDock({ tool, onTool, onNewScreen, onReference, onNote, composing }: {
 tool: BoardTool; onTool: (tool: BoardTool) => void; onNewScreen: () => void; onReference: () => void; onNote: () => void; composing: boolean;
}) {
 const item = (label: string, shortcut: string, icon: ReactNode, active: boolean, onClick: () => void) =>
  <Tooltip key={label} arrow placement="top" title={tip(label, shortcut)} slotProps={{ tooltip: { sx: { bgcolor: '#1f2a33', px: 1.1, py: .7 } }, arrow: { sx: { color: '#1f2a33' } } }}>
   <IconButton aria-label={label} aria-pressed={active} onClick={onClick} sx={toolButton(active)}>{icon}</IconButton>
  </Tooltip>;
 return <Paper role="toolbar" aria-label="Board tools" elevation={0} sx={{ ...surface, position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 5, p: .5, display: 'flex', alignItems: 'center', gap: .25 }}>
  {item('Select', 'V', <MousePointer2 size={18} strokeWidth={1.8}/>, tool === 'select', () => onTool('select'))}
  {item('Hand', 'H', <Hand size={18} strokeWidth={1.8}/>, tool === 'hand', () => onTool('hand'))}
  <Divider orientation="vertical" flexItem sx={{ mx: .5, my: .75, borderColor: '#e6eae8' }}/>
  {item('New screen', 'S', <SquarePlus size={18} strokeWidth={1.8}/>, composing, onNewScreen)}
  {item('Reference image', 'I', <ImagePlus size={18} strokeWidth={1.8}/>, false, onReference)}
  {item('Note', 'N', <StickyNote size={18} strokeWidth={1.8}/>, false, onNote)}
 </Paper>;
}

/** Zoom out / level menu / zoom in, bottom-right of the board. */
export function ZoomControl({ zoom, onZoom, onReset, onFitAll, onFitSelection, canFitSelection }: {
 zoom: number; onZoom: (factor: number) => void; onReset: () => void; onFitAll: () => void; onFitSelection: () => void; canFitSelection: boolean;
}) {
 const [anchor, setAnchor] = useState<HTMLElement | null>(null);
 const close = (action: () => void) => () => { setAnchor(null); action(); };
 const option = (label: string, shortcut: string, action: () => void, disabled = false) =>
  <MenuItem key={label} disabled={disabled} onClick={close(action)} sx={{ fontSize: 13, minHeight: 34, gap: 3 }}>
   <ListItemText slotProps={{ primary: { sx: { fontSize: 13 } } }}>{label}</ListItemText>
   <ListItemIcon sx={{ minWidth: 0, justifyContent: 'flex-end' }}><Typography component="span" sx={{ fontSize: 12, color: '#7b8790' }}>{shortcut}</Typography></ListItemIcon>
  </MenuItem>;
 const step = { width: 30, height: 30, borderRadius: '7px', color: '#3f4b55', '&:hover': { bgcolor: '#f1f4f3' } };
 return <Paper role="group" aria-label="Zoom" elevation={0} sx={{ ...surface, position: 'absolute', bottom: 20, right: 20, zIndex: 5, p: .375, display: 'flex', alignItems: 'center' }}>
  <Tooltip arrow placement="top" title={tip('Zoom out', '⌘−')}><IconButton aria-label="Zoom out" onClick={() => onZoom(1 / 1.25)} sx={step}><Minus size={16}/></IconButton></Tooltip>
  <Box component="button" type="button" aria-label="Zoom level" aria-haspopup="menu" onClick={event => setAnchor(event.currentTarget)}
   sx={{ all: 'unset', cursor: 'pointer', font: '600 12.5px/1 ui-sans-serif, system-ui, sans-serif', color: '#26323b', minWidth: 48, textAlign: 'center', py: 1, borderRadius: '7px', fontVariantNumeric: 'tabular-nums', '&:hover': { bgcolor: '#f1f4f3' }, '&:focus-visible': { outline: '2px solid #4c8b6b' } }}>
   {Math.round(zoom)}%
  </Box>
  <Tooltip arrow placement="top" title={tip('Zoom in', '⌘+')}><IconButton aria-label="Zoom in" onClick={() => onZoom(1.25)} sx={step}><Plus size={16}/></IconButton></Tooltip>
  <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'top', horizontal: 'right' }} transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
   slotProps={{ paper: { sx: { mt: -1, minWidth: 220, borderRadius: '10px', border: '1px solid #e2e7e5', boxShadow: '0 12px 32px rgba(16,24,40,.12)' } }, list: { 'aria-label': 'Zoom options', dense: true } }}>
   {option('Zoom in', '⌘+', () => onZoom(1.25))}
   {option('Zoom out', '⌘−', () => onZoom(1 / 1.25))}
   {option('Zoom to 100%', '⇧0', onReset)}
   {option('Fit all screens', '⇧1', onFitAll)}
   {option('Fit selection', '⇧2', onFitSelection, !canFitSelection)}
  </Menu>
 </Paper>;
}
