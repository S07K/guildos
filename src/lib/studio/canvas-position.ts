import { containingFrame, type CanvasDocument, type CanvasNode } from './canvas.ts';

export type NodeGeometry = Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'>;
export const positionMode = (node:CanvasNode) => node.positionMode ?? (node.flow ? 'auto' : 'absolute');

/** Legacy SVG layers stored world coordinates; modern layers store parent-local coordinates. */
export function normalizeCanvasPositions(doc:CanvasDocument):CanvasDocument {
 const nodes=doc.nodes.map(node=>{
  if(node.positionMode)return node;
  const parent=doc.nodes.find(item=>item.id===node.parentId)||(!node.flow?containingFrame(node,doc.nodes):undefined);
  return {...node,positionMode:positionMode(node),...(parent?{parentId:parent.id}:{}),
   ...(!node.flow&&parent&&!parent.flow?{x:node.x-parent.x,y:node.y-parent.y}:{})};
 });
 // Older flow artboards all stored (0,0); keep them visibly distinct while
 // honoring explicit non-overlapping artboard positions. This is render-only.
 const placed:CanvasNode[]=[];
 for(let index=0;index<nodes.length;index++){
  const node=nodes[index];if(!node.screen||node.parentId||node.positionMode!=='auto')continue;
  if(placed.some(other=>node.x<other.x+other.width&&node.x+node.width>other.x&&node.y<other.y+other.height&&node.y+node.height>other.y))nodes[index]={...node,x:Math.max(...placed.map(other=>other.x+other.width))+64};
  placed.push(nodes[index]);
 }
 return {...doc,nodes};
}

export function drawingBounds(start:{x:number;y:number},end:{x:number;y:number}):NodeGeometry {
 return {x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(end.x-start.x),height:Math.abs(end.y-start.y)};
}

/** Positioning a container never changes the layout of its children. */
export function absoluteNode(node:CanvasNode,geometry:NodeGeometry):CanvasNode {
 return {...node,...geometry,positionMode:'absolute'};
}

export function createCanvasNode(type:CanvasNode['type'],id:string,overrides:Partial<CanvasNode>={}):CanvasNode {
 return {id,type,name:type.charAt(0).toUpperCase()+type.slice(1),positionMode:'auto',flow:true,
  x:0,y:0,width:100,height:100,fill:type==='text'?'#202b38':type==='frame'?'#ffffff':'#a9c6ee',
  stroke:'#4d76af',strokeWidth:['frame','line','path'].includes(type)?2:0,radius:0,opacity:1,
  text:type==='text'?'Your text':'',fontSize:32,fontWeight:400,sizing:{width:'fixed',height:type==='text'?'hug-contents':'fixed'},
  ...(['frame','container','button','input'].includes(type)?{layout:{direction:'column',gap:0,padding:0,alignItems:'start',justifyContent:'start'} as CanvasNode['layout']}:{}),
  ...(type==='path'?{points:[0,0]}:{}),...overrides};
}
