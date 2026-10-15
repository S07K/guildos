'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Stack, TextField } from '@mui/material';
import { createProject, saveProviderKey, removeProviderKey, sendCode, verifyCode } from '@/app/studio/actions';
export function SignInForm() {
 const [email,setEmail]=useState(''); const [sent,setSent]=useState(false); const [error,setError]=useState(''); const [pending,start]=useTransition();
 return <Stack component="form" spacing={2.5} onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);setError('');start(async()=>{try{const result=sent?await verifyCode(email,String(form.get('code')||'').trim()):await sendCode(email);if(result&&'error' in result)setError(result.error||'Please try again.');else if(sent&&result&&'verified' in result)window.location.replace('/studio');else if(!sent)setSent(true);}catch{setError('Unable to sign in. Please try again.');}});}}>
  <TextField label="Email address" type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" disabled={sent||pending} slotProps={{htmlInput:{maxLength:254}}}/>
  {sent&&<><Alert severity="info" role="status">Check your email for your sign-in code.</Alert><TextField label="Email code" name="code" required autoFocus autoComplete="one-time-code" slotProps={{htmlInput:{inputMode:'numeric',pattern:'[0-9]{6,8}',minLength:6,maxLength:8}}}/></>}
  {error&&<Alert severity="error">{error}</Alert>}<Button variant="contained" type="submit" disabled={pending}>{pending?'One moment…':sent?'Enter your studio':'Send sign-in code'}</Button>
  {sent&&<Button type="button" disabled={pending} onClick={()=>{setSent(false);setError('');}}>Use another email or request a new code</Button>}
 </Stack>;
}
export function ProjectForm() {
 const [error,setError]=useState('');const [pending,start]=useTransition();
 return <Stack component="form" spacing={3} onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);setError('');start(async()=>{try{const result=await createProject(form);if(result?.error)setError(result.error);}catch{setError('Your brief could not be saved. Please try again.');}});}}>
  <TextField label="Project name" name="name" required placeholder="Give your idea a name" slotProps={{htmlInput:{maxLength:100}}}/>
  <TextField label="Your creative brief" name="brief" required multiline rows={7} placeholder="What are you building? Who is it for? Describe the tone, benefits, and the action visitors should take." slotProps={{htmlInput:{minLength:20,maxLength:12000}}}/>
  <TextField label="Primary button destination" name="cta_url" type="url" required placeholder="https://your-website.com/signup" helperText="The call to action on your generated page will link here." slotProps={{htmlInput:{maxLength:2048}}}/>
  {error&&<Alert severity="error">{error}</Alert>}<Button variant="contained" type="submit" disabled={pending}>{pending?'Saving your brief…':'Create project'}</Button>
 </Stack>;
}
export function KeyForm({connected,onSaved,onRemoved}:{connected:boolean;onSaved?:(suffix:string)=>void;onRemoved?:()=>void}) {
 const [message,setMessage]=useState('');const [error,setError]=useState('');const [pending,start]=useTransition();const router=useRouter();
 return <Stack component="form" spacing={2.5} onSubmit={event=>{event.preventDefault();const element=event.currentTarget;const data=new FormData(element);setError('');setMessage('');start(async()=>{try{const result=await saveProviderKey(data);if(result.error)setError(result.error);else{const savedKey=String(data.get('key')||'');element.reset();setMessage('Your key is securely saved.');onSaved?.(savedKey.slice(-4));}}catch{setError('Unable to save your key. Please try again.');}});}}>
  <TextField label={connected?'Replace your API key':'OpenAI API key'} name="key" type="password" required autoComplete="off" placeholder="sk-…" slotProps={{htmlInput:{maxLength:503,spellCheck:false}}}/>
  {error&&<Alert severity="error">{error}</Alert>}{message&&<Alert severity="success" role="status">{message}</Alert>}
  <Stack direction="row" spacing={1.5}><Button variant="contained" type="submit" disabled={pending}>{pending?'Saving…':'Save key'}</Button>{connected&&<Button type="button" variant="outlined" color="error" disabled={pending} onClick={()=>{setError('');setMessage('');start(async()=>{try{const result=await removeProviderKey();if(result.error)setError(result.error);else{setMessage('Your key has been removed.');onRemoved?.();router.refresh();}}catch{setError('Unable to remove your key.');}});}}>Remove key</Button>}</Stack>
 </Stack>;
}
