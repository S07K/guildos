import test from 'node:test';
import assert from 'node:assert/strict';
import { blankCanvas, validateCanvas, renderCanvas } from '../src/lib/studio/canvas.ts';

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
