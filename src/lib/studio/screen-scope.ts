import type { CanvasDocument, CanvasNode } from './canvas.ts';

export const screenScopeInstruction=(id:string,instruction:string)=>`Active screen ID: ${id}\n${instruction}`;
export function screenRoot(document:CanvasDocument,id:string):CanvasNode|undefined {
 const nodes=new Map(document.nodes.map(node=>[node.id,node]));
 let node=nodes.get(id);const seen=new Set<string>();
 while(node?.parentId){if(seen.has(node.id))return undefined;seen.add(node.id);node=nodes.get(node.parentId);}
 return node;
}
/** A durable marker takes priority; otherwise resolve the named screen before falling back. */
export function activeScreenId(document:CanvasDocument,instruction:string):string|undefined {
 const marker=instruction.match(/^Active screen ID: ([a-z0-9-]{1,80})$/im)?.[1];
 if(marker)return marker;
 const roots=document.nodes.filter(node=>!node.parentId&&(node.screen||node.type==='frame'));
 const normalized=instruction.toLowerCase().replace(/[-_]/g,' ');
 const named=instruction.match(/\b(home(?: feed)?|checkout|tracking|profile|account|cart|restaurant(?: details?)?|payment|login|sign[- ]?in|search|dashboard|favorites)\s+(?:screen|page|view)\b/i)?.[1].toLowerCase().replace(/\s+/g,'-');
 if(named){
  const match=roots.find(root=>`${root.id} ${root.name}`.toLowerCase().replace(/[-_]/g,' ').includes(named.replaceAll('-',' ')));
  if(match)return match.id;
  if(roots.length)return `${named}-screen`;
 }
 return roots.find(root=>normalized.includes(root.id.toLowerCase().replace(/[-_]/g,' '))||root.name.length>3&&normalized.includes(root.name.toLowerCase()))?.id||roots[0]?.id;
}
export function screenDocument(document:CanvasDocument,id?:string):CanvasDocument {
 if(!id)return document;
 return {...document,width:375,height:812,nodes:document.nodes.filter(node=>screenRoot(document,node.id)?.id===id)};
}
/** Check both sides of moves/deletions so another screen cannot be pulled into the active one. */
export function validateScreenEdits(before:CanvasDocument,after:CanvasDocument,changed:Iterable<string>,target?:string) {
 const roots=new Set<string>();
 for(const id of changed)for(const doc of [before,after]){const root=screenRoot(doc,id);if(root)roots.add(root.id);}
 if(roots.size>1||target&&[...roots].some(id=>id!==target))throw new Error('Each generation turn may edit exactly one active screen. Other screens must remain unchanged.');
 const id=target||[...roots][0];
 const root=id?after.nodes.find(node=>node.id===id):undefined;
 if(root&&(!root.screen||root.parentId||root.width!==375||root.layout?.direction!=='column'))throw new Error('The active screen must be one 375px mobile Screen Frame.');
 return id;
}
