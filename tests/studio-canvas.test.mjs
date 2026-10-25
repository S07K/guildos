import test from 'node:test';
import assert from 'node:assert/strict';
import { blankCanvas, validateCanvas, renderCanvas, adjacentCanvasSiblingId, reorderCanvasSiblings } from '../src/lib/studio/canvas.ts';

test('manual canvases validate geometry, unique layers, colors, and escape export content', () => {
 const document = blankCanvas();
 const node = {id:'text-1',type:'text',name:'Headline',x:20,y:40,width:400,height:80,fill:'#202b38',stroke:'#ffffff',strokeWidth:0,radius:0,opacity:1,text:'<script>alert(1)</script>',fontSize:32,fontWeight:400};
 document.nodes.push(node);
 assert.equal(validateCanvas(document),document);
 const html=renderCanvas(document,'<unsafe>');
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('default-src'));
 assert.throws(()=>validateCanvas({...document,nodes:[node,{...node}]}));
 assert.throws(()=>validateCanvas({...document,nodes:[{...node,width:-5}]}));
 assert.throws(()=>validateCanvas({...document,nodes:[{...node,fill:'red; background:url(evil)'}]}));
});

test('layer reordering inserts above or below only within the same sibling collection',()=>{
 const nodes=[
  {id:'root',type:'container',parentId:undefined,flow:true},
  {id:'a',type:'text',parentId:'root',flow:true},
  {id:'b',type:'text',parentId:'root',flow:true},
  {id:'c',type:'text',parentId:'root',flow:true},
  {id:'other-root',type:'container',parentId:undefined,flow:true},
  {id:'other-child',type:'text',parentId:'other-root',flow:true},
 ];
 assert.deepEqual(reorderCanvasSiblings(nodes,'c','a').map(node=>node.id),['root','c','a','b','other-root','other-child']);
 assert.deepEqual(reorderCanvasSiblings(nodes,'a','b',true).map(node=>node.id),['root','b','a','c','other-root','other-child']);
 assert.equal(adjacentCanvasSiblingId(nodes,'b','ArrowUp'),'a');
 assert.equal(adjacentCanvasSiblingId(nodes,'b','ArrowDown'),'c');
 assert.equal(adjacentCanvasSiblingId(nodes,'a','ArrowUp'),null);
 assert.equal(adjacentCanvasSiblingId(nodes,'c','ArrowDown'),null);
 assert.equal(reorderCanvasSiblings(nodes,'root','a'),null,'a parent cannot be reordered with its child');
 assert.equal(reorderCanvasSiblings(nodes,'a','other-child'),null,'layers under different parents cannot be reordered');
 assert.equal(reorderCanvasSiblings(nodes,'a','a'),null,'dropping onto itself is a no-op');
});
