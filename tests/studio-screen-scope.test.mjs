import test from 'node:test';
import assert from 'node:assert/strict';
import {blankCanvas,renderCanvas} from '../src/lib/studio/canvas.ts';
import {componentToCanvas,componentProposalSchema} from '../src/lib/studio/design-system.ts';
import {validateProposal,proposeCanvasWork,auditPipeline} from '../src/lib/studio/agents/proposal.ts';
import {initialPipeline,rejectOrApprove} from '../src/lib/studio/agents/pipeline.ts';
import {activeScreenId,screenScopeInstruction} from '../src/lib/studio/screen-scope.ts';
import {normalizeUiIconName,uiIconNames} from '../src/lib/studio/ui-icons.ts';
import {renderIconSvg} from '../src/lib/studio/icon-library.ts';
import {flowNodeStyle} from '../src/lib/studio/canvas-layout.ts';
import {taskDisplay} from '../src/lib/studio/task-display.ts';

const node=(id,type='container',parentId=null,properties={})=>({id,type,parentId,layoutMode:properties.iconName&&['button','input'].includes(type)?'HORIZONTAL':'VERTICAL',primaryAxisSizingMode:type==='icon'?'FIXED':'HUG',counterAxisSizingMode:type==='icon'?'FIXED':'FILL',padding:properties.iconName&&['button','input'].includes(type)?16:0,itemSpacing:properties.iconName&&['button','input'].includes(type)?8:0,properties:{...properties,...(properties.iconName&&['button','input'].includes(type)?{alignItems:'center'}:{})}});
const edit=(upsert_nodes=[],delete_ids=[])=>({mode:'edit',summary:'Refined the active screen.',upsert_nodes,delete_ids});
const response=value=>Response.json({status:'completed',usage:{input_tokens:3,output_tokens:4},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
const base=()=>({...blankCanvas(),nodes:[componentToCanvas(node('home','container',null,{name:'Home Feed Screen'})),componentToCanvas(node('home-title','text','home',{text:'Welcome'})),componentToCanvas(node('home-go','button','home',{text:'Explore'})),componentToCanvas(node('checkout','container',null,{name:'Checkout Screen'})),componentToCanvas(node('checkout-title','text','checkout',{text:'Your order'}))]});

test('screen validation rejects multi-root generation, cross-screen edits, reparenting and deletions atomically',()=>{
 const blank=blankCanvas();
 assert.throws(()=>validateProposal(edit([node('home'),node('checkout')]),blank),/exactly one active screen/);
 const document=base(),original=structuredClone(document);
 for(const proposal of [edit([node('checkout-title','text','checkout',{text:'Changed'})]),edit([node('checkout-title','text','home',{text:'Pulled across'})]),edit([],['checkout']),edit([node('second-screen')])])assert.throws(()=>validateProposal(proposal,document,[],'home'),/exactly one active screen/);
 const valid=validateProposal(edit([node('home-title','text','home',{text:'Discover lunch'})]),document,[],'home');
 assert.deepEqual(valid.document.nodes.filter(item=>item.id.startsWith('checkout')),original.nodes.filter(item=>item.id.startsWith('checkout')));
 assert.deepEqual(document,original);
 assert.throws(()=>validateProposal(edit([node('nested','container','home',{screenPreset:'mobile'})]),document,[],'home'),/never nest screens/);
});

test('pipeline, specialist and QA keep one target even with other screens present',async()=>{
 const document=base();
 assert.equal(activeScreenId(document,'Refine the Checkout Screen'),'checkout');
 assert.equal(activeScreenId(document,'Build the Tracking Screen'),'tracking-screen');
 const plan=initialPipeline(document,'Refine Home Feed Screen and Checkout Screen',null);
 assert.equal(plan.targetScreenId,'home');
 await proposeCanvasWork({key:'test',model:'test',role:'ui_designer',instruction:screenScopeInstruction('home','Refine the title'),brief:'App',document,notes:[]},async(_url,options)=>{
  const context=JSON.parse(JSON.parse(options.body).input);
  assert.equal(context.active_screen_id,'home');assert.ok(context.current_canvas.nodes.every(item=>!item.id.startsWith('checkout')));
  return response(edit([node('home-title','text','home',{text:'Find your next meal'})]));
 });
 // The unfinished checkout screen is outside this review's scope.
 const state={...plan,stage:4};
 const qa=await auditPipeline({key:'test',model:'test',instruction:'Audit the feed',brief:'App',state},async(_url,options)=>{
  const context=JSON.parse(JSON.parse(options.body).input);assert.ok(context.canvas.nodes.every(node=>!node.id.startsWith('checkout')));
  return response({summary:'Passed',issues:[]});
 });
 assert.equal(rejectOrApprove(state,qa.issues).stage,5);
 assert.equal(taskDisplay({instruction:screenScopeInstruction('home','Current action: Refine the title')}).title,'Refine the title');
});

test('icon dictionary uses installed canonical UI keys and rejects arbitrary symbols and mismatched meanings',()=>{
 for(const name of uiIconNames)assert.match(renderIconSvg(name),/<svg/);
 assert.equal(normalizeUiIconName('Bag'),'ShoppingBag');assert.equal(normalizeUiIconName('Sliders'),'SlidersHorizontal');
 assert.equal(normalizeUiIconName('/'),undefined);assert.equal(normalizeUiIconName('Worm'),undefined);
 for(const raw of [node('bad','icon','screen',{iconName:'/'}),node('bad','icon','screen',{iconName:'Search',text:'/'}),node('bad','text','screen',{text:'/'})])assert.throws(()=>validateProposal(edit([node('screen'),raw]),blankCanvas()),/icon|Lucide/);
 assert.throws(()=>validateProposal(edit([node('screen'),node('back','button','screen',{text:'Go back',iconName:'ArrowRight'})]),blankCanvas()),/ChevronLeft/);
 const row={...node('row','container','screen',{alignItems:'center'}),layoutMode:'HORIZONTAL',itemSpacing:8};
 assert.throws(()=>validateProposal(edit([node('screen'),row,node('glyph','icon','row',{iconName:'Heart'}),node('label','text','row',{text:'Search'})]),blankCanvas()),/Search/);
});

test('icons have fixed inline-flex boxes, rows have 8px gaps and icon buttons export matching alignment and insets',()=>{
 const row={...node('row','container','screen',{alignItems:'center'}),layoutMode:'HORIZONTAL',itemSpacing:8};
 const result=validateProposal(edit([node('screen'),row,node('search-icon','icon','row',{iconName:'Search'}),node('label','text','row',{text:'Search restaurants'}),node('back','button','screen',{text:'Back',iconName:'ChevronLeft',fontSize:20})]),blankCanvas());
 const icon=result.document.nodes.find(item=>item.id==='search-icon'),button=result.document.nodes.find(item=>item.id==='back');
 assert.equal(icon.width,16);assert.equal(icon.height,16);assert.equal(flowNodeStyle(icon).display,'inline-flex');
 assert.equal(button.layout.direction,'row');assert.equal(button.layout.alignItems,'center');assert.equal(button.layout.gap,8);
 assert.equal(flowNodeStyle(button).padding,'12px 16px');
 const html=renderCanvas(result.document,'Scoped screen');
 assert.match(html,/data-icon-wrapper="true"/);assert.match(html,/display:inline-flex;width:20px;height:20px/);assert.match(html,/padding:12px 16px/);assert.match(html,/data-icon-label="true">Back/);
 const control=node('filter','button','screen',{text:'Filter',iconName:'SlidersHorizontal'});
 assert.throws(()=>validateProposal(edit([node('screen'),{...control,layoutMode:'VERTICAL'}]),blankCanvas()),/HORIZONTAL/);
 assert.throws(()=>validateProposal(edit([node('screen'),node('raw','icon','screen',{iconName:'Search'})]),blankCanvas()),/icon\/text row/);
});

test('agent grid values and coordinate-free schema are enforced, not silently rounded',()=>{
 const fields=componentProposalSchema.properties.upsert_nodes.items.properties;
 assert.equal(fields.padding.multipleOf,8);assert.equal(fields.itemSpacing.multipleOf,8);
 assert.equal(fields.properties.properties.borderRadius.anyOf.find(item=>item.type==='number').multipleOf,8);
 assert.equal(componentProposalSchema.properties.upsert_nodes.items.additionalProperties,false);assert.equal(fields.x,undefined);assert.equal(fields.y,undefined);
 for(const patch of [{padding:12},{itemSpacing:13},{properties:{borderRadius:10}},{x:0}])assert.throws(()=>validateProposal(edit([{...node('screen'),...patch}]),blankCanvas()),/multiple of 8|Unrecognized key/);
});
