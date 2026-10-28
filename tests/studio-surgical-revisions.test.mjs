import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCanvasPositions} from '../src/lib/studio/canvas-position.ts';
import {blankCanvas,validateCanvas} from '../src/lib/studio/canvas.ts';
import {componentToCanvas,canvasToComponent} from '../src/lib/studio/design-system.ts';
import {initialPipeline,validateStageEdit,rejectOrApprove,advanceDraft} from '../src/lib/studio/agents/pipeline.ts';
import {validateProposal} from '../src/lib/studio/agents/proposal.ts';
import {applyCanvasCommands} from '../src/lib/studio/canvas-commands.ts';
import {sanitizeVisualHierarchy} from '../src/lib/studio/visual-hierarchy.ts';
import {flowNodeStyle,renderAutoLayoutHtml} from '../src/lib/studio/canvas-layout.ts';
import {screenCompositionIssues} from '../src/lib/studio/canvas-quality.ts';
const node=(id,type='container',parentId=null,properties={})=>componentToCanvas({id,type,parentId,properties});
const base=()=>({...blankCanvas(),nodes:[node('screen'),node('header','container','screen'),node('title','text','header',{text:'Dinner'}),node('bottom-nav','container','screen'),node('tab','button','bottom-nav',{text:'Home'}),node('other-screen')]});
const edit=(upsert_nodes=[],delete_ids=[])=>({mode:'edit',summary:'Apply requested fix',upsert_nodes,delete_ids});

test('revision wrapper cannot route historical next screen into a new artboard',()=>{
 const doc=base();
 const state=initialPipeline(doc,'Active screen ID: screen\nRevise the completed work for: design the next screen\nRequested changes: fix duplicate icons in navigation bar',null);
 assert.equal(state.executionMode,'SURGICAL_REVISION');assert.equal(state.targetScreenId,'screen');assert.equal(state.newScreenTransition,false);assert.equal(state.revisionScope.sectionId,'bottom-nav');
 const saved=JSON.parse(JSON.stringify(state));
 for(const id of ['screen','header','title','other-screen']){
  const after=structuredClone(doc);after.nodes.find(node=>node.id===id).name='Overwritten';
  assert.throws(()=>validateStageEdit({...saved,stage:2},after),/SURGICAL_REVISION/);
 }
 assert.throws(()=>validateProposal(edit([],['screen']),doc,[],'screen',true,state.revisionScope),/SURGICAL_REVISION/);
 const update=canvasToComponent(doc.nodes.find(node=>node.id==='tab'));update.properties.text='Explore';
 const result=validateProposal(edit([update]),doc,[],'screen',true,state.revisionScope);
 assert.deepEqual(result.document.nodes.filter(node=>node.id!=='tab'),doc.nodes.filter(node=>node.id!=='tab'));
 assert.throws(()=>rejectOrApprove({...saved,stage:4,document:{...doc,nodes:doc.nodes.filter(node=>node.id!=='header')}},[]),/SURGICAL_REVISION/);
});

test('new screens are appended horizontally without rewriting archived layers',()=>{
 const doc=base();doc.nodes.at(-1).x=439;doc.nodes.at(-1).y=32;
 const state=initialPipeline(doc,'Design the next screen',null);
 assert.equal(state.executionMode,'CREATE_NEW_SCREEN');
 const result=validateProposal(edit([canvasToComponent(node(state.targetScreenId))]),doc,[],state.targetScreenId);
 assert.deepEqual(result.document.nodes.slice(0,doc.nodes.length),doc.nodes);
 const root=result.document.nodes.at(-1);assert.equal(root.x,878);assert.equal(root.y,32);
 assert.equal(flowNodeStyle(root).left,878);
});

test('null and empty clears remove stale icons and visual box styles',()=>{
 for(const value of [null,'']){
  const button=node('button','button','screen',{text:'Explore',backgroundColor:'#ffffff',borderWidth:2,borderColor:'#222222'});button.iconName='House';
  const doc={...blankCanvas(),nodes:[node('screen'),button]};
  const result=applyCanvasCommands(doc,[{type:'update',id:'button',patch:{properties:{iconName:value,backgroundColor:value,borderColor:value,borderWidth:value}}}]);
  const updated=result.nodes[1];assert.equal(updated.iconName,undefined);assert.equal(updated.fill,'transparent');assert.equal(updated.strokeWidth,0);
 }
 const doc={...blankCanvas(),nodes:[node('screen'),node('button','button','screen',{text:'Home'}),node('glyph','icon','button',{iconName:'House'})]};doc.nodes[1].iconName='House';
 assert.equal((renderAutoLayoutHtml(doc).match(/data-icon-wrapper="true"/g)||[]).length,1);
 const clean=sanitizeVisualHierarchy(doc,'screen');assert.equal(clean.nodes[1].iconName,undefined);
});

test('semantic variants unbox metadata and headings, preserve chip strips, and normalize nav anatomy',()=>{
 const doc={...blankCanvas(),nodes:[node('screen'),node('back','button','screen',{text:'< Restaurants'}),node('info','button','screen',{text:'Restaurant details'}),node('heading','button','screen',{text:'Recommended'}),node('nav','button','screen',{text:'Home',variant:'nav-tab'}),node('primary','button','screen',{text:'Order',variant:'primary-cta'}),node('primary-two','button','screen',{text:'Checkout',variant:'primary-cta'})]};
 const clean=sanitizeVisualHierarchy(doc,'screen');validateCanvas(clean);
 for(const id of ['back','info','heading'])assert.equal(flowNodeStyle(clean.nodes.find(node=>node.id===id)).backgroundColor,'transparent');
 const nav=clean.nodes.find(node=>node.id==='nav'),children=clean.nodes.filter(node=>node.parentId==='nav');
 assert.equal(nav.layout.direction,'column');assert.equal(nav.layout.gap,4);assert.deepEqual(children.map(node=>node.type),['icon','text']);assert.equal(children[0].width,20);assert.equal(children[1].fontSize,12);
 assert.equal(clean.nodes.filter(node=>node.variant==='primary-cta').length,1);
 assert.deepEqual(sanitizeVisualHierarchy(clean,'screen'),clean);
 assert.equal(flowNodeStyle(clean.nodes[0]).justifyContent,'space-between');
});

test('menu cards gain two columns, a verified image, typography and a compact add control',()=>{
 const photo={id:'food',imageUrl:'https://images.unsplash.com/photo-food',alt:'pizza dinner',photographer:'Fixture',profileUrl:'https://unsplash.com/@fixture',photoUrl:'https://unsplash.com/photos/food'};
 const doc={...blankCanvas(),nodes:[node('screen'),node('pizza','container','screen',{variant:'menu-item-card',name:'Pizza'}),node('dish','text','pizza',{text:'Margherita pizza'}),node('description','text','pizza',{text:'Tomato and basil'}),node('price','text','pizza',{text:'$13.00'}),node('add','button','pizza',{text:'Add to order'})]};
 const clean=sanitizeVisualHierarchy(doc,'screen',undefined,[photo]);validateCanvas(clean);
 const card=clean.nodes.find(node=>node.id==='pizza'),image=clean.nodes.find(node=>node.type==='image'),add=clean.nodes.find(node=>node.id==='add');
 assert.equal(card.layout.direction,'row');assert.equal(card.layout.padding,16);assert.equal(image.width,80);assert.equal(image.height,80);assert.equal(image.radius,12);assert.deepEqual(image.imageSource,photo);
 assert.equal(add.parentId,image.parentId);assert.equal(add.text,'+ Add');assert.equal(flowNodeStyle(add).height,32);
 assert.deepEqual(sanitizeVisualHierarchy(clean,'screen'),clean);
 assert.ok(screenCompositionIssues(sanitizeVisualHierarchy(doc,'screen')).some(issue=>issue.key==='menu-image:pizza'));
 // Copywriter component round-trips must preserve deterministic geometry and variants.
 const state={...initialPipeline(clean,'Polish copy',null),stage:3};
 const copy=canvasToComponent(add);copy.properties.text='+ Add';
 const result=validateProposal(edit([copy]),clean,[],'screen',true);validateStageEdit(state,result.document);
});

test('legacy flow artboards retain distinct render positions without mutating saved snapshots',()=>{
 const doc=base(),snapshot=structuredClone(doc);const rendered=normalizeCanvasPositions(doc);
 assert.equal(rendered.nodes.at(-1).x,439);assert.deepEqual(doc,snapshot);
 const state=initialPipeline(doc,'Create next screen',null);const result=validateProposal(edit([canvasToComponent(node(state.targetScreenId))]),doc,[],state.targetScreenId);
 assert.equal(result.document.nodes.at(-1).x,878);assert.deepEqual(result.document.nodes.slice(0,doc.nodes.length),snapshot.nodes);
});
