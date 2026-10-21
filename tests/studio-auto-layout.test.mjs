import test from 'node:test';
import assert from 'node:assert/strict';
import {blankCanvas,validateCanvas,renderCanvas} from '../src/lib/studio/canvas.ts';
import {applyCanvasCommands} from '../src/lib/studio/canvas-commands.ts';
import {validateProposal,proposalSchema} from '../src/lib/studio/agents/proposal.ts';
import {agentCanvasDocument} from '../src/lib/studio/canvas-layout.ts';
import {canvasQualityIssues} from '../src/lib/studio/canvas-quality.ts';

const node=(id,type,parentId=null)=>({id,type,name:id,parentId,width:'fill-container',height:'hug-contents',direction:type==='container'?'column':null,gap:16,padding:16,alignItems:'stretch',justifyContent:'start',fill:'#ffffff',stroke:'#202b38',strokeWidth:0,radius:8,opacity:1,text:type==='text'?'Long interface copy '.repeat(30):'',fontSize:18,fontWeight:400});
const component=(id,type,parentId=null)=>({id,type,parentId,layoutMode:'VERTICAL',primaryAxisSizingMode:'HUG',counterAxisSizingMode:'FILL',padding:16,itemSpacing:16,properties:{text:type==='text'?'Long interface copy '.repeat(30):'',color:'text'}});
test('agent schema describes components and renders nested flex instead of coordinates',()=>{
 const properties=proposalSchema.properties.upsert_nodes.items.properties;
 assert.equal(properties.x,undefined);assert.equal(properties.y,undefined);assert.equal(properties.width,undefined);
 assert.deepEqual(properties.layoutMode.enum,['VERTICAL','HORIZONTAL']);
 const result=validateProposal({mode:'edit',summary:'Nested screen',upsert_nodes:[component('screen','container'),{...component('actions','container','screen'),layoutMode:'HORIZONTAL',properties:{alignItems:'center'}},component('label','text','actions')],delete_ids:[]},blankCanvas());
 const context=agentCanvasDocument(result.document);
 assert.equal(context.nodes[2].x,undefined);assert.equal(context.nodes[2].primaryAxisSizingMode,'HUG');
 assert.equal(result.document.nodes[2].parentId,'actions');
 assert.equal(result.document.nodes[2].sizing.height,'hug-contents');
 assert.deepEqual(canvasQualityIssues(result.document),[]);
 const html=renderCanvas(result.document,'Preview');
 assert.match(html,/display:flex;flex-direction:row/);assert.match(html,/gap:16px/);assert.match(html,/height:auto/);assert.match(html,/overflow-wrap:anywhere/);assert.doesNotMatch(html,/<foreignObject/);
});
test('HTTP commands accept relational fields and reject invalid nested relationships atomically',()=>{
 const base=applyCanvasCommands(blankCanvas(),[{type:'create',node:node('screen','container')},{type:'create',node:node('row','container','screen')},{type:'create',node:node('label','text','row')}]);
 const updated=applyCanvasCommands(base,[{type:'update',id:'row',patch:{direction:'row',gap:24}},{type:'update',id:'label',patch:{width:'hug-contents'}}]);
 assert.equal(updated.nodes[1].layout.direction,'row');assert.equal(updated.nodes[1].layout.gap,24);
 assert.equal(updated.nodes[2].sizing.width,'hug-contents');
 assert.throws(()=>applyCanvasCommands(base,[{type:'update',id:'screen',patch:{parentId:'row'}}]),/cycle/);
 assert.throws(()=>applyCanvasCommands(base,[{type:'update',id:'row',patch:{parentId:'label'}}]),/parent/);
 assert.equal(base.nodes[0].parentId,undefined);
 assert.throws(()=>validateCanvas({...updated,nodes:updated.nodes.map(item=>item.id==='row'?{...item,layout:{...item.layout,gap:-1}}:item)}),/layout/);
});
