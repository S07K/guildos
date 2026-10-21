'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';

export function DeleteProjectDialog({project,onClose,onDeleted}:{project:{id:string;name:string}|null;onClose:()=>void;onDeleted:(id:string)=>void}) {
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{setError('');},[project?.id]);
 async function remove(){
  if(!project||busy)return;
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/studio/projects',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:project.id})});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||'The project could not be deleted. Please retry.');
   onDeleted(project.id);
  }catch(error){setError(error instanceof Error?error.message:'The project could not be deleted. Please retry.');}
  finally{setBusy(false);}
 }
 return <Dialog open={!!project} onClose={()=>{if(!busy)onClose();}} fullWidth maxWidth="xs" aria-labelledby="delete-project-title" aria-describedby="delete-project-description">
  <DialogTitle id="delete-project-title">Delete project?</DialogTitle>
  <DialogContent>
   <DialogContentText id="delete-project-description">Delete “{project?.name}” and all its saved designs, conversations, agent tasks, and uploaded images? This cannot be undone.</DialogContentText>
   {error&&<Alert severity="error" sx={{mt:2}}>{error}</Alert>}
  </DialogContent>
  <DialogActions sx={{px:3,pb:2.5}}><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="contained" color="error" disabled={busy} onClick={()=>void remove()}>{busy?'Deleting…':'Delete project'}</Button></DialogActions>
 </Dialog>;
}
