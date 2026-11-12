import { inSubtree, isRevisionRequest, requestedChanges, resolveLayerReference, resolveRevisionScope, assertRevisionScope, type RevisionScope } from '../revision-scope.ts';
import { sanitizeVisualHierarchy } from '../visual-hierarchy.ts';
import { isDeepStrictEqual } from 'node:util';
import type { CanvasDocument, CanvasNode } from '../canvas.ts';
import type { CanvasCommand } from '../canvas-commands.ts';
import type { AgentRole } from '../agent-roles.ts';
import { activeScreenId, screenDocument, screenRoot, validateScreenEdits } from '../screen-scope.ts';
import { componentQualityIssues, screenCompositionIssues } from '../canvas-quality.ts';

export class PipelineGateError extends Error {}

export const pipelineRoles = ['ux_architect','creative_director','ui_designer','copywriter','qa_critic'] as const;
export type PipelineIssue = {agent_role:AgentRole;message:string};
export type PipelineState = {
 stage:number;action:number;round:number;targetScreenId:string;baseVersionId:string|null;
 document:CanvasDocument;commands:CanvasCommand[];issues:PipelineIssue[];focusNodeIds?:string[];newScreenTransition?:boolean; executionMode?:'SURGICAL_REVISION'|'CREATE_NEW_SCREEN'|'EDIT_SCREEN'; revisionScope?:RevisionScope; targetLayerId?:string;
};
export const stageInstructions = [
 'Create ONLY the active mobile screen root and nested structural containers/grid. If active_screen_id is not already in current_canvas, create a new root with that exact ID and preserve every existing root frame unchanged as an archived screen. Never recycle or modify an old screen root to create the requested screen. Set the root width to 375px (mobile). Root height may HUG or use flexible sizing with an 812px minimum. Do not create text, images, icons or controls. Preserve existing content. Leave theme styling for the next stage.',
 'Style existing structural containers with theme colors, background fills, borders and surface radii. Do not create/delete nodes, change layout, or write text.',
 'Populate the structure with functional components, verified Unsplash assets and valid Lucide icons in atomic flex rows. Preserve the root screen. Supply provisional meaningful labels; the next stage refines copy.',
 'Refine text on existing text, button and input nodes only. Do not create/delete nodes or alter styling, layout, images or icons.',
 'Audit only. Never edit the document. Report every problem with its responsible specialist.',
] as const;
export function initialPipeline(document:CanvasDocument,instruction:string,baseVersionId:string|null,isRevision=false):PipelineState {
 const revision=isRevisionRequest(instruction,isRevision);
 const mentionedLayerId=resolveLayerReference(document,instruction);
 const targetScreenId=(mentionedLayerId?screenRoot(document,mentionedLayerId)?.id:undefined)||activeScreenId(document,isRevision?`Requested changes: ${instruction}`:instruction)||'screen';
 const targetLayerId=resolveLayerReference(document,instruction,targetScreenId);
 if(requestedChanges(instruction).match(/\u2063guildos-layer:([a-z0-9-]{1,80})\u2063/i)&&!targetLayerId)throw new Error('The referenced layer is no longer on this canvas. Select it again before sending the request.');
 const matchedScope=revision&&!targetLayerId&&screenRoot(document,targetScreenId)?resolveRevisionScope(document,targetScreenId,instruction):undefined;
 const revisionScope=screenRoot(document,targetScreenId)&&(targetLayerId||matchedScope)?{rootId:targetScreenId,sectionId:targetLayerId||matchedScope!.sectionId,snapshot:structuredClone(document),allowSectionDelete:!!targetLayerId&&/\b(remove|delete)\b/i.test(instruction)}:undefined;
 return {executionMode:revision?'SURGICAL_REVISION':!screenRoot(document,targetScreenId)?'CREATE_NEW_SCREEN':'EDIT_SCREEN',revisionScope,targetLayerId,stage:0,action:0,round:0,targetScreenId,baseVersionId,document,commands:[],issues:[],newScreenTransition:!screenRoot(document,targetScreenId)};
}
const changedKeys=(a:CanvasNode,b:CanvasNode)=>Object.keys({...a,...b}).filter(key=>!isDeepStrictEqual(a[key as keyof CanvasNode],b[key as keyof CanvasNode]));
const surfaceKeys=['fill','backgroundColor','stroke','strokeWidth','textColor','opacity'] as const;
const neutralSurface={fill:'#ffffff',stroke:'#d1d5db',textColor:'#202b38'};
const restoreKeys=(old:CanvasNode,node:CanvasNode,keys:readonly string[]):CanvasNode=>{
 const next={...node} as Record<string,unknown>,previous=old as unknown as Record<string,unknown>;
 for(const key of keys){if(key in previous)next[key]=previous[key];else delete next[key];}
 return next as unknown as CanvasNode;
};
/**
 * Mechanically undoes edits outside a stage's remit instead of failing the run.
 * Models often restyle while structuring or nudge layout while styling; those
 * slips are corrected here, and only genuine violations reach validateStageEdit.
 */
export function normalizeStageEdit(state:PipelineState,after:CanvasDocument):CanvasDocument {
 const before=new Map(state.document.nodes.map(node=>[node.id,node]));
 const nodes=after.nodes.map(node=>{
  const old=before.get(node.id);
  if(old&&isDeepStrictEqual(old,node))return node;
  if(state.stage===0&&node.type==='container'){
   if(!old)return {...node,...neutralSurface};
   if(old.type==='container'||old.type==='frame')return restoreKeys(old,node,surfaceKeys.filter(key=>!isDeepStrictEqual(old[key],node[key])));
  }
  if(state.stage===1&&old&&old.type==='container'&&node.type==='container'){
   const allowed=['fill','backgroundColor','stroke','strokeWidth','radius','opacity'];
   return restoreKeys(old,node,changedKeys(old,node).filter(key=>!allowed.includes(key)));
  }
  if(state.stage===3&&old&&old.type===node.type){
   const keys=changedKeys(old,node).filter(key=>key!=='text'||!['text','button','input'].includes(node.type));
   return restoreKeys(old,node,keys);
  }
  return node;
 });
 return {...after,nodes};
}
/** Keeps the audit commands in step with a normalized document. */
export function alignStageCommands(base:CanvasDocument,commands:CanvasCommand[],document:CanvasDocument):CanvasCommand[] {
 const before=new Map(base.nodes.map(node=>[node.id,node])),after=new Map(document.nodes.map(node=>[node.id,node]));
 return commands.flatMap((command):CanvasCommand[]=>{
  if(command.type==='create'){const node=after.get(command.node.id);return node?[{type:'create',node}]:[];}
  if(command.type!=='update')return [command];
  const old=before.get(command.id),node=after.get(command.id);
  if(!old||!node)return [command];
  const patch=Object.fromEntries(Object.keys(command.patch).filter(key=>!isDeepStrictEqual(old[key as keyof CanvasNode],node[key as keyof CanvasNode])).map(key=>[key,node[key as keyof CanvasNode]]));
  return Object.keys(patch).length?[{type:'update',id:command.id,patch}]:[];
 });
}
/** Existing node IDs a stage may edit; null means the stage may create structure or components. */
export function stageEditableIds(state:PipelineState):string[]|null {
 const nodes=screenDocument(state.document,state.targetScreenId).nodes;
 if(state.stage===1)return nodes.filter(node=>node.type==='container').map(node=>node.id);
 if(state.stage===3)return nodes.filter(node=>['text','button','input'].includes(node.type)).map(node=>node.id);
 return null;
}
const stageNodeTypes:Partial<Record<number,string[]>>={0:['container'],1:['container'],3:['text','button','input']};
/**
 * Encodes stage permissions in the structured-output schema itself, so a constrained provider
 * cannot emit a node type or ID outside the stage's remit (e.g. Direction restyling a chip).
 */
export function stageProposalSchema<T extends {properties:Record<string,any>}>(state:PipelineState,base:T):T {
 const schema=structuredClone(base);
 const item=schema.properties.upsert_nodes?.items;
 if(!item?.properties)return schema;
 const types=stageNodeTypes[state.stage];
 if(types)item.properties.type={type:'string',enum:types};
 const ids=stageEditableIds(state);
 if(ids?.length)item.properties.id={type:'string',enum:ids};
 return schema;
}
/**
 * Providers without constrained decoding can still return out-of-remit operations. Drop them
 * before validation (stages 1 and 3 never create or delete; stage 0 only builds containers)
 * instead of failing the whole run; validateStageEdit still guards the result.
 */
export function scopeStageProposal(state:PipelineState,proposal:Record<string,unknown>):{proposal:Record<string,unknown>;dropped:string[]} {
 if(!Array.isArray(proposal.upsert_nodes))return {proposal,dropped:[]};
 const ids=stageEditableIds(state),allowedIds=ids&&new Set(ids),types=stageNodeTypes[state.stage];
 const dropped:string[]=[];
 const upsert_nodes=proposal.upsert_nodes.filter((node:any)=>{
  const keep=(!allowedIds||allowedIds.has(node?.id))&&(!types||types.includes(node?.type));
  if(!keep)dropped.push(String(node?.id));
  return keep;
 });
 const deletes=Array.isArray(proposal.delete_ids)?proposal.delete_ids:[];
 const delete_ids=state.stage===1||state.stage===3?[]:deletes;
 if(delete_ids!==deletes)dropped.push(...deletes.map(id=>`delete:${String(id)}`));
 return {proposal:{...proposal,upsert_nodes,delete_ids},dropped};
}
export function validateStageEdit(state:PipelineState,after:CanvasDocument) {
 if(state.revisionScope)assertRevisionScope(state.revisionScope,after);
 const before=new Map(state.document.nodes.map(node=>[node.id,node]));
 const next=new Map(after.nodes.map(node=>[node.id,node]));
 const changed=[...new Set([...before.keys(),...next.keys()])].filter(id=>!isDeepStrictEqual(before.get(id),next.get(id)));
 validateScreenEdits(state.document,after,changed,state.targetScreenId,!screenRoot(state.document,state.targetScreenId));
 if(after.background!==state.document.background||after.width!==state.document.width||after.height!==state.document.height)throw new Error('The workspace outside the locked screen is read-only.');
 for(const id of changed){
  const old=before.get(id),node=next.get(id);
  if(state.stage===0){
   if((node&&node.type!=='container')||(old&&old.type!=='container'&&old.type!=='frame'))throw new Error(`UX may edit structural containers only: ${id}.`);
   if(node&&(node.text||node.iconName||node.imageUrl))throw new Error(`UX may not populate content: ${id}.`);
   if(old&&node&&changedKeys(old,node).some(key=>['fill','backgroundColor','stroke','strokeWidth','textColor','opacity'].includes(key)))throw new Error(`UX must preserve surface styling for Direction: ${id}.`);
   if(!old&&node&&(node.fill!=='#ffffff'||node.stroke!=='#d1d5db'||node.textColor!=='#202b38'))throw new Error(`New UX structure must use neutral default colors; Direction applies the theme: ${id}.`);
  }else if(state.stage===1){
   const allowed=['fill','backgroundColor','stroke','strokeWidth','radius','opacity'];
   if(!old||!node||old.type!=='container'||node.type!=='container')throw new Error(`Direction may style existing containers only: ${id}. Preserve node identity and type.`);
   const forbidden=changedKeys(old,node).filter(key=>!allowed.includes(key));
   if(forbidden.length)throw new Error(`Direction may change only existing container surface styling: ${id}. Preserve these fields: ${forbidden.join(', ')}.`);
  }else if(state.stage===2){
   if(id===state.targetScreenId)throw new Error('UI must preserve the locked root frame; structural corrections belong to UX.');
  }else if(state.stage===3){
   if(!old||!node||!['text','button','input'].includes(node.type)||changedKeys(old,node).some(key=>key!=='text'))throw new Error(`Copywriting may change only existing text values: ${id}.`);
  }else throw new Error('QA is read-only.');
 }
 if(!next.has(state.targetScreenId))throw new Error('The locked screen root must exist after the structure stage.');
}
export function pipelineIssues(state:PipelineState):PipelineIssue[] {
 const scoped=screenDocument(state.document,state.targetScreenId);
 const issues=[...screenCompositionIssues(scoped),...componentQualityIssues(scoped)];
 for(const node of scoped.nodes){
  if(!node.flow||!['container','text','image','icon','button','input'].includes(node.type))issues.push({key:`component:${node.id}`,message:`“${node.name}” must use the component flex contract before publication.`});
  if(node.type==='container'&&!['row','column'].includes(node.layout?.direction||''))issues.push({key:`layout:${node.id}`,message:`“${node.name}” requires an explicit horizontal or vertical flex direction.`});
 }

 const relevant=state.revisionScope?issues.filter(issue=>scoped.nodes.some(node=>node.id!==state.targetScreenId&&inSubtree(scoped,node.id,state.revisionScope!.sectionId)&&issue.key.split(':').includes(node.id))):issues;
 return relevant.map(issue=>{const node=scoped.nodes.find(node=>issue.key.split(':').includes(node.id));return {agent_role:issue.key==='single-screen'||issue.key.startsWith('mobile-screen:')||node?.type==='container'&&!issue.key.startsWith('screen-content:')&&!issue.key.startsWith('menu-')?'ux_architect':'ui_designer',message:issue.message};});
}
/** Actions one stage may take; matches checkpoint_studio_pipeline, which accepts action 0-7. */
export const MAX_STAGE_ACTIONS=8;
export function advanceDraft(state:PipelineState,result:{document:CanvasDocument;commands:CanvasCommand[];stageComplete?:boolean}):PipelineState {
 validateStageEdit(state,result.document);
 // A stage that keeps polishing hands off at the cap instead of failing the run; QA reports anything left.
 const complete=!!result.stageComplete||state.action>=MAX_STAGE_ACTIONS-1;
 const document=sanitizeVisualHierarchy(result.document,state.targetScreenId,state.revisionScope);
 if(state.revisionScope)assertRevisionScope(state.revisionScope,document);
 return {...state,document,commands:[...state.commands,...result.commands],stage:state.stage+(complete?1:0),action:complete?0:state.action+1};
}
export function rejectOrApprove(state:PipelineState,reported:PipelineIssue[]):PipelineState {
 if(state.stage!==4)throw new Error('Only the final QA stage can approve a turn.');
 state={...state,document:sanitizeVisualHierarchy(state.document,state.targetScreenId,state.revisionScope)};
 if(state.revisionScope)assertRevisionScope(state.revisionScope,state.document);
 // Model findings and deterministic checks both need a responsible correction stage.
 const issues=[...pipelineIssues(state),...reported.filter(issue=>pipelineRoles.slice(0,4).includes(issue.agent_role)&&typeof issue.message==='string'&&!!issue.message.trim())];
 if(!issues.length)return {...state,stage:5,issues:[]};
 if(state.round>=3)throw new PipelineGateError(`Structural screen requirements remained incomplete after three correction rounds. No canvas changes were published.\n${issues.map(issue=>issue.message).join('\n')}`);
 const stage=Math.min(...issues.map(issue=>Math.max(0,pipelineRoles.indexOf(issue.agent_role as typeof pipelineRoles[number]))));
 return {...state,stage:Math.min(stage,3),action:0,round:state.round+1,issues};
}
