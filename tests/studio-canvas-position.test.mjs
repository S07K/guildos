import test from 'node:test';
import assert from 'node:assert/strict';
import { blankCanvas, validateCanvas, renderCanvas } from '../src/lib/studio/canvas.ts';
import { absoluteNode, createCanvasNode, drawingBounds, normalizeCanvasPositions } from '../src/lib/studio/canvas-position.ts';
import { flowNodeStyle } from '../src/lib/studio/canvas-layout.ts';
import { applyCanvasCommands } from '../src/lib/studio/canvas-commands.ts';
import { componentToCanvas, parseComponentProposal } from '../src/lib/studio/design-system.ts';
import { sanitizeCanvasLayout } from '../src/lib/studio/canvas-quality.ts';

const component=(id,type,parentId=null)=>componentToCanvas({id,type,parentId,properties:{text:type==='text'?'Hello':'',borderRadius:16}});
test('absolute positioning preserves nested Auto Layout, geometry, radius and command roundtrips',()=>{
 const screen=component('screen','container');
 const row=absoluteNode(component('row','container','screen'),{x:23,y:51,width:240,height:120});
 const label=component('label','text','row');
 const shape=createCanvasNode('ellipse','shape',{positionMode:'absolute',parentId:'row',x:120,y:12,width:45,height:70,radius:13});
 const doc={...blankCanvas(),nodes:[screen,row,label,shape]};
 assert.equal(validateCanvas(doc),doc);
 assert.equal(row.flow,true);assert.equal(row.layout.direction,'column');
 const style=flowNodeStyle(row,screen);
 assert.equal(style.position,'absolute');assert.equal(style.left,23);assert.equal(style.height,120);
 assert.equal(flowNodeStyle(label,row).position,'relative');
 const changed=applyCanvasCommands(doc,[{type:'update',id:'row',patch:{positionMode:'absolute',x:35,y:-10,width:280,height:140}},{type:'update',id:'shape',patch:{radius:19}}]);
 assert.equal(changed.nodes[1].x,35);assert.equal(changed.nodes[1].parentId,'screen');assert.equal(changed.nodes[1].layout.direction,'column');
 assert.equal(changed.nodes[3].radius,19);
 assert.deepEqual(sanitizeCanvasLayout(changed).nodes[3],changed.nodes[3]);
 const html=renderCanvas(changed,'Absolute layout');
 assert.match(html,/position:absolute/);assert.match(html,/left:35px/);assert.match(html,/top:-10px/);
 assert.match(html,/height:140px/);assert.match(html,/border-radius:50%/);
 assert.equal(parseComponentProposal({mode:'edit',summary:'Keep the flow',upsert_nodes:[{id:'new',type:'text',parentId:'screen',properties:{text:'New'}}],delete_ids:[]}).upsert_nodes[0].positionMode,'auto');
 assert.throws(()=>parseComponentProposal({mode:'edit',summary:'Invalid',upsert_nodes:[{id:'new',type:'text',parentId:'screen',positionMode:'absolute'}],delete_ids:[]}));
});

test('legacy world geometry migrates once to parent coordinates and retains explicit positioning',()=>{
 const frame={...createCanvasNode('frame','frame'),flow:undefined,positionMode:undefined,layout:undefined,x:200,y:150,width:400,height:400};
 const image={...createCanvasNode('rectangle','child'),flow:undefined,positionMode:undefined,parentId:'frame',x:240,y:180};
 const original={...blankCanvas(),nodes:[frame,image]};
 const normalized=normalizeCanvasPositions(original);
 assert.equal(normalized.nodes[1].x,40);assert.equal(normalized.nodes[1].y,30);
 assert.equal(original.nodes[1].x,240);
 assert.deepEqual(normalizeCanvasPositions(normalized),normalized);
 assert.equal(validateCanvas(normalized),normalized);
});

test('all four drawing directions produce positive dimensions with the correct origin',()=>{
 for(const end of [{x:140,y:130},{x:60,y:130},{x:140,y:70},{x:60,y:70}]){
  assert.deepEqual(drawingBounds({x:100,y:100},end),{x:Math.min(100,end.x),y:Math.min(100,end.y),width:40,height:30});
 }
});
