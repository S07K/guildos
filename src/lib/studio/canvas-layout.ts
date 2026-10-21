import type { CSSProperties } from 'react';
import { canvasToComponent, isLayoutContainer, snapToGrid } from './design-system.ts';
import type { CanvasDocument, CanvasNode } from './canvas.ts';

export type RelativeSize = 'fill-container' | 'hug-contents' | 'fixed';
export type AutoLayout = { direction:'row'|'column'; gap:number; padding:number; alignItems:'start'|'center'|'end'|'stretch'; justifyContent:'start'|'center'|'end'|'space-between' };
export const defaultLayout:AutoLayout={direction:'column',gap:16,padding:16,alignItems:'stretch',justifyContent:'start'};
/** Model context must describe the rendered relationships, never compatibility rectangles. */
export function agentCanvasDocument(doc:CanvasDocument) {
 return {...doc,nodes:doc.nodes.map(canvasToComponent)};
}
/** Adapt the public relational tool contract to the backwards-compatible stored node. */
export function normalizeFlowFields(raw:Record<string,unknown>,previous?:CanvasNode):Record<string,unknown> {
 const fields=['direction','gap','padding','alignItems','justifyContent'];
 if(!previous?.flow&&raw.flow!==true&&typeof raw.width!=='string'&&typeof raw.height!=='string'&&!fields.some(key=>key in raw))return raw;
 const node:Record<string,unknown>={...previous,...raw,flow:true};
 const sizing=raw.sizing as CanvasNode['sizing'];
 node.sizing={width:typeof raw.width==='string'?raw.width:sizing?.width??previous?.sizing?.width??'fill-container',height:node.type==='text'?'hug-contents':typeof raw.height==='string'?raw.height:sizing?.height??previous?.sizing?.height??'hug-contents'};
 node.x=previous?.x??0;node.y=previous?.y??0;node.width=typeof raw.width==='number'?raw.width:previous?.width??(node.type==='icon'?24:100);node.height=typeof raw.height==='number'?raw.height:previous?.height??24;
 if(isLayoutContainer(String(node.type)))node.layout=Object.fromEntries(fields.map(key=>[key,raw[key]??(raw.layout as AutoLayout|undefined)?.[key as keyof AutoLayout]??previous?.layout?.[key as keyof AutoLayout]??defaultLayout[key as keyof AutoLayout]]));
 if(node.layout){const layout=node.layout as AutoLayout;node.layout={...layout,gap:snapToGrid(layout.gap),padding:snapToGrid(layout.padding)};}
 if(typeof node.radius==='number')node.radius=snapToGrid(node.radius,1000);
 for(const key of fields)delete node[key];
 if(node.parentId===null)delete node.parentId;
 return node;
}
export const flowChildren=(doc:CanvasDocument,id?:string)=>doc.nodes.filter(node=>node.flow&&!node.hidden&&(node.parentId||undefined)===id);
const alignment=(value:string)=>value==='start'?'flex-start':value==='end'?'flex-end':value;
export const inlineIconSize=(node:CanvasNode)=>node.fontSize>16?20:16;
export const iconWrapperStyle=(node:CanvasNode):CSSProperties=>({display:'inline-flex',width:inlineIconSize(node),height:inlineIconSize(node),minWidth:inlineIconSize(node),minHeight:inlineIconSize(node),alignItems:'center',justifyContent:'center',flexShrink:0,verticalAlign:'middle'});
export const iconGlyphStyle=(node:CanvasNode):CSSProperties=>({display:'block',width:inlineIconSize(node),height:inlineIconSize(node),flexShrink:0});
export const isIconRow=(doc:CanvasDocument,node?:CanvasNode)=>!!node&&node.layout?.direction==='row'&&flowChildren(doc,node.id).some(child=>child.type==='icon');
export function flowNodeStyle(node:CanvasNode,parent?:CanvasNode,atomic:{iconRow?:boolean;parentIconRow?:boolean}={}):CSSProperties {
 const row=parent?.layout?.direction==='row';
 const fillWidth=node.sizing?.width==='fill-container'&&parent?.sizing?.width!=='hug-contents';
 const fillHeight=node.sizing?.height==='fill-container'&&node.type!=='text'&&parent?.sizing?.height!=='hug-contents';
 const layout=node.layout;
 const fixedWidth=node.sizing?.width==='fixed',fixedHeight=node.sizing?.height==='fixed';
 return {
  boxSizing:'border-box',position:'relative',padding:node.contentPadding,minWidth:0,maxWidth:'100%',flexShrink:0,
  width:node.screen?node.width:fixedWidth?node.width:fillWidth?(row?undefined:'100%'):['rectangle','ellipse'].includes(node.type)?24:'fit-content',height:fixedHeight&&!isLayoutContainer(node.type)&&node.type!=='image'?node.height:'auto',
  flexGrow:row?(fillWidth?1:0):(fillHeight?1:0),flexBasis:row&&fillWidth?0:undefined,
  alignSelf:(!row&&fillWidth)||(row&&fillHeight)?'stretch':undefined,
  minHeight:node.screen?node.height:fixedHeight?node.height:['button','input'].includes(node.type)?48:node.type==='icon'?24:node.type==='image'?120:node.type==='rectangle'||node.type==='ellipse'?24:undefined,
  ...(layout?{display:'flex',flexDirection:layout.direction,flexWrap:layout.direction==='row'?'wrap':'nowrap',gap:layout.gap,padding:layout.padding,alignItems:alignment(layout.alignItems),justifyContent:alignment(layout.justifyContent)}:{}),
  ...(['button','input'].includes(node.type)&&node.iconName?{display:'flex',flexDirection:'row',flexWrap:'nowrap',gap:8,alignItems:'center',justifyContent:node.type==='button'?'center':alignment(layout?.justifyContent||'start'),...(node.type==='button'?{padding:'12px 16px'}:{})}:{}),
  backgroundColor:['text','icon'].includes(node.type)?node.backgroundColor:['image','line','path'].includes(node.type)?undefined:node.fill,
  color:node.type==='text'||node.type==='icon'?node.fill:node.textColor??'#202b38',fontFamily:'sans-serif',fontSize:node.fontSize,fontWeight:node.fontWeight,lineHeight:1.5,overflowWrap:'anywhere',border:node.strokeWidth&&node.type!=='icon'?`${node.strokeWidth}px solid ${node.stroke}`:'none',
  borderRadius:node.type==='ellipse'?'50%':node.radius,opacity:node.opacity,
  ...(atomic.iconRow?{flexWrap:'nowrap'}:{}),
  ...(node.type==='icon'?{...iconWrapperStyle(node),padding:0}:{}),
  ...(node.type==='text'?{fontFamily:'sans-serif',fontSize:node.fontSize,fontWeight:node.fontWeight,lineHeight:node.lineHeight??1.2,letterSpacing:node.letterSpacing??0,textAlign:node.textAlign??'left',whiteSpace:'pre-wrap',overflowWrap:'anywhere',height:'auto',flexShrink:atomic.parentIconRow?1:0}:{}),
 };
}
export const flowRootStyle:CSSProperties={display:'flex',flexDirection:'row',flexWrap:'wrap',gap:32,alignItems:'flex-start',alignContent:'flex-start',boxSizing:'border-box'};
export function flowAssetUrl(node:CanvasNode,projectId?:string) {
 return node.type==='icon'?`/api/studio/icons/${encodeURIComponent(node.iconName!)}?color=${encodeURIComponent(node.fill)}&strokeWidth=${node.strokeWidth}`:node.imageUrl|| (projectId?`/api/studio/assets/${node.assetId}?projectId=${projectId}`:'');
}
export const buttonIconUrl=(node:CanvasNode)=>`/api/studio/icons/${encodeURIComponent(node.iconName!)}?color=${encodeURIComponent(node.textColor||'#202b38')}&strokeWidth=2`;
const escape=(text:string)=>text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const unitless=new Set(['opacity','fontWeight','lineHeight','flexGrow','flexShrink','flexBasis']);
export function styleText(style:CSSProperties) {
 return Object.entries(style).filter(([,value])=>value!==undefined).map(([key,value])=>`${key.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase())}:${typeof value==='number'&&!unitless.has(key)?value+'px':value}`).join(';');
}
export function renderAutoLayoutHtml(doc:CanvasDocument,projectId?:string) {
 const render=(node:CanvasNode,parent?:CanvasNode):string=>{
  const style=flowNodeStyle(node,parent,{iconRow:isIconRow(doc,node),parentIconRow:isIconRow(doc,parent)});
  const icon=node.iconName&&['button','input'].includes(node.type)?`<span data-icon-wrapper="true" aria-hidden="true" style="${styleText(iconWrapperStyle(node))}"><img alt="" src="${escape(buttonIconUrl(node))}" style="${styleText(iconGlyphStyle(node))}"/></span>`:'';
  const attribution=node.imageSource?`<div style="font:11px/1.5 sans-serif;color:#202b38;background:#ffffff;padding:8px">Photo by <a href="${escape(node.imageSource.profileUrl)}" target="_blank" rel="noreferrer">${escape(node.imageSource.photographer)}</a> on <a href="${escape(node.imageSource.photoUrl)}" target="_blank" rel="noreferrer">Unsplash</a></div>`:'';
  const content=node.type==='text'?escape(node.text):node.type==='icon'||node.type==='image'?`<img alt="${escape(node.imageSource?.alt||node.name)}" src="${escape(flowAssetUrl(node,projectId))}" style="display:block;${node.type==='icon'?styleText(iconGlyphStyle(node)):'width:100%;height:auto;min-width:0;object-fit:'+ (node.imageFit==='contain'?'contain':'cover')}"/>${attribution}`:(node.type==='button'||node.type==='input'?icon+(icon?`<span data-icon-label="true">${escape(node.text)}</span>`:escape(node.text)):'')+flowChildren(doc,node.id).map(child=>render(child,node)).join('');
  if(node.type==='input'&&node.iconName)return `<div data-node-id="${escape(node.id)}" style="${escape(styleText({...style,flexDirection:'row',alignItems:'center'}))}">${icon}<input aria-label="${escape(node.name)}" placeholder="${escape(node.text)}" readonly style="border:0;padding:0;background:transparent;color:inherit;font:inherit;min-width:0;width:100%"/></div>`;
  if(node.type==='input')return `<input data-node-id="${escape(node.id)}" aria-label="${escape(node.name)}" placeholder="${escape(node.text)}" readonly style="${escape(styleText(style))}"/>`;
  const tag=node.type==='button'?'button':'div';
  return `<${tag}${node.type==='button'?' type="button"':''} data-node-id="${escape(node.id)}"${node.type==='icon'?' data-icon-wrapper="true"':''} style="${escape(styleText(style))}">${content}</${tag}>`;
 };
 const roots=flowChildren(doc);
 return `<div style="${styleText({...flowRootStyle,width:doc.width,minHeight:doc.height,maxWidth:'100%'})}">${roots.map(node=>render(node)).join('')}</div>`+doc.nodes.filter(node=>!node.flow&&node.type==='frame'&&!node.hidden).map(frame=>`<div style="position:absolute;left:${frame.x}px;top:${frame.y}px;width:${frame.width}px;display:flex;flex-direction:column;gap:16px">${flowChildren(doc,frame.id).map(node=>render(node)).join('')}</div>`).join('');
}
