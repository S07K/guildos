import { normalizeIconName } from './icon-names.ts';
import { isUnsplashImageUrl, isUnsplashPhoto, type UnsplashPhoto } from './image-source.ts';
import { isLayoutContainer } from './design-system.ts';
import type { CSSProperties } from 'react';
import { renderAutoLayoutHtml, type AutoLayout, type RelativeSize } from './canvas-layout.ts';
export const CANVAS_WORKSPACE_MARGIN = 40000;
export const CANVAS_WORKSPACE_SIZE = 80000;
export type CanvasNode = { id: string; type: 'button' | 'input' | 'container' | 'frame' | 'rectangle' | 'ellipse' | 'text' | 'line' | 'path' | 'image' | 'icon'; name: string; positionMode?: 'auto' | 'absolute'; x: number; y: number; width: number; height: number; fill: string; stroke: string; strokeWidth: number; radius: number; opacity: number; text: string; fontSize: number; fontWeight: number; designSystem?:'components-v1'; contentPadding?:number; textColor?: string; backgroundColor?:string; textAlign?: 'left' | 'center' | 'right'; verticalAlign?: 'top' | 'middle' | 'bottom'; lineHeight?: number; letterSpacing?: number; screen?:boolean; imageUrl?:string; imageSource?:UnsplashPhoto; assetId?: string; imageFit?: 'cover' | 'contain'; iconName?: string; points?: number[]; hidden?: boolean; parentId?: string; flow?: boolean; layout?: AutoLayout; sizing?: {width:RelativeSize;height:RelativeSize} };
export type CanvasDocument = { kind: 'canvas'; width: number; height: number; background: string; nodes: CanvasNode[] };
export const isCanvas = (value: unknown): value is CanvasDocument => !!value && typeof value === 'object' && 'kind' in value && value.kind === 'canvas';
export const blankCanvas = (): CanvasDocument => ({ kind: 'canvas', width: 1100, height: 900, background: '#ffffff', nodes: [] });
/** Reorder one layer within its own sibling list. Flow children use document order; legacy layers render back-to-front. */
export function reorderCanvasSiblings(nodes:CanvasNode[],sourceId:string,targetId:string,after=false):CanvasNode[]|null {
 if(sourceId===targetId)return null;
 const source=nodes.find(node=>node.id===sourceId),target=nodes.find(node=>node.id===targetId);
 if(!source||!target||!!source.flow!==!!target.flow)return null;
 const parentId=(node:CanvasNode)=>node.parentId||(!node.flow?containingFrame(node,nodes)?.id:undefined);
 const sourceParent=parentId(source);
 if(sourceParent!==parentId(target))return null;
 const siblings=source.flow?nodes.filter(node=>node.flow&&node.parentId===sourceParent):[...nodes].reverse().filter(node=>!node.flow&&parentId(node)===sourceParent);
 const order=siblings.map(node=>node.id),from=order.indexOf(sourceId);
 if(from<0||!order.includes(targetId))return null;
 order.splice(from,1);order.splice(order.indexOf(targetId)+(after?1:0),0,sourceId);
 const rank=new Map(order.map((id,index)=>[id,index]));
 const reordered=siblings.slice().sort((a,b)=>rank.get(a.id)!-rank.get(b.id)!);
 let index=0;
 return nodes.map(node=>rank.has(node.id)?reordered[index++]:node);
}
export function adjacentCanvasSiblingId(nodes:CanvasNode[],selectedId:string,key:'ArrowUp'|'ArrowDown'):string|null {
 const selected=nodes.find(node=>node.id===selectedId);
 if(!selected)return null;
 const parentId=(node:CanvasNode)=>node.parentId||(!node.flow?containingFrame(node,nodes)?.id:undefined);
 const siblings=nodes.filter(node=>!!node.flow===!!selected.flow&&parentId(node)===parentId(selected));
 const index=siblings.findIndex(node=>node.id===selectedId),next=index+(key==='ArrowUp'?-1:1);
 return next>=0&&next<siblings.length?siblings[next].id:null;
}
export function containingFrame(node: CanvasNode, nodes: CanvasNode[]) {
 if (node.flow) return nodes.find(item=>item.id===node.parentId);
 if (node.type === 'frame') return undefined;
 const area = Math.max(1, node.width * node.height);
 return nodes.filter(frame => frame.type === 'frame' && !frame.hidden).map(frame => {
  const overlapWidth = Math.max(0, Math.min(node.x + node.width, frame.x + frame.width) - Math.max(node.x, frame.x));
  const overlapHeight = Math.max(0, Math.min(node.y + node.height, frame.y + frame.height) - Math.max(node.y, frame.y));
  return { frame, ratio: overlapWidth * overlapHeight / area };
 }).filter(item => item.ratio > 0.5).sort((a, b) => a.frame.width * a.frame.height - b.frame.width * b.frame.height)[0]?.frame;
}
const color = /^#[0-9a-f]{6}$/i;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const canvasAssetUrl = (projectId:string,assetId:string) => `/api/studio/assets/${assetId}?projectId=${projectId}`;
export const canvasIconUrl = (name:string,fill:string,strokeWidth:number) => `/api/studio/icons/${encodeURIComponent(name)}?color=${encodeURIComponent(fill)}&strokeWidth=${strokeWidth}`;
export function canvasTextStyle(node:CanvasNode):CSSProperties {
 return {color:node.fill,opacity:node.opacity,fontFamily:'var(--font-sans),sans-serif',fontSize:node.fontSize,fontWeight:node.fontWeight,lineHeight:node.lineHeight??1.2,letterSpacing:node.letterSpacing??0,textAlign:node.textAlign??'left',whiteSpace:'pre-wrap',overflowWrap:'break-word'};
}
export function validateCanvas(value: unknown): CanvasDocument {
 if (!isCanvas(value) || !Number.isFinite(value.width) || value.width < 100 || value.width > 10000 || !Number.isFinite(value.height) || value.height < 100 || value.height > 10000 || !color.test(value.background) || !Array.isArray(value.nodes) || value.nodes.length > 200) throw new Error('Invalid canvas document.');
 const ids = new Set<string>();
 for (const node of value.nodes) {
  if (!node || typeof node.id !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(node.id) || ids.has(node.id) || !['button','input','container','frame','rectangle','ellipse','text','line','path','image','icon'].includes(node.type) || typeof node.name !== 'string' || node.name.length > 100 || typeof node.text !== 'string' || node.text.length > 5000) throw new Error('Invalid canvas layer.');
  ids.add(node.id);
  if (node.parentId !== undefined && ((node.type === 'frame'&&!node.flow) || typeof node.parentId !== 'string' || node.parentId === node.id)) throw new Error('Invalid frame parent.');
  for (const key of ['x','y','width','height','strokeWidth','radius','opacity','fontSize','fontWeight'] as const) if (!Number.isFinite(node[key]) || Math.abs(node[key]) > 20000) throw new Error('Invalid layer dimensions.');
  const styleIssues:string[]=[];
  if(node.flow!==undefined&&typeof node.flow!=='boolean')styleIssues.push('invalid layout mode');
  if(node.positionMode!==undefined&&!['auto','absolute'].includes(node.positionMode))styleIssues.push('invalid position mode');
  if(node.flow) {
   if(!node.sizing||!['fill-container','hug-contents','fixed'].includes(node.sizing.width)||!['fill-container','hug-contents','fixed'].includes(node.sizing.height))styleIssues.push('invalid relative sizing');
   if(node.type==='text'&&node.sizing?.height!=='hug-contents')styleIssues.push('text height must hug contents');
   if(isLayoutContainer(node.type)&&!node.layout)styleIssues.push('containers require auto layout');
  }
  if(node.layout) {
   const layout=node.layout;
   if(!node.flow||!isLayoutContainer(node.type)||!['row','column'].includes(layout.direction)||!['start','center','end','stretch'].includes(layout.alignItems)||!['start','center','end','space-between'].includes(layout.justifyContent)||!Number.isFinite(layout.gap)||layout.gap<0||layout.gap>500||!Number.isFinite(layout.padding)||layout.padding<0||layout.padding>500)styleIssues.push('invalid auto layout');
  }
  if(['container','button','input'].includes(node.type)&&!node.flow)styleIssues.push('containers require flow layout');
  if(node.width<1||node.height<1) styleIssues.push('width and height must be positive');
  if(node.opacity<0||node.opacity>1) styleIssues.push('opacity must be between 0 and 1');
  if(node.fontSize<1||node.fontSize>500) styleIssues.push('font size must be between 1 and 500');
  if(node.strokeWidth<0||node.strokeWidth>100) styleIssues.push('stroke width must be between 0 and 100');
  if(node.designSystem==='components-v1'&&node.radius%8!==0)styleIssues.push('corner radius must use the 8px grid');
  if(node.designSystem==='components-v1'&&node.layout&&(node.layout.padding%8!==0||node.layout.gap%8!==0))styleIssues.push('spacing must use the 8px grid');
  if(node.designSystem!==undefined&&node.designSystem!=='components-v1')styleIssues.push('invalid design system');
  if(node.contentPadding!==undefined&&(!Number.isFinite(node.contentPadding)||node.contentPadding<0||node.contentPadding>496||node.contentPadding%8!==0))styleIssues.push('invalid content padding');
  if(node.textColor!==undefined&&!color.test(node.textColor))styleIssues.push('invalid text color');
  if(node.backgroundColor!==undefined&&!color.test(node.backgroundColor))styleIssues.push('invalid background color');
  if(node.radius<0||node.radius>1000) styleIssues.push('corner radius must be between 0 and 1000');
  if(node.fontWeight<100||node.fontWeight>900) styleIssues.push('font weight must be between 100 and 900');
  if(!color.test(node.fill)) styleIssues.push('fill must be a six-digit hex color');
  if(!color.test(node.stroke)) styleIssues.push('stroke must be a six-digit hex color');
  if(node.hidden!==undefined&&typeof node.hidden!=='boolean') styleIssues.push('hidden must be true or false');
  if(node.textAlign!==undefined&&!['left','center','right'].includes(node.textAlign)) styleIssues.push('text alignment is invalid');
  if(node.verticalAlign!==undefined&&!['top','middle','bottom'].includes(node.verticalAlign)) styleIssues.push('vertical alignment is invalid');
  if(node.lineHeight!==undefined&&(!Number.isFinite(node.lineHeight)||node.lineHeight<0.8||node.lineHeight>3)) styleIssues.push('line height must be between 0.8 and 3');
  if(node.letterSpacing!==undefined&&(!Number.isFinite(node.letterSpacing)||node.letterSpacing< -5||node.letterSpacing>30)) styleIssues.push('letter spacing is invalid');
  if(node.type==='image'&&(!node.assetId&&!node.imageUrl||!!node.assetId&&!!node.imageUrl)) styleIssues.push('image asset is missing');
  if(node.screen!==undefined&&(node.screen!==true||node.type!=='container'||!!node.parentId||!node.flow||node.sizing?.width!=='fixed'||node.width<320||node.width>2560||node.height<640))styleIssues.push('invalid screen frame');
  if(node.imageUrl!==undefined&&(node.type!=='image'||!isUnsplashImageUrl(node.imageUrl)||!isUnsplashPhoto(node.imageSource)||node.imageSource.imageUrl!==node.imageUrl))styleIssues.push('image URL requires verified Unsplash attribution');
  if(node.imageSource!==undefined&&(!isUnsplashPhoto(node.imageSource)||node.type!=='image'||node.imageSource.imageUrl!==node.imageUrl))styleIssues.push('invalid Unsplash image source');
  if(node.imageFit!==undefined&&!['cover','contain'].includes(node.imageFit)) styleIssues.push('image fit is invalid');
  if(node.assetId!==undefined&&(!uuid.test(node.assetId)||node.type!=='image')) styleIssues.push('image asset is invalid');
  if(node.type==='icon'&&(!node.iconName||!normalizeIconName(node.iconName))) styleIssues.push('icon name is invalid');
  if(node.iconName!==undefined&&(!['icon','button','input'].includes(node.type)||!normalizeIconName(node.iconName))) styleIssues.push('icon name is only valid on icon layers');
  if(node.type==='icon'&&(node.strokeWidth<0.5||node.strokeWidth>4)) styleIssues.push('icon stroke width must be between 0.5 and 4');
  if(styleIssues.length) throw new Error(`Invalid layer styling for “${node.name}”: ${styleIssues.join('; ')}.`);
  if (node.points !== undefined && (!Array.isArray(node.points) || node.points.length > 2000 || node.points.length % 2 || node.points.some(point => !Number.isFinite(point) || Math.abs(point) > 20000))) throw new Error('Invalid drawing path.');
 }
 const byId=new Map(value.nodes.map(node=>[node.id,node]));
 for(const node of value.nodes) {
  if(node.parentId) {
   const parent=byId.get(node.parentId);
   if(!parent||(!isLayoutContainer(parent.type)||parent.type==='input')||(!node.flow&&parent.flow))throw new Error('Invalid container parent.');
  }
  const seen=new Set([node.id]);let parentId=node.parentId;
  while(parentId){if(seen.has(parentId)||seen.size>32)throw new Error('Container hierarchy has a cycle or exceeds 32 levels.');seen.add(parentId);parentId=byId.get(parentId)?.parentId;}
 }
 return value;
}
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]!));
export function renderCanvas(value: CanvasDocument, title: string, projectId?:string) {
 const doc = validateCanvas(value);
 const frames = doc.nodes.filter(node => node.type === 'frame' && !node.flow);
 const svg = [...frames, ...doc.nodes.filter(node => !node.flow && node.type !== 'frame')].map(node => {
  const parent = frames.find(frame=>frame.id===node.parentId)||containingFrame(node, frames);
  const hidden=node.hidden||parent?.hidden;
  const clip = parent ? ` clip-path="url(#clip-${parent.id})"` : '';
  const common = `opacity="${hidden?0:node.opacity}"${hidden?' visibility="hidden"':''} fill="${node.fill}" stroke="${node.stroke}" stroke-width="${node.strokeWidth}"${clip}`;
  if (node.type === 'text') return `<foreignObject x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"${hidden?' visibility="hidden"':''}${clip}><div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;width:100%;height:100%;display:flex;align-items:${node.verticalAlign==='middle'?'center':node.verticalAlign==='bottom'?'flex-end':'flex-start'};color:${node.fill};font:${node.fontWeight} ${node.fontSize}px/${node.lineHeight??1.2} sans-serif;letter-spacing:${node.letterSpacing??0}px;text-align:${node.textAlign??'left'};white-space:pre-wrap;overflow-wrap:break-word;overflow:hidden;opacity:${hidden?0:node.opacity}"><span style="width:100%">${escape(node.text)}</span></div></foreignObject>`;
  if (node.type === 'image') return projectId?`<image x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" href="${canvasAssetUrl(projectId,node.assetId!)}" preserveAspectRatio="xMidYMid ${node.imageFit==='contain'?'meet':'slice'}" style="border-radius:${node.radius}px" opacity="${hidden?0:node.opacity}"${hidden?' visibility="hidden"':''}${clip}/>`:'';
  if (node.type === 'icon') return `<image x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" href="${escape(canvasIconUrl(node.iconName!,node.fill,node.strokeWidth))}" preserveAspectRatio="xMidYMid meet" opacity="${hidden?0:node.opacity}"${hidden?' visibility="hidden"':''}${clip}/>`;
  if (node.type === 'ellipse') return `<ellipse cx="${node.x+node.width/2}" cy="${node.y+node.height/2}" rx="${node.width/2}" ry="${node.height/2}" ${common}/>`;
  if (node.type === 'line') return `<line x1="${node.x}" y1="${node.y}" x2="${node.x+node.width}" y2="${node.y+node.height}" ${common}/>`;
  if (node.type === 'path') return `<polyline points="${(node.points || []).map((point,i) => point + (i%2 ? node.y : node.x)).join(' ')}" fill="none" stroke="${node.stroke}" stroke-width="${node.strokeWidth}" opacity="${node.opacity}"/>`;
  return `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${node.radius}" ${common}/>`;
 }).join('');
 return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' https://images.unsplash.com; style-src 'unsafe-inline'; base-uri 'none'"><title>${escape(title)}</title></head><body style="margin:0;position:relative;min-height:${doc.height}px;background:${doc.background}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${doc.width} ${doc.height}" style="position:absolute;top:0;left:0;display:${doc.nodes.some(node=>!node.flow)?'block':'none'};width:100%;background:${doc.background}"><defs>${frames.map(frame => `<clipPath id="clip-${frame.id}"><rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="${frame.radius}"/></clipPath>`).join('')}</defs>${svg}</svg>${renderAutoLayoutHtml(doc,projectId)}</body></html>`;
}
