'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { stripScreenScope } from '@/lib/studio/html-screen';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { type AgentRole } from '@/lib/studio/agent-roles';
import { AgentMark } from './agent-identity';
import type { TaskWait } from '@/lib/studio/task-wait';
import { reviewHasRevision } from '@/lib/studio/review-state';
import { isTaskFetchCancelled } from '@/lib/studio/task-fetch';

export type WaitingMessage = {noteId:string;wait:TaskWait};
type Task = { source_note_id?:string; wait?:TaskWait|null; id:string; parent_task_id:string|null; project_id:string; agent_role:AgentRole; instruction:string; status:string; summary:string; error:string; result_version_id:string|null; created_at:string; updated_at?:string };
type TaskEvent = {id:number;task_id:string;kind:'status'|'handoff'|'result'|'error';speaker_role:AgentRole|null;recipient_role:AgentRole|null;body:string;created_at:string};
export type ReviewFeedback = { instruction:string; summary:string; versionId:string|null };

export type StoppedTask = {id:string;instruction:string};

export function AgentProgress({projectId,onRequestChanges,onTaskWaits,onWorkingAgents,onActiveTasks,onStoppedTask,revisionNotes=[],conversationLoaded=true}:{onWorkingAgents?:(roles:AgentRole[])=>void;onActiveTasks?:(ids:string[])=>void;onStoppedTask?:(task:StoppedTask|null)=>void;onTaskWaits?:(waits:WaitingMessage[])=>void;revisionNotes?:readonly {author_role:string;body:string;created_at:string}[];conversationLoaded?:boolean;projectId:string;onRequestChanges?:(feedback:ReviewFeedback)=>void}) {
 const containerRef=useRef<HTMLDivElement>(null);
 const [tasks,setTasks]=useState<Task[]>([]);
 const [events,setEvents]=useState<TaskEvent[]>([]);
 const [error,setError]=useState('');
 const [pending,setPending]=useState<string|null>(null);
 const [approved,setApproved]=useState<Set<string>>(new Set());
 const submitting=useRef(false);
 const load=useCallback(async(signal?:AbortSignal)=>{
  const response=await fetch(`/api/studio/tasks?projectId=${encodeURIComponent(projectId)}`,{cache:'no-store',signal});
  if(!response.ok)throw new Error('Could not refresh tasks. Please try again.');
  const data=await response.json();
  if(signal?.aborted)return;
  const feed=containerRef.current?.parentElement;
  const nearBottom=!!feed&&feed.scrollHeight-feed.scrollTop-feed.clientHeight<180;
  setTasks((data.tasks||[]).map((task:Task)=>{
   if(task.status!=='queued'||task.error!=='Waiting for workspace model capacity or daily budget.')return task;
   const waiting=(data.events||[]).filter((event:{task_id:string;body:string})=>event.task_id===task.id&&event.body.includes('daily GuildOS model request limit')).at(-1);
   return waiting?{...task,error:'Daily workspace request limit reached. This task will resume when the limit resets.'}:task;
  }));setEvents(Array.isArray(data.events)?data.events:[]);setError('');
  if(nearBottom&&feed)requestAnimationFrame(()=>{if(feed.isConnected)feed.scrollTop=feed.scrollHeight;});
 },[projectId]);
 useEffect(()=>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{try{if(!document.hidden)await load(controller.signal);}catch(cause){if(!controller.signal.aborted&&!isTaskFetchCancelled(cause)){setError('Could not refresh tasks. Please try again.');}}finally{if(!controller.signal.aborted)timer=setTimeout(poll,3000);}};
  const refresh=()=>{void load(controller.signal).catch(()=>{});};
  void poll();window.addEventListener('guildos:tasks-updated',refresh);
  return()=>{controller.abort();clearTimeout(timer);window.removeEventListener('guildos:tasks-updated',refresh);};
 },[load]);
 useEffect(()=>{
  if(error){onWorkingAgents?.([]);return;}
  // Task.agent_role is the original assignee. The sequential pipeline changes
  // specialists, so use the latest live status event for each running task.
  const currentRole=new Map<string,AgentRole>();
  for(const event of events)if(event.kind==='status'&&event.speaker_role)currentRole.set(event.task_id,event.speaker_role);
  onWorkingAgents?.([...new Set(tasks.filter(task=>task.status==='running').map(task=>currentRole.get(task.id)||task.agent_role))]);
 },[tasks,events,error,onWorkingAgents]);
 useEffect(()=>{
  // Root tasks the user can stop, and the latest root task if the user stopped it.
  const rootTasks=tasks.filter(task=>!task.parent_task_id);
  onActiveTasks?.(error?[]:rootTasks.filter(task=>['queued','running','delegated'].includes(task.status)).map(task=>task.id));
  const latest=[...rootTasks].sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
  onStoppedTask?.(latest?.status==='cancelled'?{id:latest.id,instruction:latest.instruction}:null);
 },[tasks,error,onActiveTasks,onStoppedTask]);
 useEffect(()=>{onTaskWaits?.(tasks.flatMap(task=>task.source_note_id&&task.status==='queued'&&task.wait?[{noteId:task.source_note_id,wait:task.wait}]:[]));},[tasks,onTaskWaits]);
 async function action(task:Task,action:'approve'|'retry'|'cancel') {
  if(submitting.current)return;
  submitting.current=true;setPending(task.id);setError('');
  try{
   const response=await fetch('/api/studio/tasks',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({taskId:task.id,action})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not update this task.');
   if(action==='approve')setApproved(current=>new Set([...current,`${task.id}:${task.updated_at||task.created_at}`]));
   await load();window.dispatchEvent(new Event('guildos:tasks-updated'));
  }catch(cause){if(!isTaskFetchCancelled(cause))setError(cause instanceof Error?cause.message:'Could not update this task.');}
  finally{submitting.current=false;setPending(null);}
 }
 const roots=tasks.filter(task=>!task.parent_task_id);
 const revised=new Set(roots.filter(task=>reviewHasRevision(task,revisionNotes)).map(task=>task.id));
 // Notify once for the completed group, after every specialist and QA have finished.
 const reviews=roots.filter(task=>conversationLoaded&&!approved.has(`${task.id}:${task.updated_at||task.created_at}`)&&!revised.has(task.id)&&task.status==='review'&&!tasks.some(child=>child.parent_task_id===task.id&&!['review','done'].includes(child.status)));
 const summaryFor=(task:Task)=>{
  const children=tasks.filter(child=>child.parent_task_id===task.id&&child.summary).sort((a,b)=>a.created_at.localeCompare(b.created_at));
  return children.length?children.slice(-3).map(child=>child.summary).join(' '):task.summary||'The requested changes are ready for your review.';
 };
 const requestChanges=(task:Task)=>{onRequestChanges?.({instruction:task.instruction,summary:summaryFor(task),versionId:task.result_version_id});};
 return <Box ref={containerRef} aria-label="Agent work in this conversation" sx={{mt:2,minWidth:0}}>
  <Box aria-live="polite" aria-relevant="additions">
   {reviews.map(task=><Box key={task.id} component="section" aria-label="Changes ready for approval" sx={{mb:2,p:2,border:'1px solid',borderColor:'divider',borderRadius:2,bgcolor:'background.paper',minWidth:0}}>
    <Stack direction="row" spacing={1} sx={{alignItems:'center',mb:1}}><AgentMark role={task.agent_role} size={28}/><Typography variant="subtitle2" sx={{fontWeight:700,flex:1}}>Changes ready for review</Typography></Stack>
    <Typography variant="body2" sx={{fontWeight:600,mb:.75,overflowWrap:'anywhere'}}>{stripScreenScope(task.instruction)}</Typography>
    <Typography variant="body2" color="text.secondary" sx={{lineHeight:1.55,overflowWrap:'anywhere'}}>{summaryFor(task)}</Typography>
    <Stack direction="row" sx={{mt:1.5,gap:1,flexWrap:'wrap'}}><Button size="small" variant="contained" disabled={!!pending} onClick={()=>void action(task,'approve')}>Approve changes</Button>{onRequestChanges&&<Button size="small" variant="outlined" disabled={!!pending} onClick={()=>requestChanges(task)}>Request changes</Button>}</Stack>
   </Box>)}
  </Box>
  {error&&reviews.length>0&&<Alert severity="error" sx={{mb:1}}>{error}</Alert>}

 </Box>;
}
