import { unboxedVariant } from './visual-hierarchy.ts';
import type { CSSProperties } from 'react';
import { canvasToComponent, isLayoutContainer, snapToGrid } from './design-system.ts';
import type { CanvasDocument, CanvasNode } from './canvas.ts';
import { normalizeCanvasPositions, positionMode } from './canvas-position.ts';

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
 const node:Record<string,unknown>={...previous,...raw,flow:true,positionMode:raw.positionMode??previous?.positionMode??'auto'};
 const sizing=raw.sizing as CanvasNode['sizing'];
 node.sizing={width:typeof raw.width==='string'?raw.width:sizing?.width??previous?.sizing?.width??'fill-container',height:node.type==='text'?'hug-contents':typeof raw.height==='string'?raw.height:sizing?.height??previous?.sizing?.height??'hug-contents'};
 node.x=raw.x??previous?.x??0;node.y=raw.y??previous?.y??0;node.width=typeof raw.width==='number'?raw.width:previous?.width??(node.type==='icon'?24:100);node.height=typeof raw.height==='number'?raw.height:previous?.height??24;
 if(isLayoutContainer(String(node.type)))node.layout=Object.fromEntries(fields.map(key=>[key,raw[key]??(raw.layout as AutoLayout|undefined)?.[key as keyof AutoLayout]??previous?.layout?.[key as keyof AutoLayout]??defaultLayout[key as keyof AutoLayout]]));
 if(node.layout&&!node.variant){const layout=node.layout as AutoLayout;node.layout={...layout,gap:snapToGrid(layout.gap),padding:snapToGrid(layout.padding)};}
 if(!node.variant&&typeof node.radius==='number'&&node.positionMode!=='absolute')node.radius=snapToGrid(node.radius,1000);
 for(const key of fields)delete node[key];
 if(node.parentId===null)delete node.parentId;
 return node;
}
export const flowChildren=(doc:CanvasDocument,id?:string)=>doc.nodes.filter(node=>(node.flow||node.positionMode==='absolute')&&(node.parentId||undefined)===id);
const alignment=(value:string)=>value==='start'?'flex-start':value==='end'?'flex-end':value;
export const inlineIconSize=(node:CanvasNode)=>node.variant==='nav-back-row'||node.type==='icon'&&node.width===18?18:node.fontSize>16?20:16;
export const hasInlineIcon=(doc:CanvasDocument,node:CanvasNode)=>!!node.iconName&&!flowChildren(doc,node.id).some(child=>child.type==='icon');
export const iconWrapperStyle=(node:CanvasNode):CSSProperties=>({display:'inline-flex',width:inlineIconSize(node),height:inlineIconSize(node),minWidth:inlineIconSize(node),minHeight:inlineIconSize(node),alignItems:'center',justifyContent:'center',flexShrink:0,verticalAlign:'middle'});
export const iconGlyphStyle=(node:CanvasNode):CSSProperties=>({display:'block',width:inlineIconSize(node),height:inlineIconSize(node),flexShrink:0});
export const isIconRow=(doc:CanvasDocument,node?:CanvasNode)=>!!node&&node.layout?.direction==='row'&&flowChildren(doc,node.id).some(child=>child.type==='icon');
export function flowNodeStyle(node:CanvasNode,parent?:CanvasNode,atomic:{iconRow?:boolean;parentIconRow?:boolean;childIcon?:boolean}={}):CSSProperties {
 const row=parent?.layout?.direction==='row';
 const fillWidth=node.sizing?.width==='fill-container'&&parent?.sizing?.width!=='hug-contents';
 const fillHeight=node.sizing?.height==='fill-container'&&node.type!=='text'&&parent?.sizing?.height!=='hug-contents';
 const layout=node.layout??(node.type==='frame'?{...defaultLayout,padding:0}:undefined);
 const fixedWidth=node.sizing?.width==='fixed',fixedHeight=node.sizing?.height==='fixed';
 return {
  boxSizing:'border-box',position:'relative',padding:node.contentPadding,minWidth:0,maxWidth:'100%',flexShrink:0,
  width:node.screen?node.width:fixedWidth?node.width:fillWidth?(row?undefined:'100%'):['rectangle','ellipse'].includes(node.type)?24:'fit-content',height:node.screen&&node.sizing?.height==='fixed'?node.height:fixedHeight&&!isLayoutContainer(node.type)&&node.type!=='image'?node.height:'auto',
  flexGrow:row?(fillWidth?1:0):(fillHeight?1:0),flexBasis:row&&fillWidth?0:undefined,
  alignSelf:(!row&&fillWidth)||(row&&fillHeight)?'stretch':undefined,
  minHeight:node.screen?node.height:fixedHeight?node.height:['button','input'].includes(node.type)?48:node.type==='icon'?24:node.type==='image'?120:node.type==='rectangle'||node.type==='ellipse'?24:undefined,
  ...(layout?{display:'flex',flexDirection:layout.direction,flexWrap:layout.direction==='row'?'wrap':'nowrap',gap:layout.gap,padding:layout.padding,alignItems:alignment(layout.alignItems),justifyContent:alignment(layout.justifyContent)}:{}),
  ...(['button','input'].includes(node.type)&&node.iconName&&!atomic.childIcon?{display:'flex',flexDirection:'row',flexWrap:'nowrap',gap:8,alignItems:'center',justifyContent:alignment(layout?.justifyContent??(node.type==='button'?'center':'start')),...(node.type==='button'?{padding:'12px 16px'}:{})}:{}),
  backgroundColor:['text','icon','image','line','path'].includes(node.type)?undefined:node.fill,
  ...(node.type==='image'?{borderRadius:node.radius,overflow:'hidden'}:{}),
  color:node.type==='text'||node.type==='icon'?node.fill:node.textColor??'#202b38',fontFamily:'sans-serif',fontSize:node.fontSize,fontWeight:node.fontWeight,lineHeight:1.5,overflowWrap:'anywhere',border:node.strokeWidth&&!['icon','line','path'].includes(node.type)?`${node.strokeWidth}px solid ${node.stroke}`:'none',
  borderRadius:node.type==='ellipse'?'50%':node.radius,opacity:node.hidden?0:node.opacity,visibility:node.hidden?'hidden':undefined,
  ...(atomic.iconRow?{flexWrap:'nowrap'}:{}),
  ...(node.type==='icon'?{...iconWrapperStyle(node),padding:0}:{}),
  ...(node.type==='text'?{fontFamily:'sans-serif',fontSize:node.fontSize,fontWeight:node.fontWeight,lineHeight:node.lineHeight??1.2,letterSpacing:node.letterSpacing??0,textAlign:node.textAlign??'left',whiteSpace:'pre-wrap',overflowWrap:'anywhere',height:'auto',flexShrink:atomic.parentIconRow?1:0}:{}),
  ...(['container','frame'].includes(node.type)?{overflow:'hidden'}:{}),
  ...(node.screen?{display:'flex',flexDirection:'column',justifyContent:'space-between',position:'absolute',left:node.x,top:node.y,height:node.height,minHeight:node.height,paddingBottom:0,flexWrap:'nowrap'}:{}),
  ...(parent?.screen&&/bottom.?nav|navigation|footer|cart.bar/i.test(node.name+' '+node.id)?{marginTop:'auto'}:{}),
  ...(parent?.screen&&/content|body|scroll/i.test(node.name+' '+node.id)?{flex:1,minHeight:0,overflowY:'auto'}:{}),
  ...(unboxedVariant(node.variant)?{backgroundColor:'transparent',border:'none',borderRadius:0}:{}),
  ...(node.variant==='nav-back-row'?{display:'flex',flexDirection:'row',alignItems:'center',gap:8,padding:'4px 0',minHeight:0,width:'fit-content',fontSize:15,fontWeight:500,justifyContent:'flex-start'}:{}),
  ...(node.variant==='info-row'?{display:'flex',flexDirection:'row',alignItems:'center',gap:8,padding:0,minHeight:0,width:'fit-content',color:'#4b5563',justifyContent:'flex-start'}:{}),
  ...(node.variant==='section-heading'?{padding:0,minHeight:0,height:'auto',fontSize:18,fontWeight:600,color:'#202b38'}:{}),
  ...(['section-tab','filter-chip','add-button'].includes(node.variant||'')?{height:32,minHeight:32,width:'fit-content',padding:node.variant==='add-button'?'6px 12px':'6px 14px',borderRadius:999,flexWrap:'nowrap',fontSize:14,lineHeight:1.2}:{}),
  ...(node.variant==='nav-tab'?{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,padding:0,minHeight:0}:{}),
  ...(node.variant==='menu-thumbnail'?{width:80,height:80,minHeight:80,borderRadius:12}:{}),
  ...(node.variant==='menu-item-card'?{display:'flex',flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:16,gap:16,backgroundColor:'#FFFFFF',border:'1px solid #E5E7EB',borderRadius:16,flexWrap:'nowrap'}:{}),
  ...(node.variant==='primary-cta'?{display:'flex',flexDirection:'row',justifyContent:'center',alignItems:'center',backgroundColor:'#386650',color:'#ffffff',height:48,minHeight:48,padding:'12px 16px'}:{}),
  ...(positionMode(node)==='absolute'?{position:'absolute',left:node.x,top:node.y,width:node.width,height:node.height,minWidth:0,minHeight:0,maxWidth:'none',maxHeight:'none',flexGrow:0,flexShrink:0,flexBasis:'auto',alignSelf:'auto'}:{}),
  ...(node.type==='text'&&positionMode(node)==='absolute'?{display:'flex',alignItems:node.verticalAlign==='middle'?'center':node.verticalAlign==='bottom'?'flex-end':'flex-start',overflow:'hidden'}:{}),
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
 doc=normalizeCanvasPositions(doc);
 const render=(node:CanvasNode,parent?:CanvasNode):string=>{
  const style=flowNodeStyle(node,parent,{iconRow:isIconRow(doc,node),parentIconRow:isIconRow(doc,parent),childIcon:flowChildren(doc,node.id).some(child=>child.type==='icon')});
  const icon=hasInlineIcon(doc,node)&&['button','input','container'].includes(node.type)?`<span data-icon-wrapper="true" aria-hidden="true" style="${styleText(iconWrapperStyle(node))}"><img alt="" src="${escape(buttonIconUrl(node))}" style="${styleText(iconGlyphStyle(node))}"/></span>`:'';
  const content=node.type==='text'?`<span style="width:100%">${escape(node.text)}</span>`:node.type==='line'||node.type==='path'?`<svg width="100%" height="100%" viewBox="0 0 ${node.width} ${node.height}" style="overflow:visible"><polyline points="${(node.type==='line'?[0,0,node.width,node.height]:node.points||[]).join(' ')}" fill="none" stroke="${node.stroke}" stroke-width="${node.strokeWidth}"/></svg>`:node.type==='icon'||node.type==='image'?`<img alt="${escape(node.imageSource?.alt||node.name)}" src="${escape(flowAssetUrl(node,projectId))}" style="display:block;${node.type==='icon'?styleText(iconGlyphStyle(node)):'width:100%;height:100%;min-width:0;object-fit:'+ (node.imageFit==='contain'?'contain':'cover')+';border-radius:'+node.radius+'px'}"/>`:(node.type==='button'||node.type==='input'||node.type==='container'&&node.variant?icon+(icon?`<span data-icon-label="true">${escape(node.text)}</span>`:escape(node.text)):'')+flowChildren(doc,node.id).map(child=>render(child,node)).join('');
  if(node.type==='input'&&node.iconName)return `<div data-node-id="${escape(node.id)}" style="${escape(styleText({...style,flexDirection:'row',alignItems:'center'}))}">${icon}<input aria-label="${escape(node.name)}" placeholder="${escape(node.text)}" readonly style="border:0;padding:0;background:transparent;color:inherit;font:inherit;min-width:0;width:100%"/></div>`;
  if(node.type==='input')return `<input data-node-id="${escape(node.id)}" aria-label="${escape(node.name)}" placeholder="${escape(node.text)}" readonly style="${escape(styleText(style))}"/>`;
  const tag=node.type==='button'?'button':'div';
  return `<${tag}${node.type==='button'?' type="button"':''} data-node-id="${escape(node.id)}"${node.type==='icon'?' data-icon-wrapper="true"':''} style="${escape(styleText(style))}">${content}</${tag}>`;
 };
 const roots=flowChildren(doc);
 return `<div style="${styleText({...flowRootStyle,position:'relative',width:doc.width,minHeight:doc.height,maxWidth:'100%'})}">${roots.map(node=>render(node)).join('')}</div>`;
}
