'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * A screen on a public share page: the composed, script-free HTML in a sandboxed frame,
 * scaled down to fit narrow viewports and sized to its full content height. It is
 * view-only, so the frame takes no pointer input and its links cannot navigate.
 */
export function SharedScreen({ name, html, width, minHeight }: { name: string; html: string; width: number; minHeight: number }) {
 const box = useRef<HTMLDivElement>(null), frame = useRef<HTMLIFrameElement>(null), content = useRef<ResizeObserver | null>(null);
 const [available, setAvailable] = useState(width), [height, setHeight] = useState(minHeight);
 useEffect(() => {
  const element = box.current;
  if (!element) return;
  const observer = new ResizeObserver(() => setAvailable(element.clientWidth));
  observer.observe(element);
  // The server-rendered frame can finish loading before hydration, when onLoad has already fired.
  measure();
  return () => { observer.disconnect(); content.current?.disconnect(); };
 }, []); // eslint-disable-line react-hooks/exhaustive-deps
 const measure = () => {
  const doc = frame.current?.contentDocument;
  if (!doc?.querySelector('main')) return;
  setHeight(Math.max(minHeight, Math.ceil(doc.documentElement.scrollHeight)));
  content.current?.disconnect();
  content.current = new ResizeObserver(() => setHeight(Math.max(minHeight, Math.ceil(doc.documentElement.scrollHeight))));
  content.current.observe(doc.body);
 };
 const scale = Math.min(1, available / width);
 return <figure className="shared-screen" style={{ margin: 0 }}>
  <figcaption style={{ font: '500 14px/1.3 system-ui, sans-serif', color: '#55606a', margin: '0 0 10px' }}>{name}</figcaption>
  <div ref={box} style={{ width: '100%', maxWidth: width }}>
   <div style={{ width: width * scale, height: height * scale, overflow: 'hidden', borderRadius: 12, boxShadow: '0 1px 2px rgba(15,23,42,.06), 0 12px 32px rgba(15,23,42,.10)', background: '#fff' }}>
    <iframe ref={frame} title={name} srcDoc={html} onLoad={measure} sandbox="allow-same-origin" referrerPolicy="no-referrer" loading="lazy" tabIndex={-1}
     style={{ display: 'block', width, height, border: 0, transform: `scale(${scale})`, transformOrigin: '0 0', pointerEvents: 'none' }}/>
   </div>
  </div>
 </figure>;
}
