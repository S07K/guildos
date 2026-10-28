import { CANVAS_WORKSPACE_SIZE, type CanvasNode } from '@/lib/studio/canvas';
import type { NodeGeometry } from '@/lib/studio/canvas-position';

export function canvasElement(root:HTMLElement,id:string) {
 return root.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`);
}

/** The workspace rect includes zoom and scroll/pan; use the same scale on both axes. */
export function localPointer(root:HTMLElement,parent:HTMLElement,clientX:number,clientY:number) {
 const scale=root.getBoundingClientRect().width/CANVAS_WORKSPACE_SIZE;
 const bounds=parent.getBoundingClientRect();
 return {x:(clientX-bounds.left)/scale-parent.clientLeft+parent.scrollLeft,y:(clientY-bounds.top)/scale-parent.clientTop+parent.scrollTop};
}

export function measureCanvasNode(root:HTMLElement,node:CanvasNode):NodeGeometry {
 const element=canvasElement(root,node.id);
 if(!element?.parentElement)return {x:node.x,y:node.y,width:node.width,height:node.height};
 const bounds=element.getBoundingClientRect(),scale=root.getBoundingClientRect().width/CANVAS_WORKSPACE_SIZE;
 return {...localPointer(root,element.parentElement,bounds.left,bounds.top),width:bounds.width/scale,height:bounds.height/scale};
}
