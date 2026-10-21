import test from 'node:test';
import assert from 'node:assert/strict';
import { blankCanvas, renderCanvas } from '../src/lib/studio/canvas.ts';
import { applyCanvasCommands } from '../src/lib/studio/canvas-commands.ts';
import { componentToCanvas, canvasToComponent, componentProposalSchema, sanitizeComponentNode } from '../src/lib/studio/design-system.ts';
import { canvasQualityIssues, contrastRatio } from '../src/lib/studio/canvas-quality.ts';
import {initialPipeline,rejectOrApprove} from '../src/lib/studio/agents/pipeline.ts';
import { validateProposal, auditPipeline } from '../src/lib/studio/agents/proposal.ts';

const node=(id,type='container',parentId=null,properties={})=>({id,parentId,type,properties});
const proposal=nodes=>({mode:'edit',summary:'Updated components.',upsert_nodes:nodes,delete_ids:[]});
test('sanitizer fills missing layout, rounds 8px tokens, and preserves the component contract on roundtrip',()=>{
 const raw={...node('screen'),padding:19,itemSpacing:12,properties:{borderRadius:11,backgroundColor:'surface-muted'}};
 const result=componentToCanvas(raw);
 assert.deepEqual(result.layout,{direction:'column',gap:16,padding:16,alignItems:'stretch',justifyContent:'start'});
 assert.equal(result.radius,8);assert.equal(result.fill,'#f3f4f6');assert.equal(result.flow,true);
 const roundtrip=canvasToComponent(result);assert.equal(roundtrip.layoutMode,'VERTICAL');assert.equal(roundtrip.itemSpacing,16);
 assert.equal(sanitizeComponentNode({...raw,padding:500}).padding,496);
 for(const value of [NaN,Infinity,-8,'16'])assert.throws(()=>sanitizeComponentNode({...raw,padding:value}));
 assert.throws(()=>sanitizeComponentNode({...raw,x:0}),/Unrecognized key/);
 assert.throws(()=>sanitizeComponentNode({...raw,properties:{position:'absolute'}}),/Unrecognized key/);
 assert.throws(()=>sanitizeComponentNode({...raw,properties:{backgroundColor:'url(secret)'}}),/HEX color/);
 assert.throws(()=>validateProposal(proposal(Array.from({length:7},(_,i)=>node(`node-${i}`))),blankCanvas()),/Too big/);
 assert.equal(componentProposalSchema.additionalProperties,false);
});

test('buttons and inputs render with component styles and accessible native preview controls',()=>{
 const result=validateProposal(proposal([node('screen'),{...node('button','button','screen',{text:'Save & continue',backgroundColor:'accent',color:'on-accent',borderRadius:16}),padding:16},node('email','input','screen',{name:'Email address',text:'you@example.com'})]),blankCanvas());
 const button=result.document.nodes[1];assert.equal(button.radius,16);assert.equal(button.layout.padding,16);
 const html=renderCanvas(result.document,'Preview');
 assert.match(html,/<button type="button" data-node-id="button"/);assert.match(html,/Save &amp; continue/);
 assert.match(html,/<input data-node-id="email" aria-label="Email address" placeholder="you@example.com" readonly/);
 assert.match(html,/border-radius:16px/);assert.match(html,/min-height:48px/);
 assert.deepEqual(canvasQualityIssues(result.document),[]);
});

test('command middleware applies the same defaults and snapping for component creates and patches atomically',()=>{
 const base=applyCanvasCommands(blankCanvas(),[{type:'create',node:node('screen')}]);
 const updated=applyCanvasCommands(base,[{type:'update',id:'screen',patch:{layoutMode:'HORIZONTAL',itemSpacing:21,padding:13,properties:{borderRadius:9}}}]);
 assert.equal(updated.nodes[0].layout.direction,'row');assert.equal(updated.nodes[0].layout.gap,24);assert.equal(updated.nodes[0].layout.padding,16);assert.equal(updated.nodes[0].radius,8);
 assert.throws(()=>applyCanvasCommands(base,[{type:'update',id:'screen',patch:{layoutMode:'HORIZONTAL',x:999}}]),/Unrecognized key/);
 assert.equal(base.nodes[0].layout.direction,'column');
 assert.throws(()=>validateProposal(proposal([node('a','container','b'),node('b','container','a')]),blankCanvas()),/cycle/);
 assert.throws(()=>validateProposal(proposal([node('input','input'),node('child','text','input',{text:'Bad child'})]),blankCanvas()),/parent/);
});

test('axis sizing is relative to each node direction, FILL-HUG cycles resolve, and text always grows',()=>{
 const parent={...node('screen'),primaryAxisSizingMode:'HUG',counterAxisSizingMode:'FILL'};
 const row={...node('row','container','screen'),layoutMode:'HORIZONTAL',primaryAxisSizingMode:'FILL',counterAxisSizingMode:'FILL'};
 const label={...node('label','text','row',{text:'Long copy '.repeat(70)}),primaryAxisSizingMode:'FIXED'};
 const result=validateProposal(proposal([parent,row,label]),blankCanvas());
 assert.equal(result.document.nodes[1].sizing.width,'fill-container');assert.equal(result.document.nodes[1].sizing.height,'hug-contents');
 assert.equal(result.document.nodes[2].sizing.height,'hug-contents');
 const fixed=componentToCanvas({...node('icon','icon'),primaryAxisSizingMode:'FIXED',counterAxisSizingMode:'FIXED',properties:{iconName:'Search'}});
 assert.equal(fixed.width,16);assert.equal(fixed.height,16);assert.equal(fixed.sizing.width,'fixed');
});

test('QA measures contrast without editing the proposed turn',async()=>{
 assert.equal(contrastRatio('#ffffff','#000000'),21);
 const bad=componentToCanvas(node('label','text','screen',{text:'Read me',color:'#eeeeee'}));
 const base={...blankCanvas(),nodes:[componentToCanvas(node('screen')),bad,componentToCanvas(node('next','button','screen',{text:'Continue'}))]};
 const state={...initialPipeline(base,'Review readability',null),stage:4};
 const result=await auditPipeline({key:'test',model:'test',instruction:'Review readability',brief:'Cafe',state},async(_url,options)=>{
  const body=JSON.parse(options.body);assert.equal(body.text.format.schema.properties.upsert_nodes,undefined);assert.match(body.instructions,/read-only/);
  assert.match(JSON.parse(body.input).deterministic_errors[0].message,/contrast/);
  return Response.json({status:'completed',usage:{input_tokens:10,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'Audit',issues:[]})}]}]});
 });
 const next=rejectOrApprove(state,result.issues);assert.equal(next.stage,2);assert.deepEqual(next.document,base);
 assert.ok(next.issues.some(issue=>issue.message.includes('contrast')));
});

test('existing flow snapshots remain readable and convert to grid values when edited',()=>{
 const old=componentToCanvas(node('screen'));
 delete old.designSystem;old.radius=4;old.layout.padding=13;old.layout.gap=11;
 const document={...blankCanvas(),nodes:[old]};
 assert.match(renderCanvas(document,'Existing draft'),/padding:13px/);
 assert.ok(canvasQualityIssues(document).some(issue=>issue.key==='grid:screen'));
 assert.throws(()=>validateProposal(proposal([{...canvasToComponent(old),padding:13,itemSpacing:11,properties:{borderRadius:4}}]),document),/multiple of 8/);
 const result=validateProposal(proposal([{...canvasToComponent(old),padding:16,itemSpacing:16,properties:{borderRadius:8}}]),document);
 assert.equal(result.document.nodes[0].layout.padding,16);assert.equal(result.document.nodes[0].radius,8);
 assert.deepEqual(canvasQualityIssues(result.document),[]);
});

test('QA returns every deterministic correction to the responsible stage',()=>{
 const nodes=[componentToCanvas(node('screen')),componentToCanvas(node('next','button','screen',{text:'Continue'})),...Array.from({length:23},(_,index)=>componentToCanvas(node(`label-${index}`,'text','screen',{text:'Readable label',color:'#eeeeee'})))];
 const state={...initialPipeline({...blankCanvas(),nodes},'Fix contrast',null),stage:4};
 const rejected=rejectOrApprove(state,[]);assert.equal(rejected.stage,2);assert.equal(rejected.issues.length,23);assert.deepEqual(rejected.document,state.document);
});

test('color constraints reach provider schemas and lossless shorthand is normalized before validation',()=>{
 const fields=componentProposalSchema.properties.upsert_nodes.items.properties.properties.properties;
 for(const key of ['backgroundColor','borderColor','color']){
  const schema=fields[key].anyOf.find(item=>item.type==='string');
  assert.ok(schema.pattern);const valid=new RegExp(schema.pattern);
  assert.equal(valid.test('#ffffff'),true);assert.equal(valid.test('surface-muted'),true);
  for(const invalid of ['transparent','primary','rgb(255,255,255)','url(secret)'])assert.equal(valid.test(invalid),false);
 }
 const raw=proposal([node('screen','container',null,{backgroundColor:' #fFf ',borderColor:'var(--border)',color:' TEXT '})]);
 const result=validateProposal(raw,blankCanvas());
 assert.equal(result.document.nodes[0].fill,'#ffffff');assert.equal(result.document.nodes[0].stroke,'#d1d5db');assert.equal(result.document.nodes[0].textColor,'#202b38');
 assert.equal(raw.upsert_nodes[0].properties.backgroundColor,' #fFf ');
 for(const invalid of ['transparent','primary','url(secret)'])assert.throws(()=>validateProposal(proposal([node('invalid','container',null,{backgroundColor:invalid})]),blankCanvas()),/HEX color/);
});

test('icon no-border styles normalize before generated creates and updates reach the canvas',()=>{
 const icon={...node('food-icon','icon','row',{name:'Food brand icon',iconName:'Utensils'}),primaryAxisSizingMode:'FIXED',counterAxisSizingMode:'FIXED'};
 const structure=[node('screen'),{...node('row','container','screen'),layoutMode:'HORIZONTAL',itemSpacing:8,properties:{alignItems:'center'}}];
 for(const [weight,expected] of [[undefined,2],[null,2],[0,2],[0.1,0.5],[0.5,0.5],[1.5,1.5],[4,4]]){
  const raw={...icon,properties:{...icon.properties,borderWidth:weight}};
  const result=validateProposal(proposal([...structure,raw]),blankCanvas());
  assert.equal(result.document.nodes[2].strokeWidth,expected);
  assert.equal(raw.properties.borderWidth,weight,'normalization must not mutate the proposal');
  const updated=validateProposal(proposal([raw]),result.document);
  assert.equal(updated.document.nodes[2].strokeWidth,expected);
  const patched=applyCanvasCommands(result.document,[{type:'update',id:icon.id,patch:{properties:{borderWidth:weight}}}]);
  assert.equal(patched.nodes[2].strokeWidth,expected);
 }
 for(const type of ['container','text','button','input'])assert.equal(componentToCanvas(node('borderless',type,null,{borderWidth:0})).strokeWidth,0);
 for(const weight of [-1,4.1,NaN,Infinity,'2']){
  const raw={...icon,properties:{...icon.properties,borderWidth:weight}};
  assert.throws(()=>validateProposal(proposal([...structure,raw]),blankCanvas()),/borderWidth/);
  assert.throws(()=>componentToCanvas(raw));
 }
});
