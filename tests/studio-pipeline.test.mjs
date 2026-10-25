import test from 'node:test';
import assert from 'node:assert/strict';
import { blankCanvas } from '../src/lib/studio/canvas.ts';
import { componentToCanvas, canvasToComponent } from '../src/lib/studio/design-system.ts';
import { initialPipeline, advanceDraft, validateStageEdit, rejectOrApprove, pipelineIssues } from '../src/lib/studio/agents/pipeline.ts';
import { validateProposal, proposeCanvasWork } from '../src/lib/studio/agents/proposal.ts';
const node=(id,type,parentId=null,properties={})=>({id,type,parentId,layoutMode:'VERTICAL',primaryAxisSizingMode:'HUG',counterAxisSizingMode:'FILL',padding:0,itemSpacing:8,properties:{...(id==='screen'&&type==='container'&&parentId===null?{screenPreset:'mobile'}:{}),...properties}});
const document=()=>({...blankCanvas(),nodes:[componentToCanvas(node('screen','container')),componentToCanvas(node('title','text','screen',{text:'Welcome'})),componentToCanvas(node('cta','button','screen',{text:'Continue'}))]});
const state=(stage=0)=>({...initialPipeline(document(),'Active screen ID: screen\nBuild this screen',null),stage});
test('stage permissions enforce structure, surface-only direction, text-only copy and read-only QA',()=>{
 const base=state();
 const content=structuredClone(base.document);content.nodes[1].text='Different';
 assert.throws(()=>validateStageEdit(base,content),/structural containers only/);
 assert.throws(()=>validateStageEdit({...base,stage:1},content),/existing containers only/);
 assert.doesNotThrow(()=>validateStageEdit({...base,stage:3},content));
 const color=structuredClone(base.document);color.nodes[0].fill='#f3f4f6';
 assert.doesNotThrow(()=>validateStageEdit({...base,stage:1},color));
 assert.throws(()=>validateStageEdit({...base,stage:3},color),/only existing text values/);
 assert.throws(()=>validateStageEdit({...base,stage:4},color),/read-only/);
});
test('screen identifier remains locked for creation, deletion and reparenting',()=>{
 const base=state(2);
 const other=componentToCanvas(node('other','container'));
 base.document.nodes.push(other);
 const moved=structuredClone(base.document);moved.nodes[1].parentId='other';
 assert.throws(()=>validateStageEdit(base,moved),/exactly one active screen/);
 const rootDeleted=structuredClone(base.document);rootDeleted.nodes=rootDeleted.nodes.filter(node=>node.id!=='screen');
 assert.throws(()=>validateStageEdit(base,rootDeleted));
 const newRoot=structuredClone(base.document);newRoot.nodes.push(componentToCanvas(node('third','container')));
 assert.throws(()=>validateStageEdit(base,newRoot),/exactly one active screen/);
});
test('QA cannot approve pre-existing contrast or missing flex issues and preserves every finding',()=>{
 const draft=state(4);draft.document.nodes[1].fill='#ffffff';delete draft.document.nodes[0].layout;
 const before=structuredClone(draft.document);
 const warnings=Array.from({length:23},(_,i)=>({agent_role:'ui_designer',message:`Warning ${i}`}));
 const next=rejectOrApprove(draft,warnings);
 assert.ok(next.stage<4);assert.ok(next.issues.length>23);assert.deepEqual(next.document,before);
 assert.ok(next.issues.some(issue=>issue.message.includes('flex direction')));
 assert.ok(next.issues.some(issue=>issue.message.includes('contrast')));
 assert.throws(()=>rejectOrApprove({...draft,round:3},warnings),/No canvas changes were published/);
 assert.equal(rejectOrApprove(state(4),[]).stage,5);
});
test('pipeline reports a missing layoutMode back to the same agent before staging it',async()=>{
 let calls=0;
 const initial=initialPipeline(blankCanvas(),'Create the home screen',null);
 const valid=node('screen','container');
 const result=await proposeCanvasWork({key:'test',model:'test',role:'ux_architect',instruction:'Build',brief:'A home screen',document:initial.document,notes:[],pipeline:initial},async(_url,options)=>{
  const body=JSON.parse(options.body);calls++;
  if(calls===2)assert.match(body.instructions,/requires an explicit layoutMode/);
  const root={...valid};if(calls===1)delete root.layoutMode;
  return Response.json({status:'completed',usage:{input_tokens:1,output_tokens:1},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({mode:'edit',summary:'Structure prepared',upsert_nodes:[root],delete_ids:[],handoff:null,stage_complete:true})}]}]});
 });
 assert.equal(calls,2);assert.equal(advanceDraft(initial,result).stage,1);
});
test('surface and text proposal roundtrips preserve all other node properties',()=>{
 const base=state(1);const surface=canvasToComponent(base.document.nodes[0]);surface.properties.backgroundColor='#f3f4f6';
 const edited=validateProposal({mode:'edit',summary:'Theme',upsert_nodes:[surface],delete_ids:[]},base.document,[],'screen',true);
 assert.doesNotThrow(()=>validateStageEdit(base,edited.document));
 assert.equal(pipelineIssues(state(4)).length,0);
});

test('database JSON key ordering does not turn surface-only Direction edits into layout changes',()=>{
 const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,reorder(item)])):value;
 const base=reorder(state(1));
 const header=componentToCanvas(node('onboarding-header','container','screen',{name:'Onboarding header'}));
 base.document.nodes.push(reorder(header));
 const surface=canvasToComponent(header);surface.properties.backgroundColor='#f3f4f6';
 const result=validateProposal({mode:'edit',summary:'Style header surface',upsert_nodes:[surface],delete_ids:[]},base.document,[],'screen',true);
 assert.doesNotThrow(()=>validateStageEdit(base,result.document));
 assert.equal(advanceDraft(base,{...result,stageComplete:true}).stage,2);
 const forbidden=structuredClone(result.document);forbidden.nodes.find(node=>node.id===header.id).layout.gap=24;
 assert.throws(()=>validateStageEdit(base,forbidden),/Preserve these fields: layout/);
 const moved=structuredClone(result.document);moved.nodes.find(node=>node.id===header.id).parentId='title';
 assert.throws(()=>validateStageEdit(base,moved));
});

test('database key ordering also preserves text-only Copywriter permissions',()=>{
 const base=state(3);
 base.document.nodes=base.document.nodes.map(node=>({...node,...(node.layout?{layout:Object.fromEntries(Object.entries(node.layout).reverse())}:{}),sizing:Object.fromEntries(Object.entries(node.sizing).reverse())}));
 const button=canvasToComponent(base.document.nodes.find(node=>node.id==='cta'));button.properties.text='Get started';
 const result=validateProposal({mode:'edit',summary:'Refine CTA',upsert_nodes:[button],delete_ids:[]},base.document,[],'screen',true);
 assert.doesNotThrow(()=>validateStageEdit(base,result.document));
});
