'use client';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { AutoLayoutSurface } from './auto-layout-surface';
import { canvasElement, localPointer, measureCanvasNode } from './canvas-geometry';
import { absoluteNode, createCanvasNode, drawingBounds, normalizeCanvasPositions, type NodeGeometry } from '@/lib/studio/canvas-position';
import { CANVAS_WORKSPACE_SIZE, type CanvasDocument, type CanvasNode } from '@/lib/studio/canvas';
import type { AgentRole } from '@/lib/studio/agent-roles';
import { AgentCursor } from './agent-cursor';
export type CanvasTool = 'select' | 'hand' | 'frame' | 'rectangle' | 'ellipse' | 'text' | 'line' | 'path';

type Gesture = {
 kind:'move'|'resize'|'create'; pointerId:number; parent:HTMLElement; start:{x:number;y:number};
 client:{x:number;y:number}; node:CanvasNode; initial:CanvasDocument; original:CanvasDocument;
 selection:string; started:boolean; tool:CanvasTool; points:number[];
};
const bounded=(node:CanvasNode):CanvasNode=>({...node,x:Math.round(Math.max(-20000,Math.min(20000,node.x))),y:Math.round(Math.max(-20000,Math.min(20000,node.y))),width:Math.round(Math.max(1,Math.min(20000,node.width))),height:Math.round(Math.max(1,Math.min(20000,node.height)))});

export function CanvasSurface({document:doc,projectId,tool,selected,onSelect,onChange,onCommit,onToolChange,onGeometryChange,disabled,framePreset,agentCursor}:{document:CanvasDocument;projectId:string;tool:CanvasTool;selected:string;onSelect:(id:string)=>void;onChange:(doc:CanvasDocument)=>void;onCommit:()=>void;onToolChange:(tool:CanvasTool)=>void;onGeometryChange?:(geometry:NodeGeometry|null)=>void;disabled:boolean;framePreset?:{width:number;height:number}|null;agentCursor?:{role:AgentRole;nodeIds:string[]}}) {
 const root=useRef<HTMLDivElement>(null);
 const action=useRef<Gesture|null>(null);
 const lastPressedId=useRef('');
 const [editing,setEditing]=useState('');
 const [preview,setPreview]=useState<CanvasNode|null>(null);
 const [selectionBounds,setSelectionBounds]=useState<NodeGeometry|null>(null);
 const [cursorPosition,setCursorPosition]=useState<{x:number;y:number}|null>(null);
 const cancel=()=>{
  const current=action.current;if(!current)return;
  action.current=null;setPreview(null);
  if(current.started&&current.kind!=='create')onChange(current.original);
  onSelect(current.selection);
  if(current.kind==='create')onToolChange('select');
  if(root.current?.hasPointerCapture(current.pointerId))root.current.releasePointerCapture(current.pointerId);
 };
 useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){if(editing){if(root.current)canvasElement(root.current,editing)?.blur();setEditing('');window.getSelection()?.removeAllRanges();}else cancel();}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);});
 useEffect(()=>{if(action.current&&(disabled||tool!==action.current.tool))cancel();},[disabled,tool]);
 useLayoutEffect(()=>{if(editing&&root.current)canvasElement(root.current,editing)?.focus();},[editing]);
 useLayoutEffect(()=>{
  const node=doc.nodes.find(item=>item.id===selected),element=root.current;
  if(!node||node.hidden||!element){onGeometryChange?.(null);setSelectionBounds(null);return;}
  const measure=()=>{
   onGeometryChange?.(measureCanvasNode(element,node));
   const target=canvasElement(element,node.id);if(!target)return;
   if(getComputedStyle(target).visibility==='hidden'){setSelectionBounds(null);return;}
   const rect=target.getBoundingClientRect(),workspace=element.getBoundingClientRect(),scale=workspace.width/CANVAS_WORKSPACE_SIZE;
   const next={x:(rect.left-workspace.left)/scale,y:(rect.top-workspace.top)/scale,width:rect.width/scale,height:rect.height/scale};
   setSelectionBounds(previous=>previous&&Object.keys(next).every(key=>previous[key as keyof NodeGeometry]===next[key as keyof NodeGeometry])?previous:next);
  };
  measure();const observer=new ResizeObserver(measure),target=canvasElement(element,node.id);
  if(target)element.querySelectorAll('[data-node-id]').forEach(item=>observer.observe(item));
  return()=>observer.disconnect();
 },[doc,selected,onGeometryChange]);
 useLayoutEffect(()=>{
  const element=root.current;
  const targets=(agentCursor?.nodeIds||[]).map(id=>doc.nodes.find(node=>node.id===id)).filter((node):node is CanvasNode=>!!node&&!node.hidden);
  if(!element){setCursorPosition(null);return;}
  if(!targets.length){setCursorPosition({x:CANVAS_WORKSPACE_SIZE/2,y:CANVAS_WORKSPACE_SIZE/2});return;}
  const measure=()=>{
   const target=targets.map(node=>canvasElement(element,node.id)).find(Boolean);
   if(!target){setCursorPosition({x:CANVAS_WORKSPACE_SIZE/2,y:CANVAS_WORKSPACE_SIZE/2});return;}
   const rect=target.getBoundingClientRect(),workspace=element.getBoundingClientRect(),scale=workspace.width/CANVAS_WORKSPACE_SIZE;
   setCursorPosition({x:(rect.left-workspace.left)/scale,y:(rect.top-workspace.top)/scale});
  };
  measure();const observer=new ResizeObserver(measure);element.querySelectorAll('[data-node-id]').forEach(item=>observer.observe(item));
  return()=>observer.disconnect();
 },[agentCursor,doc]);

 const update=(event:PointerEvent<HTMLDivElement>,final=false)=>{
  const current=action.current;if(!current||event.pointerId!==current.pointerId||!root.current)return null;
  const point=localPointer(root.current,current.parent,event.clientX,event.clientY);
  const dx=point.x-current.start.x,dy=point.y-current.start.y;
  const moved=Math.hypot(event.clientX-current.client.x,event.clientY-current.client.y)>2;
  if(!current.started&&!moved&&current.kind!=='create')return null;
  let node=current.node;
  if(current.kind==='move')node=absoluteNode(node,{x:node.x+dx,y:node.y+dy,width:node.width,height:node.height});
  else if(current.kind==='resize')node=absoluteNode(node,{x:node.x,y:node.y,width:node.width+dx,height:node.height+dy});
  else if(node.type==='path'){
   current.points.push(point.x,point.y);
   const xs=current.points.filter((_,i)=>i%2===0),ys=current.points.filter((_,i)=>i%2===1),x=Math.min(...xs),y=Math.min(...ys);
   node={...node,x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y,points:current.points.map((value,i)=>value-(i%2?y:x)).slice(0,2000)};
  }else node={...node,...drawingBounds(current.start,point)};
  if(current.kind==='create'){
   if(final&&!moved){
    if(node.type==='text')node={...node,width:400,height:180};
    else if(node.type==='frame'&&framePreset)node={...node,...framePreset};
    else return null;
   }
   if(final&&(node.width<1||node.height<1)&&!['line','path'].includes(node.type))return null;
   setPreview(final?null:node);
  }else{
  if(!current.started){onCommit();current.started=true;}
   node=bounded(node);
  let nodes=current.initial.nodes.map(item=>item.id===node.id?node:item);
  // Absolute children leave flex sizing. Freeze their immediate Auto Layout parent
  // at its measured box before removing the child from flow, or HUG parents collapse.
  if(current.kind==='move'&&node.parentId){
   const parent=current.initial.nodes.find(item=>item.id===node.parentId);
   if(parent?.flow&&parent.layout&&parent.positionMode!=='absolute'&&root.current){
    const size=measureCanvasNode(root.current,parent);
    nodes=nodes.map(item=>item.id===parent.id?{...item,width:Math.round(size.width),height:Math.round(size.height),sizing:{...item.sizing,width:'fixed',height:'fixed'}}:item);
   }
  }
  onChange({...current.initial,nodes});
  }
  return final?bounded(node):node;
 };
 const down=(event:PointerEvent<HTMLDivElement>)=>{
  if(action.current){if(event.pointerId!==action.current.pointerId)cancel();return;}
  if(disabled||tool==='hand'||event.button!==0||!event.isPrimary)return;
  const target=event.target as Element;
  if(target.closest('[contenteditable="true"]'))return;
  const workspace=root.current!,initial=normalizeCanvasPositions(doc);
  const hit=target.closest<HTMLElement>('[data-node-id]');
  const node=initial.nodes.find(item=>item.id===(target.closest('[data-resize-node]')?.getAttribute('data-resize-node')||hit?.dataset.nodeId));
  let parent=workspace.querySelector<HTMLElement>('[data-testid="auto-layout-root"]')!;
  let chosen:CanvasNode,kind:Gesture['kind'];
  if(tool==='select'){
   lastPressedId.current=node?.id||'';onSelect(node?.id||'');if(!node)return;
   parent=canvasElement(workspace,node.id)!.parentElement!;
   chosen={...node,...measureCanvasNode(workspace,node)};
   kind=target.closest('[data-resize]')?'resize':'move';
  }else{
   let container=node;
   while(container&&!['container','frame'].includes(container.type))container=initial.nodes.find(item=>item.id===container?.parentId);
   if(container)parent=canvasElement(workspace,container.id)!;
   const point=localPointer(workspace,parent,event.clientX,event.clientY);
   chosen=createCanvasNode(tool,crypto.randomUUID(),{positionMode:'absolute',parentId:container?.id,...point,width:0,height:0,name:`${tool.charAt(0).toUpperCase()+tool.slice(1)} ${doc.nodes.length+1}`});
   kind='create';setPreview(chosen);
  }
  const start=localPointer(workspace,parent,event.clientX,event.clientY);
  action.current={kind,pointerId:event.pointerId,parent,start,client:{x:event.clientX,y:event.clientY},node:chosen,initial,original:doc,selection:selected,started:false,tool,points:[start.x,start.y]};
  // Capture on the stable workspace, never on a node whose position/layout may change.
  workspace.setPointerCapture(event.pointerId);event.stopPropagation();
 };
 const up=(event:PointerEvent<HTMLDivElement>)=>{
  const current=action.current;if(!current||current.pointerId!==event.pointerId)return;
  const node=update(event,true);
  action.current=null;setPreview(null);
  if(current.kind==='create'){
   if(node){onCommit();onChange({...current.initial,nodes:[...current.initial.nodes,node]});onSelect(node.id);}
   onToolChange('select');
  }
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  event.stopPropagation();
 };
 const display=preview?{...normalizeCanvasPositions(doc),nodes:[...normalizeCanvasPositions(doc).nodes,preview]}:doc;
 return <div ref={root} data-testid="manual-canvas" className={!['select','hand','text'].includes(tool)?'cursor-crosshair':undefined} style={{width:CANVAS_WORKSPACE_SIZE,height:CANVAS_WORKSPACE_SIZE,position:'relative',touchAction:'none',userSelect:'none',WebkitUserSelect:'none',cursor:tool==='text'?'text':tool==='select'?'default':tool==='hand'?'grab':'crosshair',overflow:'visible'}}
  onDoubleClick={event=>{
   if(disabled||tool!=='select')return;
   const id=(event.target as Element).closest<HTMLElement>('[data-node-id]')?.dataset.nodeId||lastPressedId.current;
   if(doc.nodes.find(node=>node.id===id)?.type!=='text')return;
   onCommit();setEditing(id);
   event.preventDefault();event.stopPropagation();
  }}
  onPointerDown={down} onPointerMove={event=>{if(action.current?.pointerId===event.pointerId){update(event);event.stopPropagation();}}} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel}>
  <AutoLayoutSurface document={display} projectId={projectId} onChange={onChange} editing={editing} onEditingChange={setEditing}/>
  {agentCursor&&cursorPosition&&<AgentCursor role={agentCursor.role} x={cursorPosition.x} y={cursorPosition.y}/>}
  {selectionBounds&&selected&&tool==='select'&&!disabled&&!editing&&<div data-export-ignore="true" data-selection-overlay="true" style={{position:'absolute',pointerEvents:'none',left:selectionBounds.x,top:selectionBounds.y,width:selectionBounds.width,height:selectionBounds.height,outline:'1px solid #4d76af',outlineOffset:2,zIndex:2}}>
   <span data-export-ignore="true" data-resize="true" data-resize-node={selected} aria-label="Resize selected layer" style={{position:'absolute',right:-7,bottom:-7,width:9,height:9,boxSizing:'border-box',background:'#fff',border:'1px solid #4d76af',pointerEvents:'auto',cursor:'nwse-resize'}}/>
  </div>}
 </div>;
}
