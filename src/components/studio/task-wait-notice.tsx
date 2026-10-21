'use client';
import { useEffect, useState } from 'react';
import { Alert, AlertTitle, Typography } from '@mui/material';
import { resetCountdown, type TaskWait } from '@/lib/studio/task-wait';

export function TaskWaitNotice({wait}:{wait:TaskWait}) {
 const [clock,setClock]=useState(()=>Date.now());
 const [offset,setOffset]=useState(0);
 useEffect(()=>{setOffset(Date.parse(wait.serverNow)-Date.now());setClock(Date.now());},[wait.serverNow]);
 useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),30000);return()=>window.clearInterval(timer);},[]);
 const countdown=resetCountdown(wait.resetsAt,clock+offset);
 const time=new Date(wait.resetsAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
 return <Alert severity="warning" role="status" sx={{mt:1,alignItems:'flex-start'}}>
  <AlertTitle sx={{fontSize:'inherit',fontWeight:650}}>Queued · daily limit reached</AlertTitle>
  <Typography variant="body2" sx={{fontSize:'inherit',lineHeight:1.5}}>{countdown==='now'?'The limit has reset. Your saved request is waiting for an agent.':<>Your request is saved. We’ll pick it up automatically after the limit resets in <strong>{countdown}</strong> (<time dateTime={wait.resetsAt}>{time}</time>).</>}</Typography>
 </Alert>;
}
