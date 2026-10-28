import { isRevisionRequest, requestedChanges } from './revision-scope.ts';
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
 if(!roots.length)return 'screen';
 // Common transposition in short design prompts must not silently route back
 // to the first existing screen; normalize before resolving screen intent.
 const revision=isRevisionRequest(instruction);
 const normalized=(revision?requestedChanges(instruction):instruction).toLowerCase().replace(/\bdesing\b|\bdesgin\b/g,'design').replace(/[-_]/g,' ').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
 if(revision)return roots.find(root=>normalized.includes(root.id.toLowerCase().replace(/[-_]/g,' '))||root.name.length>3&&normalized.includes(root.name.toLowerCase()))?.id||roots.at(-1)?.id;
 const names=['restaurant discovery','restaurant details','restaurant feed','restaurant info','home feed','discovery','sign in','checkout','tracking','profile','account','payment','dashboard','favorites','orders','menu','search','cart','login','home','feed'] as const;
 const navPrefix='\\b(?:go|move|switch|navigate|open)\\s+(?:over\\s+)?(?:to|into)\\s+(?:the\\s+)?';
 const actionPrefix='\\b(?:design|create|make|build|add|start)\\b';
 const suffix='\\s+(?:screen|page|view)\\b';
 const known=names.find(name=>{
  const escaped=name.replace(/\s+/g,'\\s+');
  return new RegExp(`${navPrefix}${escaped}\\b`).test(normalized)||new RegExp(`${actionPrefix}[\\s\\S]{0,70}\\b${escaped}\\b${suffix}`).test(normalized);
 });
 const namedScreen=normalized.match(new RegExp(`${actionPrefix}\\s+(?:(?:a|an|the|new|another|next)\\s+){0,3}([a-z0-9][a-z0-9 ]{0,38}?)${suffix}`));
 const namedAfterScreen=normalized.match(/\b(?:new|another|next)\s+(?:screen|page|view)\s+(?:for|named|called)\s+(?:the\s+)?([a-z0-9][a-z0-9 ]{0,38})/);
 const namedAfterNavigation=normalized.match(/\b(?:go|move|switch|navigate|open)\s+(?:over\s+)?(?:to|into)\s+(?:the\s+)?([a-z0-9][a-z0-9 ]{0,38})/);
 const genericTransition=/\b(?:design|create|make|build|add|start|go|move|switch|navigate|open)\b[\s\S]{0,40}\b(?:the\s+)?(?:next|new|another)\s+(?:screen|page|view)\b/.test(normalized);
 const transitionName=(namedAfterScreen?.[1]||namedScreen?.[1]||known||namedAfterNavigation?.[1]||'').trim().replace(/\b(?:and|then|with|please)\b.*$/,'').replace(/\s+/g,' ');
 if(genericTransition&&!namedAfterScreen&&!known||['next','new','another'].includes(transitionName)){
  let index=roots.length+1,candidate=`screen-${index}`;
  while(document.nodes.some(node=>node.id===candidate))candidate=`screen-${++index}`;
  return candidate;
 }
 if(transitionName){
  const slug=transitionName.replace(/\s+/g,'-').slice(0,56);
  const explicitlyNew=/\b(?:new|another|next)\s+(?:[a-z0-9][a-z0-9 ]{0,38}\s+)?(?:screen|page|view)\b/.test(normalized)||!!namedAfterScreen;
  const match=!explicitlyNew&&roots.find(root=>`${root.id} ${root.name}`.toLowerCase().replace(/[-_]/g,' ').includes(transitionName));
  if(match)return match.id;
  const base=`${slug}-screen`;let candidate=base,index=2;
  while(document.nodes.some(node=>node.id===candidate))candidate=`${slug}-${index++}-screen`;
  return candidate;
 }
 return roots.find(root=>normalized.includes(root.id.toLowerCase().replace(/[-_]/g,' '))||root.name.length>3&&normalized.includes(root.name.toLowerCase()))?.id||roots[0]?.id;
}
export function screenDocument(document:CanvasDocument,id?:string):CanvasDocument {
 if(!id)return document;
 return {...document,width:375,height:812,nodes:document.nodes.filter(node=>screenRoot(document,node.id)?.id===id)};
}
/** Check both sides of moves/deletions so another screen cannot be pulled into the active one. */
export function validateScreenEdits(before:CanvasDocument,after:CanvasDocument,changed:Iterable<string>,target?:string,allowCreateTarget=false) {
 const roots=new Set<string>();
 for(const id of changed)for(const doc of [before,after]){const root=screenRoot(doc,id);if(root)roots.add(root.id);}
 const creatingTarget=!!target&&allowCreateTarget&&!screenRoot(before,target)&&screenRoot(after,target)?.id===target;
 if(allowCreateTarget&&!creatingTarget)throw new Error('A new screen transition must create the requested screen root before editing its contents.');
 if(creatingTarget)for(const oldRoot of before.nodes.filter(node=>!node.parentId&&(node.screen||node.type==='frame'))){
  const kept=after.nodes.find(node=>node.id===oldRoot.id);
  if(!kept||JSON.stringify(kept)!==JSON.stringify(oldRoot))throw new Error(`Archived screen “${oldRoot.name}” must remain unchanged during a new-screen transition.`);
 }
 if(roots.size>1||target&&[...roots].some(id=>id!==target))throw new Error('Each generation turn may edit exactly one active screen. Other screens must remain unchanged.');
 const id=target||[...roots][0];
 const root=id?after.nodes.find(node=>node.id===id):undefined;
 if(root&&(!root.screen||root.parentId||root.width!==375||root.layout?.direction!=='column'))throw new Error('The active screen must be one 375px mobile Screen Frame.');
 return id;
}
