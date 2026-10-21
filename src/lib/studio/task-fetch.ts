import type { StudioTask } from './task-display.ts';
import { taskReviewStatuses } from './review-state.ts';

export const isTaskFetchCancelled=(cause:unknown)=>!!cause&&typeof cause==='object'&&'name' in cause&&cause.name==='AbortError';
type Snapshot={tasks:StudioTask[];nextOffset:number|null};

/** Share only live requests for the same project; cancelled mounts must start afresh. */
export function createTaskLoader(request:typeof fetch=fetch) {
 let pending:{projectId?:string;signal?:AbortSignal;promise:Promise<Snapshot>}|null=null;
 let loaded:{projectId?:string;through:number}={through:0};
 const load=(projectId?:string,signal?:AbortSignal,older=false):Promise<Snapshot>=>{
  if(signal?.aborted)return Promise.reject(signal.reason);
  const previous=pending;
  if(previous&&previous.projectId===projectId&&!previous.signal?.aborted){
   if(!older)return previous.promise;
   return previous.promise.catch(()=>{}).then(()=>load(projectId,signal,true));
  }
  const promise=(async()=>{
   const tasks:StudioTask[]=[];
   const through=(loaded.projectId===projectId?loaded.through:0)+(older?100:0);
   let offset:number|null=0,lastOffset=0;
   do {
    signal?.throwIfAborted();
    const params=new URLSearchParams();
    if(projectId)params.set('projectId',projectId);
    if(offset)params.set('offset',String(offset));
    const response=await request(`/api/studio/tasks${params.size?`?${params}`:''}`,{cache:'no-store',signal});
    const data=await response.json();
    signal?.throwIfAborted();
    if(!response.ok)throw new Error(data.error||'Could not load tasks.');
    tasks.push(...(data.tasks||[]));lastOffset=offset;
    offset=typeof data.nextOffset==='number'&&data.nextOffset>offset?data.nextOffset:null;
   }while(offset!==null&&offset<=through);
   loaded={projectId,through:lastOffset};
   return {tasks:taskReviewStatuses([...new Map(tasks.map(task=>[task.id,task])).values()]),nextOffset:offset};
  })();
  pending={projectId,signal,promise};
  const clear=()=>{if(pending?.promise===promise)pending=null;};
  void promise.then(clear,clear);
  return promise;
 };
 return load;
}
