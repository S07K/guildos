'use client';
import { useRef, useState } from 'react';
import { CANVAS_WORKSPACE_MARGIN, CANVAS_WORKSPACE_SIZE, containingFrame, type CanvasDocument, type CanvasNode } from '@/lib/studio/canvas';
export type CanvasTool = 'select' | 'hand' | 'frame' | 'rectangle' | 'ellipse' | 'text' | 'line' | 'path';
export function CanvasSurface({ document: doc, tool, selected, onSelect, onChange, onCommit, disabled, framePreset }: { document: CanvasDocument; tool: CanvasTool; selected: string; onSelect: (id: string) => void; onChange: (doc: CanvasDocument) => void; onCommit: () => void; disabled: boolean; framePreset?: { width: number; height: number } | null }) {
 const root = useRef<HTMLDivElement>(null);
 const action = useRef<{ kind: 'move' | 'resize' | 'create'; x: number; y: number; node: CanvasNode; initial: CanvasDocument } | null>(null);
 const [editing, setEditing] = useState('');
 const worldWidth = CANVAS_WORKSPACE_SIZE, worldHeight = CANVAS_WORKSPACE_SIZE;
 const position = (event: React.PointerEvent) => { const bounds = root.current!.getBoundingClientRect(); return { x: (event.clientX-bounds.left)*worldWidth/bounds.width-CANVAS_WORKSPACE_MARGIN, y: (event.clientY-bounds.top)*worldHeight/bounds.height-CANVAS_WORKSPACE_MARGIN }; };
 const active = doc.nodes.find(node => node.id === selected && !node.hidden);
 const replace = (node: CanvasNode) => onChange({ ...doc, nodes: doc.nodes.map(item => item.id === node.id ? node : item) });
 return <div ref={root} data-testid="manual-canvas" style={{ width:worldWidth,height:worldHeight,position:'relative',background:'transparent',touchAction:'none',cursor:tool==='text'?'text':tool==='select'?'default':tool==='hand'?'grab':'crosshair',overflow:'visible' }} onPointerDown={event=>{
  if(disabled || tool==='hand' || editing || event.button!==0)return;
  const point=position(event); const target=(event.target as Element).closest('[data-node-id]'); const id=target?.getAttribute('data-node-id'); const node=doc.nodes.find(item=>item.id===id);
  if(tool==='select'){onSelect(node?.id||'');if(node){onCommit();action.current={kind:(event.target as Element).getAttribute('data-resize')?'resize':'move',...point,node:structuredClone(node),initial:doc};}else return;}
  else {onCommit();const type=tool as CanvasNode['type'];const created:CanvasNode={id:crypto.randomUUID(),type,name:type.charAt(0).toUpperCase()+type.slice(1)+' '+(doc.nodes.length+1),x:point.x,y:point.y,width:type==='text'?400:type==='frame'&&framePreset?framePreset.width:1,height:type==='text'?180:type==='frame'&&framePreset?framePreset.height:1,fill:type==='text'?'#202b38':type==='frame'?'#ffffff':'#a9c6ee',stroke:'#4d76af',strokeWidth:type==='frame'||type==='line'||type==='path'?2:0,radius:0,opacity:1,text:type==='text'?'Your text':'',fontSize:32,fontWeight:400,...(type==='path'?{points:[0,0]}:{})};onChange({...doc,nodes:[...doc.nodes,created]});onSelect(created.id);if(type==='text'||(type==='frame'&&framePreset)){return;}action.current={kind:'create',...point,node:created,initial:{...doc,nodes:[...doc.nodes,created]}};}
  event.currentTarget.setPointerCapture(event.pointerId);event.stopPropagation();
 }} onPointerMove={event=>{
  const current=action.current;if(!current)return;const point=position(event),dx=point.x-current.x,dy=point.y-current.y;let node={...current.node};
  if(current.kind==='move'){node.x+=dx;node.y+=dy;}else if(current.kind==='resize'){node.width=Math.max(8,node.width+dx);node.height=Math.max(8,node.height+dy);}else if(node.type==='path'){node.points=[...(node.points||[]),dx,dy];current.node=node;node.width=Math.max(1,Math.abs(dx));node.height=Math.max(1,Math.abs(dy));}else{node.x=Math.min(current.x,point.x);node.y=Math.min(current.y,point.y);node.width=Math.max(1,Math.abs(dx));node.height=Math.max(1,Math.abs(dy));}
  const parent=containingFrame(node,current.initial.nodes);if(parent)node.parentId=parent.id;else delete node.parentId;
  onChange({...current.initial,nodes:current.initial.nodes.map(item=>item.id===node.id?node:item)});event.stopPropagation();
 }} onPointerUp={()=>{action.current=null;}} onPointerCancel={()=>{action.current=null;}}>
  <svg width={worldWidth} height={worldHeight} viewBox={`0 0 ${worldWidth} ${worldHeight}`} style={{position:'absolute',inset:0,overflow:'visible'}} aria-label="Canvas shapes"><defs>{doc.nodes.filter(node=>node.type==='frame'&&!node.hidden).map(frame=><clipPath key={frame.id} id={`clip-${frame.id}`}><rect x={frame.x+CANVAS_WORKSPACE_MARGIN} y={frame.y+CANVAS_WORKSPACE_MARGIN} width={frame.width} height={frame.height} rx={frame.radius}/></clipPath>)}</defs>{[...doc.nodes.filter(node=>!node.hidden&&node.type==='frame'),...doc.nodes.filter(node=>!node.hidden&&node.type!=='frame')].map(node=>{
   const offset=CANVAS_WORKSPACE_MARGIN;
   const parentFrame=containingFrame(node,doc.nodes);
   const props={'data-node-id':node.id,fill:node.fill,stroke:node.stroke,strokeWidth:node.strokeWidth,opacity:node.opacity,...(parentFrame?{'clipPath':`url(#clip-${parentFrame.id})`}:{})};
   if(node.type==='text')return <foreignObject key={node.id} data-node-id={node.id} x={node.x+offset} y={node.y+offset} width={node.width} height={node.height}><div data-node-id={node.id} onDoubleClick={event=>{if(!disabled){const element=event.currentTarget;onCommit();setEditing(node.id);requestAnimationFrame(()=>element.focus());}}} contentEditable={editing===node.id} suppressContentEditableWarning role={editing===node.id?'textbox':undefined} aria-label={editing===node.id?'Edit text layer':undefined} onBlur={event=>{if(editing===node.id){replace({...node,text:event.currentTarget.textContent||''});setEditing('');}}} onKeyDown={event=>{if(event.key==='Escape')event.currentTarget.blur();event.stopPropagation();}} style={{width:'100%',height:'100%',color:node.fill,opacity:node.opacity,fontFamily:'var(--font-sans),sans-serif',fontSize:node.fontSize,fontWeight:node.fontWeight,lineHeight:1.2,whiteSpace:'pre-wrap',overflowWrap:'anywhere',outline:editing===node.id?'2px solid #386650':'none',overflow:'hidden',cursor:editing===node.id?'text':'inherit'}}>{node.text}</div></foreignObject>;
   if(node.type==='ellipse')return <ellipse key={node.id} {...props} cx={node.x+offset+node.width/2} cy={node.y+offset+node.height/2} rx={node.width/2} ry={node.height/2}/>;
   if(node.type==='line')return <line key={node.id} {...props} x1={node.x+offset} y1={node.y+offset} x2={node.x+offset+node.width} y2={node.y+offset+node.height}/>;
   if(node.type==='path')return <polyline key={node.id} {...props} fill="none" strokeLinecap="round" strokeLinejoin="round" points={(node.points||[]).map((point,index)=>point+(index%2?node.y+offset:node.x+offset)).join(' ')}/>;
   return <rect key={node.id} {...props} x={node.x+offset} y={node.y+offset} width={node.width} height={node.height} rx={node.radius}/>;
  })}</svg>
  {active&&tool==='select'&&!editing&&<div data-node-id={active.id} style={{position:'absolute',pointerEvents:'none',left:active.x+CANVAS_WORKSPACE_MARGIN,top:active.y+CANVAS_WORKSPACE_MARGIN,width:active.width,height:active.height,border:'1.5px solid #386650'}}><div data-node-id={active.id} data-resize="true" aria-label="Resize selected layer" style={{position:'absolute',right:-5,bottom:-5,width:9,height:9,background:'#fff',border:'1.5px solid #386650',pointerEvents:'auto',cursor:'nwse-resize'}}/></div>}
 </div>;
}
