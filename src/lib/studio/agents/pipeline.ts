import { isDeepStrictEqual } from 'node:util';
import type { CanvasDocument, CanvasNode } from '../canvas.ts';
import type { CanvasCommand } from '../canvas-commands.ts';
import type { AgentRole } from '../agent-roles.ts';
import { activeScreenId, screenDocument, validateScreenEdits } from '../screen-scope.ts';
import { canvasQualityIssues, screenCompositionIssues } from '../canvas-quality.ts';

export class PipelineGateError extends Error {}

export const pipelineRoles = ['ux_architect','creative_director','ui_designer','copywriter','qa_critic'] as const;
export type PipelineIssue = {agent_role:AgentRole;message:string};
export type PipelineState = {
 stage:number;action:number;round:number;targetScreenId:string;baseVersionId:string|null;
 document:CanvasDocument;commands:CanvasCommand[];issues:PipelineIssue[];
};
export const stageInstructions = [
 'Create ONLY the active root mobile screen and nested structural containers/grid. Do not create text, images, icons or controls. Preserve existing content. Leave theme styling for the next stage.',
 'Style existing structural containers with theme colors, background fills, borders and surface radii. Do not create/delete nodes, change layout, or write text.',
 'Populate the structure with functional components, verified Unsplash assets and valid Lucide icons in atomic flex rows. Preserve the root screen. Supply provisional meaningful labels; the next stage refines copy.',
 'Refine text on existing text, button and input nodes only. Do not create/delete nodes or alter styling, layout, images or icons.',
 'Audit only. Never edit the document. Report every problem with its responsible specialist.',
] as const;
export function initialPipeline(document:CanvasDocument,instruction:string,baseVersionId:string|null):PipelineState {
 return {stage:0,action:0,round:0,targetScreenId:activeScreenId(document,instruction)||'screen',baseVersionId,document,commands:[],issues:[]};
}
const changedKeys=(a:CanvasNode,b:CanvasNode)=>Object.keys({...a,...b}).filter(key=>!isDeepStrictEqual(a[key as keyof CanvasNode],b[key as keyof CanvasNode]));
export function validateStageEdit(state:PipelineState,after:CanvasDocument) {
 const before=new Map(state.document.nodes.map(node=>[node.id,node]));
 const next=new Map(after.nodes.map(node=>[node.id,node]));
 const changed=[...new Set([...before.keys(),...next.keys()])].filter(id=>!isDeepStrictEqual(before.get(id),next.get(id)));
 validateScreenEdits(state.document,after,changed,state.targetScreenId);
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
 const issues=[...canvasQualityIssues(scoped),...screenCompositionIssues(scoped)];
 for(const node of scoped.nodes){
  if(!node.flow||!['container','text','image','icon','button','input'].includes(node.type))issues.push({key:`component:${node.id}`,message:`“${node.name}” must use the component flex contract before publication.`});
  if(node.type==='container'&&!['row','column'].includes(node.layout?.direction||''))issues.push({key:`layout:${node.id}`,message:`“${node.name}” requires an explicit horizontal or vertical flex direction.`});
 }

 return issues.map(issue=>{const node=scoped.nodes.find(node=>issue.key.split(':').includes(node.id));return {agent_role:issue.key==='single-screen'||issue.key.startsWith('mobile-screen:')||node?.type==='container'&&!issue.key.startsWith('screen-content:')?'ux_architect':'ui_designer',message:issue.message};});
}
export function advanceDraft(state:PipelineState,result:{document:CanvasDocument;commands:CanvasCommand[];stageComplete?:boolean}):PipelineState {
 validateStageEdit(state,result.document);
 if(!result.stageComplete&&state.action>=7)throw new PipelineGateError('This stage exceeded eight actions. The private draft was not published.');
 return {...state,document:result.document,commands:[...state.commands,...result.commands],stage:state.stage+(result.stageComplete?1:0),action:result.stageComplete?0:state.action+1};
}
export function rejectOrApprove(state:PipelineState,reported:PipelineIssue[]):PipelineState {
 if(state.stage!==4)throw new Error('Only the final QA stage can approve a turn.');
 const issues=[...pipelineIssues(state),...reported];
 if(!issues.length)return {...state,stage:5,issues:[]};
 if(state.round>=3)throw new PipelineGateError(`QA rejected this turn after three correction rounds. No canvas changes were published.\n${issues.map(issue=>issue.message).join('\n')}`);
 const stage=Math.min(...issues.map(issue=>Math.max(0,pipelineRoles.indexOf(issue.agent_role as typeof pipelineRoles[number]))));
 return {...state,stage:Math.min(stage,3),action:0,round:state.round+1,issues};
}
