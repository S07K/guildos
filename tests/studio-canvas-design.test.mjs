import test from 'node:test';
import assert from 'node:assert/strict';
import { blankCanvas, renderCanvas, validateCanvas } from '../src/lib/studio/canvas.ts';
import { canvasQualityIssues } from '../src/lib/studio/canvas-quality.ts';
import { designSkillPrompt, skillsForAgent } from '../src/lib/studio/design-skills.ts';
import { proposalSchema, validateProposal } from '../src/lib/studio/agents/proposal.ts';

const text=(id,x,y,value='A readable heading')=>({id,type:'text',name:id,x,y,width:260,height:65,fill:'#202b38',stroke:'#ffffff',strokeWidth:0,radius:0,opacity:1,text:value,fontSize:24,fontWeight:600});
test('canvas text and private image layers validate and render',()=>{
 const assetId='0dd7f3e6-53c6-4d18-ae16-6f398af4a682',projectId='5dc5126b-e09e-4895-9ee7-89cf6013211a';
 const doc={...blankCanvas(),nodes:[{...text('title',20,30),textAlign:'center',verticalAlign:'middle',lineHeight:1.4,letterSpacing:1.5},{...text('photo',20,120,''),type:'image',assetId,imageFit:'contain'}]};
 assert.equal(validateCanvas(doc),doc);
 const html=renderCanvas(doc,'Preview',projectId);
 assert.match(html,/text-align:center/);assert.match(html,/align-items:center/);assert.match(html,/letter-spacing:1.5px/);
 assert.match(html,new RegExp(`/api/studio/assets/${assetId}\\?projectId=${projectId}`));
 assert.match(html,/object-fit:contain/);
 assert.throws(()=>validateCanvas({...doc,nodes:[{...doc.nodes[1],assetId:'not-a-uuid'}]}));
});

test('design skills are selected by role and included in prompts',()=>{
 assert.deepEqual(skillsForAgent('copywriter','Improve copy').map(skill=>skill.id),['typography']);
 assert.deepEqual(skillsForAgent('ui_designer','Arrange photos').map(skill=>skill.id),['layout','typography','imagery','accessibility']);
 assert.match(designSkillPrompt('qa_critic','Review'),/clipping or overlap/);
});

test('agent components preserve text styles and reject pixel geometry and unavailable assets',()=>{
 const properties=proposalSchema.properties.upsert_nodes.items.properties.properties.properties;
 for(const field of ['textAlign','assetId','imageFit','backgroundColor','borderRadius'])assert.ok(properties[field]);
 const node={id:'title',parentId:'screen',type:'text',properties:{text:'A readable heading',color:'text',fontSize:24,textAlign:'center'}};
 const proposal={mode:'edit',summary:'Added text',upsert_nodes:[{id:'screen',parentId:null,type:'container',properties:{}},node],delete_ids:[]};
 const result=validateProposal(proposal,blankCanvas());
 assert.equal(result.document.nodes[1].textAlign,'center');assert.equal(result.document.nodes[1].flow,true);
 assert.throws(()=>validateProposal({...proposal,upsert_nodes:[{...node,x:20}]},blankCanvas()),/Unrecognized key/);
 assert.throws(()=>validateProposal({...proposal,upsert_nodes:[{...node,type:'image',properties:{assetId:'0dd7f3e6-53c6-4d18-ae16-6f398af4a682'}}]},blankCanvas()),/reuse an uploaded asset/);
});

test('layout checks keep text in separate frames independent',()=>{
 const frame=(id)=>({...text(id,0,0,''),type:'frame',width:350,height:500});
 const doc={...blankCanvas(),nodes:[frame('home'),frame('menu'),{...text('home-label',20,20),parentId:'home'},{...text('menu-label',20,20),parentId:'menu'}]};
 assert.deepEqual(canvasQualityIssues(doc),[]);
});
