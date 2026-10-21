'use client';

import Link from 'next/link';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material';
import { X } from 'lucide-react';
import { agentIdentity } from '@/lib/studio/agent-roles';
import { taskDisplay, taskStatusLabels, taskStatusColor, type StudioTask } from '@/lib/studio/task-display';
import { AgentMark } from './agent-identity';
import { TaskWaitNotice } from './task-wait-notice';

export function TaskDetailsDialog({task,onClose,onAction,pending=false,error='',inEditor=false}:{task:StudioTask|null;onClose:()=>void;onAction:(id:string,action:'approve'|'cancel'|'retry')=>void;pending?:boolean;error?:string;inEditor?:boolean}) {
 const display=task?taskDisplay(task,{truncateTitle:false}):null;
 return <Dialog open={!!task} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="task-details-title">
  <DialogTitle id="task-details-title" sx={{pr:7,whiteSpace:'normal',overflowWrap:'anywhere',flexShrink:0}}>{display?.title||'Task details'}</DialogTitle>
  <IconButton aria-label="Close task details" onClick={onClose} sx={{position:'absolute',right:12,top:12}}><X size={20}/></IconButton>
  {task&&<><DialogContent dividers sx={{overflowWrap:'anywhere'}}>
   <Stack direction="row" sx={{alignItems:'center',gap:1,mb:2,flexWrap:'wrap'}}><AgentMark role={task.agent_role} size={28}/><Typography variant="body2" sx={{flex:1}}>{agentIdentity[task.agent_role].persona} · {agentIdentity[task.agent_role].name}</Typography><Chip size="small" variant="outlined" color={taskStatusColor(task.status)} label={taskStatusLabels[task.status]||task.status}/></Stack>
   <Typography variant="caption" color="text.secondary">{task.project_name} · {new Date(task.created_at).toLocaleString()}</Typography>
   <Box sx={{mt:2}}><Typography variant="subtitle2" sx={{mb:.75}}>Full instructions</Typography><Typography variant="body2" sx={{whiteSpace:'pre-wrap',lineHeight:1.65}}>{task.instruction}</Typography></Box>
   {task.summary&&<Box sx={{mt:2}}><Typography variant="subtitle2" sx={{mb:.75}}>Agent summary</Typography><Typography variant="body2" sx={{whiteSpace:'pre-wrap',lineHeight:1.65}}>{task.summary}</Typography></Box>}
   {task.wait?<TaskWaitNotice wait={task.wait}/>:task.error&&<Alert severity={['blocked','failed'].includes(task.status)?'error':'info'} sx={{mt:2}}>{task.error}</Alert>}
   {error&&<Alert severity="error" sx={{mt:2}}>{error}</Alert>}
  </DialogContent><DialogActions sx={{px:3,py:2,flexWrap:'wrap',gap:1}}>
   {!inEditor&&<Button component={Link} href={`/studio/projects/${task.project_id}`}>Open project</Button>}
   {!task.parent_task_id&&['queued','running','delegated'].includes(task.status)&&<Button disabled={pending} onClick={()=>onAction(task.id,'cancel')}>Cancel task</Button>}
   {!task.parent_task_id&&['blocked','failed','cancelled'].includes(task.status)&&<Button disabled={pending} onClick={()=>onAction(task.id,'retry')}>Retry task</Button>}
   {!task.parent_task_id&&task.status==='review'&&<Button variant="contained" disabled={pending} onClick={()=>onAction(task.id,'approve')}>Approve changes</Button>}
   <Button onClick={onClose}>Close</Button>
  </DialogActions></>}
 </Dialog>;
}
