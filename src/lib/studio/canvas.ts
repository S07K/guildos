export type CanvasNode = { id: string; type: 'frame' | 'rectangle' | 'ellipse' | 'text' | 'line' | 'path'; name: string; x: number; y: number; width: number; height: number; fill: string; stroke: string; strokeWidth: number; radius: number; opacity: number; text: string; fontSize: number; fontWeight: number; points?: number[]; hidden?: boolean };
export type CanvasDocument = { kind: 'canvas'; width: number; height: number; background: string; nodes: CanvasNode[] };
export const isCanvas = (value: unknown): value is CanvasDocument => !!value && typeof value === 'object' && 'kind' in value && value.kind === 'canvas';
export const blankCanvas = (): CanvasDocument => ({ kind: 'canvas', width: 1100, height: 900, background: '#ffffff', nodes: [] });
const color = /^#[0-9a-f]{6}$/i;
export function validateCanvas(value: unknown): CanvasDocument {
 if (!isCanvas(value) || !Number.isFinite(value.width) || value.width < 100 || value.width > 10000 || !Number.isFinite(value.height) || value.height < 100 || value.height > 10000 || !color.test(value.background) || !Array.isArray(value.nodes) || value.nodes.length > 200) throw new Error('Invalid canvas document.');
 const ids = new Set<string>();
 for (const node of value.nodes) {
  if (!node || typeof node.id !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(node.id) || ids.has(node.id) || !['frame','rectangle','ellipse','text','line','path'].includes(node.type) || typeof node.name !== 'string' || node.name.length > 100 || typeof node.text !== 'string' || node.text.length > 5000) throw new Error('Invalid canvas layer.');
  ids.add(node.id);
  for (const key of ['x','y','width','height','strokeWidth','radius','opacity','fontSize','fontWeight'] as const) if (!Number.isFinite(node[key]) || Math.abs(node[key]) > 20000) throw new Error('Invalid layer dimensions.');
  if (node.width < 1 || node.height < 1 || node.opacity < 0 || node.opacity > 1 || node.fontSize < 1 || node.fontSize > 500 || node.strokeWidth < 0 || node.strokeWidth > 100 || node.radius < 0 || node.radius > 1000 || node.fontWeight < 100 || node.fontWeight > 900 || !color.test(node.fill) || !color.test(node.stroke) || (node.hidden !== undefined && typeof node.hidden !== 'boolean')) throw new Error('Invalid layer styling.');
  if (node.points !== undefined && (!Array.isArray(node.points) || node.points.length > 2000 || node.points.length % 2 || node.points.some(point => !Number.isFinite(point) || Math.abs(point) > 20000))) throw new Error('Invalid drawing path.');
 }
 return value;
}
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]!));
export function renderCanvas(value: CanvasDocument, title: string) {
 const doc = validateCanvas(value);
 const svg = doc.nodes.filter(node => !node.hidden).map(node => {
  const common = `opacity="${node.opacity}" fill="${node.fill}" stroke="${node.stroke}" stroke-width="${node.strokeWidth}"`;
  if (node.type === 'text') return `<foreignObject x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"><div xmlns="http://www.w3.org/1999/xhtml" style="color:${node.fill};font:${node.fontWeight} ${node.fontSize}px/1.2 sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;opacity:${node.opacity}">${escape(node.text)}</div></foreignObject>`;
  if (node.type === 'ellipse') return `<ellipse cx="${node.x+node.width/2}" cy="${node.y+node.height/2}" rx="${node.width/2}" ry="${node.height/2}" ${common}/>`;
  if (node.type === 'line') return `<line x1="${node.x}" y1="${node.y}" x2="${node.x+node.width}" y2="${node.y+node.height}" ${common}/>`;
  if (node.type === 'path') return `<polyline points="${(node.points || []).map((point,i) => point + (i%2 ? node.y : node.x)).join(' ')}" fill="none" stroke="${node.stroke}" stroke-width="${node.strokeWidth}" opacity="${node.opacity}"/>`;
  return `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${node.radius}" ${common}/>`;
 }).join('');
 return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'"><title>${escape(title)}</title></head><body style="margin:0;background:${doc.background}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${doc.width} ${doc.height}" style="display:block;width:100%;background:${doc.background}">${svg}</svg></body></html>`;
}
