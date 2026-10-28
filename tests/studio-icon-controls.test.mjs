import test from 'node:test';
import assert from 'node:assert/strict';
import { blankCanvas, renderCanvas } from '../src/lib/studio/canvas.ts';
import { flowNodeStyle } from '../src/lib/studio/canvas-layout.ts';
import { canvasToComponent, componentToCanvas, parseComponentProposal } from '../src/lib/studio/design-system.ts';
import { validateProposal, proposeCanvasWork } from '../src/lib/studio/agents/proposal.ts';

const proposal=upsert_nodes=>({mode:'edit',summary:'Populate discovery controls.',upsert_nodes,delete_ids:[]});
const control=(id,type,iconName,text,justifyContent='start')=>({
 id,parentId:'discovery',type,positionMode:'auto',layoutMode:'HORIZONTAL',
 primaryAxisSizingMode:'FILL',counterAxisSizingMode:'HUG',padding:16,itemSpacing:8,
 properties:{name:id,text,iconName,backgroundColor:'surface',color:'text',alignItems:'center',justifyContent,textAlign:justifyContent==='center'?'center':'left'},
});
const controls=[
 control('location','button','MapPin','Deliver to · Choose address'),
 control('search','input','Search','Search dishes or restaurants'),
 control('rating','button','Star','Rating 4.5+'),
 control('categories','button','Utensils','Browse cuisines'),
 control('home','button','House','Discover','center'),
 control('cart','button','ShoppingCart','Cart','center'),
];

test('discovery action accepts all six icon controls without a repair request and preserves alignment',async()=>{
 const base=validateProposal(proposal([{id:'discovery',parentId:null,type:'container',properties:{screenPreset:'mobile'}}]),blankCanvas()).document;
 let calls=0;
 const result=await proposeCanvasWork({key:'test',model:'test',role:'ui_designer',instruction:'Populate discovery controls',brief:'Food delivery',document:base,targetScreenId:'discovery',notes:[],images:[],requireEdits:true},async()=>{
  calls++;
  return Response.json({status:'completed',usage:{input_tokens:10,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(proposal(controls))}]}]});
 });
 assert.equal(calls,1);
 assert.equal(result.commands.length,6);
 for(const raw of controls){
  const node=result.document.nodes.find(node=>node.id===raw.id);
  assert.equal(node.layout.justifyContent,raw.properties.justifyContent);
  assert.equal(flowNodeStyle(node).justifyContent,raw.properties.justifyContent==='start'?'flex-start':'center');
  assert.equal(componentToCanvas(canvasToComponent(node)).layout.justifyContent,raw.properties.justifyContent);
 }
 const html=renderCanvas(result.document,'Discovery');
 assert.match(html,/<button[^>]*data-node-id="location"[^>]*justify-content:flex-start/);
 assert.match(html,/<button[^>]*data-node-id="home"[^>]*justify-content:center/);
});

test('icon control structural errors identify the layer and received fields',()=>{
 for(const patch of [{layoutMode:'VERTICAL'},{padding:8},{itemSpacing:16},{properties:{...controls[0].properties,alignItems:'start'}}]){
  assert.throws(()=>parseComponentProposal(proposal([{...controls[0],...patch}])),/Icon control “location” \(location\).*layoutMode HORIZONTAL.*alignItems center.*received/);
 }
 for(const type of ['button','input']){
  for(const justifyContent of ['start','center','end','space-between',null]){
   const raw=control('alignment',type,'Utensils','Browse',justifyContent);
   assert.doesNotThrow(()=>parseComponentProposal(proposal([raw])));
   const node=componentToCanvas(raw);
   assert.equal(node.layout.justifyContent,justifyContent??(type==='button'?'center':'start'));
  }
 }
});
