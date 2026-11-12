'use client';
import type { ReactNode } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { HTML_DEVICE_FRAME, type HtmlScreenDocument } from '@/lib/studio/html-screen';
import type { ScreenSelection } from './html-screen-frame';

const heading = { fontSize: 11.5, fontWeight: 650, letterSpacing: '.04em', textTransform: 'uppercase', color: '#7b8790' } as const;
const Row = ({ label, children }: { label: string; children: ReactNode }) => <Box sx={{ display: 'grid', gridTemplateColumns: '84px minmax(0,1fr)', alignItems: 'center', gap: 1.5, minHeight: 28 }}>
 <Typography sx={{ fontSize: 12.5, color: '#6b7680' }}>{label}</Typography>
 <Box sx={{ minWidth: 0, fontSize: 13, color: '#1f2a33', overflowWrap: 'anywhere' }}>{children}</Box>
</Box>;

/** The properties panel for a selected board screen (and the element picked inside it). */
export function ScreenInspector({ screen, selection }: { screen: HtmlScreenDocument; selection: ScreenSelection | null }) {
 const frame = HTML_DEVICE_FRAME[screen.device], ready = screen.sections.filter(section => section.status === 'ready').length;
 return <Box sx={{ display: 'grid', gap: 2.25, minWidth: 0 }}>
  {selection && <Box sx={{ display: 'grid', gap: .75, pb: 2, borderBottom: '1px solid #eef1f0' }}>
   <Typography sx={heading}>Selected element</Typography>
   <Typography sx={{ fontSize: 13, color: '#1f2a33' }}><Box component="code" sx={{ fontSize: 12, bgcolor: '#eef3f0', color: '#24533e', px: .6, py: .2, borderRadius: '5px' }}>{selection.tag}</Box> in section <b>{selection.sectionId}</b></Typography>
   {selection.text && <Typography sx={{ fontSize: 12.5, color: '#5b6770', overflowWrap: 'anywhere', lineHeight: 1.5 }}>“{selection.text.slice(0, 160)}”</Typography>}
  </Box>}
  <Box sx={{ display: 'grid', gap: .5 }}>
   <Typography sx={heading}>Screen</Typography>
   <Typography sx={{ fontSize: 15, fontWeight: 650, color: '#1f2a33', overflowWrap: 'anywhere' }}>{screen.name}</Typography>
  </Box>
  <Box sx={{ display: 'grid', gap: .25 }}>
   <Row label="Device">{screen.device[0].toUpperCase() + screen.device.slice(1)} · {frame.width} px</Row>
   <Row label="Sections">{ready === screen.sections.length ? screen.sections.length : `${ready} of ${screen.sections.length} built`}</Row>
   <Row label="Colours"><Box sx={{ display: 'flex', gap: .6, flexWrap: 'wrap' }}>{Object.entries(screen.tokens.colors).map(([name, color]) => <Tooltip key={name} title={`${name} · ${color}`}><Box aria-label={`${name} ${color}`} sx={{ width: 20, height: 20, borderRadius: '6px', bgcolor: color, boxShadow: 'inset 0 0 0 1px rgba(16,24,40,.12)' }}/></Tooltip>)}</Box></Row>
   <Row label="Fonts">{[screen.tokens.fontDisplay, screen.tokens.fontSans || 'Inter'].filter(Boolean).join(' / ')}</Row>
   {screen.art?.direction && <Row label="Art direction"><Typography sx={{ fontSize: 12.5, color: '#5b6770', lineHeight: 1.5 }}>{screen.art.direction}</Typography></Row>}
  </Box>
 </Box>;
}
