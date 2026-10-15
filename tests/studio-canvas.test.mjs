import test from 'node:test';
import assert from 'node:assert/strict';
import { blankCanvas, validateCanvas, renderCanvas } from '../src/lib/studio/canvas.ts';
import { generateWithWorker } from '../services/codex-bridge/src/generation.ts';

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

function worker({failed=false,missingUsage=false}={}) {
 const listeners=new Set();let persisted=0;
 return {home:'/isolated-workspace',connected:true,listeners,get persisted(){return persisted;},persist:async()=>{persisted++;},send:async(method,params)=>{
  if(method==='model/list')return {data:[{model:'test-model',isDefault:true}]};
  if(method==='thread/start'){assert.equal(params.approvalPolicy,'never');assert.deepEqual(params.permissionProfile,{type:'readOnly'});assert.equal(params.config['features.shell_tool'],false);return {thread:{id:'thread-1'}};}
  if(method==='turn/start'){
   assert.deepEqual(params.permissionProfile,{type:'readOnly'});assert.equal(params.sandboxPolicy,undefined);assert.equal(params.outputSchema.type,'object');
   queueMicrotask(()=>{for(const notify of listeners){notify({method:'item/completed',params:{threadId:'thread-1',item:{type:'agentMessage',phase:'final_answer',text:'{"headline":"Test"}'}}});if(!missingUsage)notify({method:'thread/tokenUsage/updated',params:{threadId:'thread-1',tokenUsage:{last:{inputTokens:120,outputTokens:80}}}});notify({method:'turn/completed',params:{threadId:'thread-1',turn:{status:failed?'failed':'completed'}}});}});
   return {turn:{id:'turn-1'}};
  }return {};
 }};
}
test('ChatGPT turns return structured output and measured tokens, and fail closed',async()=>{
 const input={brief:'Design a useful site',feedback:'',schema:{type:'object'}};
 const client=worker();const result=await generateWithWorker(client,input);
 assert.equal(result.model,'chatgpt/test-model');assert.equal(result.input_tokens,120);assert.equal(result.output_tokens,80);assert.equal(client.persisted,1);assert.equal(client.listeners.size,0);
 await assert.rejects(generateWithWorker(worker({failed:true}),input),/could not finish/);
 await assert.rejects(generateWithWorker(worker({missingUsage:true}),input),/token usage/);
 await assert.rejects(generateWithWorker({...worker(),connected:false},input),/session expired/);
});
