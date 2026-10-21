import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeCanvasWork, ProviderFailure, validateProposal } from '../src/lib/studio/agents/proposal.ts';
import { blankCanvas } from '../src/lib/studio/canvas.ts';
const input={key:'test-only',model:'openai/gpt-oss-120b',provider:'groq',role:'ui_designer',instruction:'Create a screen',brief:'A cafe app',document:blankCanvas(),notes:[]};
const plan={mode:'edit',summary:'Create one screen.',upsert_nodes:[{id:'screen',type:'container',parentId:null,layoutMode:'VERTICAL',properties:{}}],delete_ids:[],handoff:null};
const completed=value=>Response.json({status:'completed',usage:{input_tokens:10,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});

test('Groq proposal request errors retain HTTP category, permit fallback and never expose raw provider data',async()=>{
 for(const [status,code,pattern,retryable] of [[400,'invalid_request_error',/generation request/,false],[400,'json_validate_failed',/valid structured output/,true],[422,'invalid_request_error',/valid structured output/,true],[404,'model_not_found',/configured model/,false],[498,'server_error',/could not complete/,true]]){
  await assert.rejects(proposeCanvasWork(input,async()=>Response.json({error:{code,message:'Request contains secret sk-do-not-display and private project data',failed_generation:'private output'}},{status})),error=>{
   assert.ok(error instanceof ProviderFailure);assert.equal(error.httpStatus,status);assert.equal(error.providerCode,code);assert.equal(error.fallbackable,true);assert.equal(error.retryable,retryable);assert.match(error.message,pattern);assert.match(error.message,new RegExp(`HTTP ${status}`));assert.doesNotMatch(error.message,/sk-do-not-display|private/);return true;
  });
 }
});

test('only explicitly unsupported schema bounds get one compatibility retry and local limits still apply',async()=>{
 const bodies=[],progress=[];
 const result=await proposeCanvasWork({...input,onProgress:async message=>progress.push(message)},async(_url,options)=>{
  const body=JSON.parse(options.body);bodies.push(body);
  return bodies.length===1?Response.json({error:{code:'invalid_request_error',message:'Unsupported schema constraint maxLength in text.format.schema'}},{status:400}):completed(plan);
 });
 assert.equal(result.commands.length,1);assert.equal(bodies.length,2);assert.equal(progress.length,1);
 assert.equal(bodies[0].text.format.schema.properties.summary.maxLength,240);assert.equal(bodies[1].text.format.schema.properties.summary.maxLength,undefined);
 assert.equal(bodies[1].text.format.strict,true);assert.equal(bodies[1].text.format.schema.additionalProperties,false);
 assert.deepEqual(bodies[1].text.format.schema.required,['mode','summary','upsert_nodes','delete_ids','handoff']);
 assert.throws(()=>validateProposal({mode:'edit',summary:'Too many nodes',upsert_nodes:Array.from({length:7},(_,index)=>({id:`node-${index}`,parentId:null,type:'container',properties:{}})),delete_ids:[]},blankCanvas()),/Too big/);
 let calls=0;
 await assert.rejects(proposeCanvasWork(input,async()=>{calls++;return Response.json({error:{code:'invalid_json_schema',message:'Unknown schema keyword maxLength is not allowed'}},{status:400});}),error=>{assert.equal(error.fallbackable,true);assert.match(error.message,/structured-output format/);return true;});
 assert.equal(calls,2);
});

test('content-policy failures do not retry or switch providers',async()=>{
 let calls=0;
 await assert.rejects(proposeCanvasWork(input,async()=>{calls++;return Response.json({error:{code:'content_policy_violation',message:'Blocked content'}},{status:400});}),error=>{assert.equal(error.fallbackable,false);assert.equal(error.retryable,false);assert.match(error.message,/content policy/);return true;});
 assert.equal(calls,1);
});

test('network failures permit fallback but cancellation does not become a provider error',async()=>{
 await assert.rejects(proposeCanvasWork(input,async()=>{throw new TypeError('fetch failed, secret diagnostic');}),error=>{assert.equal(error.fallbackable,true);assert.match(error.message,/could not be reached/);assert.doesNotMatch(error.message,/secret/);return true;});
 const abort=new AbortController();abort.abort();
 await assert.rejects(proposeCanvasWork({...input,signal:abort.signal},async()=>{throw abort.signal.reason;}),error=>{assert.equal(error.name,'AbortError');return true;});
});
