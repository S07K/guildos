'use client';
import type { SelectionPreview } from './html-screen-frame';

/**
 * A live, script-free crop of the screen around a selected element, used for the
 * composer's context chip and its hover card. It renders the screen's own document,
 * so it always matches what is on the canvas.
 */
export function SelectionThumbnail({ preview, width, maxHeight, title }: { preview: SelectionPreview; width: number; maxHeight: number; title: string }) {
 const { box, frameWidth, html } = preview;
 const pad = Math.min(24, box.width * 0.08);
 const area = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: Math.min(frameWidth, box.width + pad * 2), height: box.height + pad * 2 };
 const scale = Math.min(width / area.width, maxHeight / area.height);
 return <div aria-hidden="true" style={{ width: area.width * scale, height: area.height * scale, overflow: 'hidden', position: 'relative', borderRadius: 6, background: '#fff', flex: 'none' }}>
  <iframe title={title} srcDoc={html} sandbox="allow-same-origin" referrerPolicy="no-referrer" tabIndex={-1}
   style={{ position: 'absolute', left: 0, top: 0, width: frameWidth, height: area.y + area.height, border: 0, pointerEvents: 'none', transformOrigin: '0 0', transform: `scale(${scale}) translate(${-area.x}px, ${-area.y}px)` }}/>
 </div>;
}
