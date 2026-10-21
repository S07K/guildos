import test from 'node:test';
import assert from 'node:assert/strict';
import {createTaskLoader,isTaskFetchCancelled} from '../src/lib/studio/task-fetch.ts';

const task=(id)=>({id,parent_task_id:null,project_id:'project-a',agent_role:'ui_designer',instruction:'Build a screen',status:'queued',summary:'',error:'',result_version_id:null,created_at:'2026-10-19T00:00:00Z'});

test('a Strict Mode cleanup cannot lend its cancelled request to the next mount',async()=>{
 let calls=0,resolveCurrent;
 const load=createTaskLoader((_url,{signal})=>{
  calls++;
  if(calls===1)return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  return new Promise(resolve=>{resolveCurrent=resolve;});
 });
 const old=new AbortController(),current=new AbortController();
 const first=load(undefined,old.signal);
 const cancelled=assert.rejects(first,error=>isTaskFetchCancelled(error));
 old.abort();
 const second=load(undefined,current.signal);
 assert.equal(calls,2);
 await cancelled;
 // The old request's cleanup must not clear the replacement's in-flight state.
 assert.equal(load(undefined,current.signal),second);
 resolveCurrent(Response.json({tasks:[task('fresh')],nextOffset:null}));
 assert.equal((await second).tasks[0].id,'fresh');
});

test('cancellation during response parsing rejects the snapshot rather than publishing stale tasks',async()=>{
 let resolveJson,calls=0;
 const load=createTaskLoader(async()=>{
  calls++;
  if(calls===1)return {ok:true,json:()=>new Promise(resolve=>{resolveJson=resolve;})};
  return Response.json({tasks:[task('current')],nextOffset:null});
 });
 const controller=new AbortController();
 const first=load('project-a',controller.signal);
 const cancelled=assert.rejects(first,error=>isTaskFetchCancelled(error));
 await Promise.resolve();
 controller.abort();
 const current=load('project-a',new AbortController().signal);
 resolveJson({tasks:[task('stale')],nextOffset:100});
 await cancelled;
 assert.equal((await current).tasks[0].id,'current');
});

test('older pages survive refresh and pagination state is scoped to the project',async()=>{
 const urls=[];
 const load=createTaskLoader(async url=>{
  urls.push(url);
  const params=new URL(url,'http://localhost').searchParams;
  return Response.json({tasks:[task(params.get('offset')?'older':'new')],nextOffset:params.has('offset')?null:100});
 });
 const signal=new AbortController().signal;
 await load('project-a',signal);
 assert.equal((await load('project-a',signal,true)).tasks.length,2);
 await load('project-a',signal);
 assert.ok(urls.at(-1).includes('offset=100'));
 await load('project-b',signal);
 assert.equal(urls.at(-1),'/api/studio/tasks?projectId=project-b');
});

test('real task failures still reject and can be retried',async()=>{
 let fail=true;
 const load=createTaskLoader(async()=>fail?Response.json({error:'Tasks unavailable'},{status:503}):Response.json({tasks:[]}));
 await assert.rejects(load(),/Tasks unavailable/);
 fail=false;
 assert.deepEqual((await load()).tasks,[]);
 assert.equal(isTaskFetchCancelled(new Error('Tasks unavailable')),false);
 assert.equal(isTaskFetchCancelled(new DOMException('Timed out','TimeoutError')),false);
 assert.equal(isTaskFetchCancelled(new DOMException('signal is aborted without reason','AbortError')),true);
});
