import test from 'node:test';
import assert from 'node:assert/strict';
import {blankCanvas} from '../src/lib/studio/canvas.ts';
import {componentToCanvas,componentProposalSchema} from '../src/lib/studio/design-system.ts';
import {initialPipeline,stageProposalSchema,scopeStageProposal} from '../src/lib/studio/agents/pipeline.ts';

const node=(id,type='container',parentId=null,properties={})=>({id,parentId,type,positionMode:'auto',layoutMode:'VERTICAL',primaryAxisSizingMode:'HUG',counterAxisSizingMode:'FILL',padding:16,itemSpacing:8,properties:{name:id,...properties}});
const screen=()=>({...blankCanvas(),nodes:[
 componentToCanvas(node('shop')),
 componentToCanvas(node('shop-chips','container','shop')),
 componentToCanvas(node('shop-chip-all','button','shop-chips',{text:'All',variant:'filter-chip'})),
 componentToCanvas(node('shop-title','text','shop',{text:'New arrivals'})),
]});
const stage=(n)=>({...initialPipeline(screen(),'Design the shop screen',null),stage:n,targetScreenId:'shop'});

test('Direction schema only offers existing containers; copy schema only existing text controls',()=>{
 const direction=stageProposalSchema(stage(1),componentProposalSchema).properties.upsert_nodes.items.properties;
 assert.deepEqual(direction.type.enum,['container']);
 assert.deepEqual(direction.id.enum.sort(),['shop','shop-chips']);
 const copy=stageProposalSchema(stage(3),componentProposalSchema).properties.upsert_nodes.items.properties;
 assert.deepEqual(copy.id.enum.sort(),['shop-chip-all','shop-title']);
 const ui=stageProposalSchema(stage(2),componentProposalSchema).properties.upsert_nodes.items.properties;
 assert.equal(ui.id.enum,undefined);
});

test('Direction restyling a chip is dropped instead of failing the run',()=>{
 const {proposal,dropped}=scopeStageProposal(stage(1),{mode:'edit',summary:'Theme',upsert_nodes:[node('shop-chips'),node('shop-chip-all','button','shop-chips',{text:'All'}),node('new-card','container','shop')],delete_ids:['shop-title']});
 assert.deepEqual(proposal.upsert_nodes.map(item=>item.id),['shop-chips']);
 assert.deepEqual(proposal.delete_ids,[]);
 assert.deepEqual(dropped,['shop-chip-all','new-card','delete:shop-title']);
});

test('a stage that never reports completion hands off at the checkpoint action cap instead of failing',async()=>{
 const {advanceDraft,MAX_STAGE_ACTIONS}=await import('../src/lib/studio/agents/pipeline.ts');
 const state={...stage(2),action:MAX_STAGE_ACTIONS-1};
 const next=advanceDraft(state,{document:state.document,commands:[],stageComplete:false});
 assert.equal(next.stage,3);assert.equal(next.action,0);
 const mid=advanceDraft({...stage(2),action:2},{document:state.document,commands:[],stageComplete:false});
 assert.equal(mid.stage,2);assert.equal(mid.action,3);
});
