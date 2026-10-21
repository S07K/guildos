'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Card, CardActionArea, CardContent, Chip, List, ListItem, ListItemButton, Pagination, Stack, TextField, Typography } from '@mui/material';
import { agentIdentity, agentRoles } from '@/lib/studio/agent-roles';
import { taskDisplay, taskStatusLabels, taskStatusColor, type StudioTask } from '@/lib/studio/task-display';
import { TaskDetailsDialog } from './task-details-dialog';
import { AgentMark } from './agent-identity';
import { TaskBoardSkeleton } from './loading-states';
import { createTaskLoader, isTaskFetchCancelled } from '@/lib/studio/task-fetch';

const columns=[{key:'queued',title:'Queued'},{key:'running',title:'In progress'},{key:'review',title:'Review'},{key:'done',title:'Done'},{key:'attention',title:'Needs attention'}];
const pageSize=10;
const clamp=(lines:number)=>({display:'-webkit-box',WebkitLineClamp:lines,WebkitBoxOrient:'vertical' as const,overflow:'hidden',overflowWrap:'anywhere' as const});
export function TaskBoard({projectId,view='kanban'}:{projectId?:string;view?:'kanban'|'list'}) {
 const [tasks,setTasks]=useState<StudioTask[]>([]);
 const [loaded,setLoaded]=useState(false),[error,setError]=useState('');
 const [agent,setAgent]=useState('all'),[project,setProject]=useState('all');
 const [selected,setSelected]=useState<string|null>(null),[pending,setPending]=useState(false);
 const [pages,setPages]=useState<Record<string,number>>({});
 const [nextOffset,setNextOffset]=useState<number|null>(null),[loadingOlder,setLoadingOlder]=useState(false);
 const loader=useRef<ReturnType<typeof createTaskLoader>|null>(null);
 if(!loader.current)loader.current=createTaskLoader();
 const lifecycle=useRef<AbortController|null>(null);
 const submitting=useRef(false);
 const load=useCallback(async(signal=lifecycle.current?.signal,older=false)=>{
  const snapshot=await loader.current!(projectId,signal,older);
  if(signal?.aborted)return;
  setTasks(snapshot.tasks);setNextOffset(snapshot.nextOffset);setLoaded(true);setError('');
 },[projectId]);
 useEffect(()=>{
  const controller=new AbortController();lifecycle.current=controller;let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{try{if(!document.hidden)await load(controller.signal);}catch(cause){if(!controller.signal.aborted&&!isTaskFetchCancelled(cause)){setError(cause instanceof Error?cause.message:'Could not load tasks.');setLoaded(true);}}finally{if(!controller.signal.aborted)timer=setTimeout(poll,3000);}};
  const refresh=()=>void load(controller.signal).catch(()=>{});
  void poll();window.addEventListener('guildos:tasks-updated',refresh);
  return()=>{controller.abort();clearTimeout(timer);window.removeEventListener('guildos:tasks-updated',refresh);};
 },[load]);
 async function action(id:string,action:'approve'|'cancel'|'retry') {
  if(submitting.current)return;submitting.current=true;setPending(true);setError('');
  try{
   const response=await fetch('/api/studio/tasks',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({taskId:id,action})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not update this task.');
   await load();window.dispatchEvent(new Event('guildos:tasks-updated'));
  }catch(cause){if(!isTaskFetchCancelled(cause)&&!lifecycle.current?.signal.aborted)setError(cause instanceof Error?cause.message:'Could not update this task.');}
  finally{submitting.current=false;setPending(false);}
 }
 const visible=tasks.filter(task=>(agent==='all'||task.agent_role===agent)&&(project==='all'||task.project_id===project));
 const loadOlder=async()=>{
  setLoadingOlder(true);
  try{await load(undefined,true);}catch(cause){if(!isTaskFetchCancelled(cause)&&!lifecycle.current?.signal.aborted)setError(cause instanceof Error?cause.message:'Could not load older tasks.');}
  finally{setLoadingOlder(false);}
 };
 const olderTasks=nextOffset!==null&&<Box sx={{p:2,textAlign:'center'}}><Button disabled={loadingOlder} onClick={()=>void loadOlder()}>{loadingOlder?'Loading older tasks…':'Load older tasks'}</Button></Box>;
 const details=<TaskDetailsDialog task={tasks.find(task=>task.id===selected)||null} onClose={()=>setSelected(null)} onAction={(id,kind)=>void action(id,kind)} pending={pending} error={error} inEditor={view==='list'}/>;
 const content=(task:StudioTask)=>{const display=taskDisplay(task);return <>
  <Stack direction="row" sx={{alignItems:'center',gap:.75,mb:1,flexWrap:'wrap'}}><AgentMark role={task.agent_role} size={22}/><Typography variant="caption" color="text.secondary" sx={{flex:1}}>{agentIdentity[task.agent_role].persona}</Typography><Chip size="small" variant="outlined" label={taskStatusLabels[task.status]||task.status} color={taskStatusColor(task.status)} sx={{fontSize:10,height:22}}/></Stack>
  <Typography variant="body2" sx={{...clamp(2),fontWeight:650,lineHeight:1.4}}>{display.title}</Typography>
  <Typography variant="caption" color="text.secondary" sx={{...clamp(2),mt:.6,lineHeight:1.5}}>{display.description}</Typography>
 </>;};
 const messages=<>{error&&<Alert severity="error" sx={{m:view==='list'?1.5:0,mb:2}} action={<Button size="small" color="inherit" onClick={()=>void load().catch(()=>{})}>Retry</Button>}>{error}</Alert>}{loaded&&!tasks.length&&!error&&<Typography variant="body2" color="text.secondary" sx={{p:3}}>No tasks yet. Send a project message to start work.</Typography>}</>;
 if(!loaded)return <TaskBoardSkeleton list={view==='list'}/>;
 if(view==='list')return <Box sx={{display:'flex',flexDirection:'column',height:'100%',minHeight:0}}>
  <Stack direction="row" sx={{px:2,py:1.5,borderBottom:'1px solid',borderColor:'divider',alignItems:'center',justifyContent:'space-between'}}><Typography variant="subtitle2" sx={{fontWeight:700}}>Project tasks</Typography><Typography variant="caption" color="text.secondary">{tasks.length}</Typography></Stack>
  <Box sx={{overflowY:'auto',flex:1,minHeight:0}}>{messages}<List disablePadding aria-label="Project task list">{visible.map(task=><ListItem key={task.id} disablePadding divider><ListItemButton aria-label={`Open task: ${taskDisplay(task).title}`} onClick={()=>setSelected(task.id)} sx={{display:'block',px:2,py:1.75,minWidth:0}}>{content(task)}</ListItemButton></ListItem>)}</List>{olderTasks}</Box>{details}
 </Box>;
 const inColumn=(task:StudioTask,key:string)=>key==='attention'?['blocked','failed','cancelled'].includes(task.status):key==='running'?['running','delegated'].includes(task.status):key==='done'?['done','changes_requested'].includes(task.status):task.status===key;
 return <Box>{messages}
  <Stack direction={{xs:'column',sm:'row'}} sx={{justifyContent:'space-between',gap:2,mb:2.5,alignItems:{sm:'center'}}}><Typography variant="body2" color="text.secondary">{visible.length} {nextOffset!==null?'loaded ':''}tasks across your workspace</Typography><Stack direction="row" spacing={1}>
   <TextField select size="small" value={agent} onChange={event=>{setAgent(event.target.value);setPages({});}} slotProps={{select:{native:true},htmlInput:{'aria-label':'Filter by agent'}}}><option value="all">All agents</option>{agentRoles.map(role=><option key={role} value={role}>{agentIdentity[role].persona}</option>)}</TextField>
   <TextField select size="small" value={project} onChange={event=>{setProject(event.target.value);setPages({});}} slotProps={{select:{native:true},htmlInput:{'aria-label':'Filter by project'}}}><option value="all">All projects</option>{[...new Set(tasks.map(task=>task.project_id))].map(id=><option key={id} value={id}>{tasks.find(task=>task.project_id===id)?.project_name||'Project'}</option>)}</TextField>
  </Stack></Stack>
  <Box sx={{overflowX:'auto',pb:1}}><Box sx={{display:'grid',gridTemplateColumns:'repeat(5,minmax(230px,1fr))',gap:1.5,minWidth:1210,alignItems:'start'}}>{columns.map(column=>{
   const items=visible.filter(task=>inColumn(task,column.key));
   const count=Math.max(1,Math.ceil(items.length/pageSize));
   const page=Math.min(pages[column.key]||1,count);
   return <Box key={column.key} component="section" aria-label={`${column.title} tasks`} sx={{bgcolor:'#f3f6f4',border:'1px solid #ebefec',borderRadius:2,p:1.5,height:'clamp(360px, calc(100dvh - 290px), 800px)',boxSizing:'border-box',display:'flex',flexDirection:'column',minHeight:0}}><Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between',mb:1.5}}><Typography variant="subtitle2" sx={{fontWeight:700}}>{column.title}</Typography><Chip size="small" label={items.length} sx={{height:22}}/></Stack><Box sx={{flex:1,minHeight:0,overflowY:'auto',overscrollBehaviorY:'contain'}}>{items.slice((page-1)*pageSize,page*pageSize).map(task=><Card key={task.id} variant="outlined" sx={{mb:1.25,borderColor:'#e1e7e2'}}><CardActionArea aria-label={`Open task: ${taskDisplay(task).title}`} onClick={()=>setSelected(task.id)}><CardContent sx={{p:1.75,'&:last-child':{pb:1.75}}}>{content(task)}<Typography variant="caption" color="text.secondary" sx={{display:'block',mt:1.25}}>{task.project_name}</Typography></CardContent></CardActionArea></Card>)}</Box>{count>1&&<Stack sx={{alignItems:'center',gap:1,pt:1.5,flexShrink:0,borderTop:'1px solid',borderColor:'divider'}}><Typography variant="caption" color="text.secondary">{(page-1)*pageSize+1}–{Math.min(page*pageSize,items.length)} of {items.length}</Typography><Pagination size="small" count={count} page={page} siblingCount={0} boundaryCount={1} onChange={(_,value)=>setPages(current=>({...current,[column.key]:value}))} aria-label={`${column.title} task pages`}/></Stack>}</Box>;
  })}</Box></Box>{olderTasks}{details}
 </Box>;
}
