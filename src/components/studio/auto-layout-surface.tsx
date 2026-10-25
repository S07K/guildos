'use client';
import { useState } from 'react';
import { CANVAS_WORKSPACE_MARGIN, type CanvasDocument, type CanvasNode } from '@/lib/studio/canvas';
import { buttonIconUrl, flowAssetUrl, flowChildren, flowNodeStyle, flowRootStyle, iconWrapperStyle, iconGlyphStyle, isIconRow } from '@/lib/studio/canvas-layout';

export function AutoLayoutSurface({document:doc,projectId,selected,onSelect,onChange,onCommit,disabled,hand,selecting}:{document:CanvasDocument;projectId:string;selected:string;onSelect:(id:string)=>void;onChange:(doc:CanvasDocument)=>void;onCommit:()=>void;disabled:boolean;hand:boolean;selecting:boolean}) {
 const [editing,setEditing]=useState('');
 const iconSlot=(node:CanvasNode)=><span data-icon-wrapper="true" aria-hidden="true" style={iconWrapperStyle(node)}><img draggable={false} alt="" src={buttonIconUrl(node)} style={iconGlyphStyle(node)}/></span>;
 const render=(node:CanvasNode,parent?:CanvasNode):React.ReactNode=><div key={node.id} data-node-id={node.id} data-auto-layout="true" data-icon-wrapper={node.type==='icon'?'true':undefined} style={{...flowNodeStyle(node,parent,{iconRow:isIconRow(doc,node),parentIconRow:isIconRow(doc,parent)}),visibility:node.hidden?'hidden':undefined,opacity:node.hidden?0:node.opacity,outline:node.id===selected?'2px solid #386650':undefined,outlineOffset:2,cursor:hand?'grab':'default',userSelect:editing===node.id?'text':'none'}}
  onPointerDown={event=>{if(disabled||hand||!selecting)return;event.stopPropagation();onSelect(node.id);}}
  onDoubleClick={event=>{if(disabled||hand||!selecting||node.type!=='text')return;event.stopPropagation();onCommit();setEditing(node.id);const element=event.currentTarget;requestAnimationFrame(()=>element.focus());}}
  contentEditable={node.type==='text'&&editing===node.id} suppressContentEditableWarning
  role={editing===node.id?'textbox':node.type==='button'?'button':undefined}  aria-label={editing===node.id?'Edit text layer':['button','input'].includes(node.type)?node.text||node.name:undefined}
  onBlur={event=>{if(editing!==node.id)return;onChange({...doc,nodes:doc.nodes.map(item=>item.id===node.id?{...item,text:event.currentTarget.textContent||''}:item)});setEditing('');}}
  onKeyDown={event=>{if(editing!==node.id)return;event.stopPropagation();if(event.key==='Escape')event.currentTarget.blur();}}>
  {node.type==='text'?node.text:node.type==='icon'||node.type==='image'?<img draggable={false} alt={node.imageSource?.alt||node.name} src={flowAssetUrl(node,projectId)} style={node.type==='icon'?iconGlyphStyle(node):{display:'block',width:'100%',height:'auto',minWidth:0,objectFit:node.imageFit==='contain'?'contain':'cover'}}/>:node.type==='input'?<>{node.iconName&&iconSlot(node)}<input readOnly tabIndex={-1} aria-label={node.name} placeholder={node.text} style={{border:0,padding:0,background:'transparent',color:'inherit',font:'inherit',width:'100%',minWidth:0,pointerEvents:'none'}}/></>:<>{node.type==='button'&&node.iconName&&iconSlot(node)}{node.type==='button'&&(node.iconName?<span data-icon-label="true">{node.text}</span>:node.text)}{flowChildren(doc,node.id).map(child=>render(child,node))}</>}
 </div>;
 return <>
  <div data-testid="auto-layout-root" style={{...flowRootStyle,position:'absolute',left:CANVAS_WORKSPACE_MARGIN,top:CANVAS_WORKSPACE_MARGIN,width:doc.width,minHeight:doc.height}}>{flowChildren(doc).map(node=>render(node))}</div>
  {doc.nodes.filter(node=>!node.flow&&node.type==='frame').map(frame=><div key={frame.id} style={{...flowRootStyle,flexDirection:'column',flexWrap:'nowrap',alignItems:'stretch',position:'absolute',left:frame.x+CANVAS_WORKSPACE_MARGIN,top:frame.y+CANVAS_WORKSPACE_MARGIN,width:frame.width,minHeight:frame.height,visibility:frame.hidden?'hidden':undefined,opacity:frame.hidden?0:frame.opacity}}>{flowChildren(doc,frame.id).map(node=>render(node))}</div>)}
 </>;
}
