import type { CanvasDocument } from './canvas.ts';
import { screenRoot } from './screen-scope.ts';

export type RevisionScope = {rootId:string;sectionId:string; snapshot:CanvasDocument;allowSectionDelete?:boolean};
export const requestedChanges=(instruction:string)=>instruction.split(/Requested changes:\s*/i).at(-1)!.replace(/^Active screen ID: .*\n/im,'').trim();
export const isRevisionRequest=(instruction:string,isRevision=false)=>isRevision||/Requested changes:/i.test(instruction)||/\b(fix|revise|change|remove|duplicate|navigation bar|go back)\b/i.test(requestedChanges(instruction));
const targetMarker=/\u2063guildos-layer:([a-z0-9-]{1,80})\u2063/i;
export const encodeLayerReference=(id:string)=>`\u2063guildos-layer:${id}\u2063`;
/** Translate the visible #layer name back to its stable node ID. */
export function resolveLayerReference(document:CanvasDocument,instruction:string,rootId?:string):string|undefined {
 const text=requestedChanges(instruction);
 const marker=text.match(targetMarker)?.[1];
 if(marker&&document.nodes.some(node=>node.id===marker)&&(!rootId||screenRoot(document,marker)?.id===rootId))return marker;
 let latest:{id:string;index:number;length:number}|undefined;
 for(const node of document.nodes){
  if(rootId&&screenRoot(document,node.id)?.id!==rootId)continue;
  for(const alias of new Set([node.name,node.name.replace(/\s+/g,'_'),node.id])){
   if(!alias)continue;
   let index=text.indexOf(`#${alias}`);
   while(index>=0){
    const end=text[index+1+alias.length]||'';
    if(!/[\p{L}\p{N}_-]/u.test(end)&&(!latest||index>latest.index||index===latest.index&&alias.length>latest.length))latest={id:node.id,index,length:alias.length};
    index=text.indexOf(`#${alias}`,index+1);
   }
  }
 }
 return latest?.id;
}
export function inSubtree(document:CanvasDocument,id:string,ancestor:string):boolean {
 const seen=new Set<string>();let node=document.nodes.find(node=>node.id===id);
 while(node&&!seen.has(node.id)){if(node.id===ancestor)return true;seen.add(node.id);node=document.nodes.find(item=>item.id===node!.parentId);}
 return false;
}
export function resolveRevisionScope(document:CanvasDocument,rootId:string,instruction:string):RevisionScope {
 const text=requestedChanges(instruction).toLowerCase();
 const candidates=document.nodes.filter(node=>node.id!==rootId&&screenRoot(document,node.id)?.id===rootId);
 const aliases=/\b(bottom.?nav|navigation bar|nav bar|navigation tabs)\b/i.test(text)?/bottom.?nav|navigation|nav.bar|tab.bar/i:/\bheader\b/i.test(text)?/header/i:/\b(footer|cart bar)\b/i.test(text)?/footer|cart.bar/i:undefined;
 const section=candidates.find(node=>['container','button','frame'].includes(node.type)&&aliases?.test(`${node.id} ${node.name}`))||candidates.find(node=>text.includes(node.id.toLowerCase()))||candidates.find(node=>node.name.length>3&&text.includes(node.name.toLowerCase()));
 if(aliases&&!section)throw new Error('SURGICAL_REVISION: the requested section could not be resolved; specify its layer name or ID.');
 // Ambiguous revisions may edit descendants, but the screen root remains immutable.
 return {rootId,sectionId:section?.id||rootId,snapshot:structuredClone(document)};
}
export function assertRevisionScope(scope:RevisionScope,after:CanvasDocument) {
 const before=scope.snapshot;
 for(const old of before.nodes){
  const next=after.nodes.find(node=>node.id===old.id);
  if(old.id===scope.rootId||!inSubtree(before,old.id,scope.sectionId)){
   if(JSON.stringify(old)!==JSON.stringify(next))throw new Error(`SURGICAL_REVISION: locked layer ${old.id} must remain unchanged.`);
  }else if(next&&!inSubtree(after,next.id,scope.sectionId))throw new Error(`SURGICAL_REVISION: cannot move ${old.id} outside the locked subtree.`);
 }
 for(const node of after.nodes)if(!before.nodes.some(old=>old.id===node.id)&&!inSubtree(after,node.id,scope.sectionId))throw new Error('SURGICAL_REVISION: new layers must belong to the locked subtree.');
 if(!scope.allowSectionDelete&&!after.nodes.some(node=>node.id===scope.sectionId))throw new Error('SURGICAL_REVISION: preserve the target section container.');
}
