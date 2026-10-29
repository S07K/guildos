'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Divider, Stack, TextField } from '@mui/material';
import { configureBrowserAuth, signInWithGoogle } from '@/lib/auth/browser';
import { createProject, saveProviderKey, removeProviderKey, saveOpenRouterKey, removeOpenRouterKey, saveGroqKey, removeGroqKey, sendCode, verifyCode } from '@/app/studio/actions';
function useFieldErrors() {
 const [errors,setErrors]=useState<Record<string,string>>({});
 function validate(form: HTMLFormElement) {
  const next: Record<string,string> = {};
  for (const field of Array.from(form.elements)) {
   if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) || !field.name || field.disabled) continue;
   const label = field.name === 'code' ? 'sign-in code' : field.name === 'brief' ? 'creative brief' : field.name === 'key' ? 'API key' : field.name === 'name' ? 'project name' : 'email address';
   if (field.required && !field.value.trim()) next[field.name] = `Enter your ${label}.`;
   else if (field.type === 'email' && field.validity.typeMismatch) next[field.name] = 'Enter a valid email address.';
   else if (field instanceof HTMLInputElement && field.pattern && !new RegExp(`^(?:${field.pattern})$`).test(field.value)) next[field.name] = `Enter a valid ${label}.`;
   else if (field.minLength > 0 && field.value.length < field.minLength) next[field.name] = `Enter at least ${field.minLength} characters.`;
  }
  setErrors(next);
  return Object.keys(next).length === 0;
 }
 function field(name:string) { return {error:!!errors[name],helperText:errors[name],sx: errors[name] ? {'& .MuiOutlinedInput-root':{bgcolor:'rgba(254,242,242,.1)','& fieldset':{borderColor:'#ef4444'},'&.Mui-focused':{boxShadow:'0 0 0 3px rgba(239,68,68,.2)'}},'& input::placeholder,& textarea::placeholder':{color:'#f87171'},'& .MuiFormHelperText-root':{fontSize:12,fontWeight:500,mt:.75,color:'#ef4444'}} : undefined,onChange:()=>setErrors(current=>({...current,[name]:''}))}; }
 return {validate,field};
}
export function SignInForm({config,nextUrl='/studio',initialError=''}:{config:{url:string;key:string};nextUrl?:string;initialError?:string}) {
 const {validate,field}=useFieldErrors();
 const [email,setEmail]=useState(''); const [sent,setSent]=useState(false); const [error,setError]=useState(initialError); const [pending,start]=useTransition();
 return <Stack component="form" noValidate spacing={2.5} onSubmit={event=>{event.preventDefault();if(!validate(event.currentTarget))return;const form=new FormData(event.currentTarget);setError('');start(async()=>{try{const result=sent?await verifyCode(email,String(form.get('code')||'').trim()):await sendCode(email);if(result&&'error' in result)setError(result.error||'Please try again.');else if(sent&&result&&'verified' in result)window.location.replace(nextUrl);else if(!sent)setSent(true);}catch{setError('Unable to sign in. Please try again.');}});}}>
  {!sent&&<><Button variant="outlined" startIcon={<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.75 3.27-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.87 0-5.3-1.94-6.17-4.55H2.15v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.83 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.15a11 11 0 0 0 0 9.86Z"/><path fill="#EA4335" d="M12 5.36c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1a11 11 0 0 0-9.85 6.07l3.68 2.84C6.7 7.3 9.13 5.36 12 5.36Z"/></svg>} sx={{borderRadius:99,bgcolor:"white",color:"#1f1f1f",borderColor:"#dadce0",textTransform:"none",fontWeight:500,"&:hover":{bgcolor:"#f8faff",boxShadow:2}}} type="button" disabled={pending} onClick={()=>{setError('');start(async()=>{try{configureBrowserAuth(config);await signInWithGoogle(nextUrl);}catch{setError('Google sign-in is unavailable. Try again or use an email code.');}});}}>Continue with Google</Button><Divider sx={{fontSize:12,color:'text.secondary'}}>or continue with email</Divider></>}
  <TextField {...field("email")} name="email" label="Email address" type="email" value={email} onChange={e=>{field("email").onChange();setEmail(e.target.value)}} required autoComplete="email" disabled={sent||pending} slotProps={{htmlInput:{maxLength:254}}}/>
  {sent&&<><Alert severity="info" role="status">Check your email for your sign-in code.</Alert><TextField {...field("code")} label="Email code" name="code" required autoFocus autoComplete="one-time-code" slotProps={{htmlInput:{inputMode:'numeric',pattern:'[0-9]{6,8}',minLength:6,maxLength:8}}}/></>}
  {error&&<Alert severity="error">{error}</Alert>}<Button variant={sent?"contained":"outlined"} type="submit" disabled={pending}>{pending?'One moment…':sent?'Enter your studio':'Send sign-in code'}</Button>
  {sent&&<Button type="button" disabled={pending} onClick={()=>{setSent(false);setError('');}}>Use another email or request a new code</Button>}
 </Stack>;
}
export function ProjectForm() {
 const {validate,field}=useFieldErrors();
 const [error,setError]=useState('');const [pending,start]=useTransition();
 return <Stack component="form" noValidate spacing={3} onSubmit={event=>{event.preventDefault();if(!validate(event.currentTarget))return;const form=new FormData(event.currentTarget);setError('');start(async()=>{try{const result=await createProject(form);if(result?.error)setError(result.error);}catch{setError('Your brief could not be saved. Please try again.');}});}}>
  <TextField {...field("name")} label="Project name" name="name" required placeholder="Give your idea a name" slotProps={{htmlInput:{maxLength:100}}}/>
  <TextField {...field("brief")} label="Your creative brief" name="brief" required multiline rows={7} placeholder="What are you building? Who is it for? Describe the tone, benefits, and the action visitors should take." slotProps={{htmlInput:{minLength:20,maxLength:12000}}}/>
  {error&&<Alert severity="error">{error}</Alert>}<Button variant="contained" type="submit" disabled={pending}>{pending?'Saving your brief…':'Create project'}</Button>
 </Stack>;
}
export function KeyForm({connected,onSaved,onRemoved}:{connected:boolean;onSaved?:(suffix:string)=>void;onRemoved?:()=>void}) {
 const {validate,field}=useFieldErrors();
 const [message,setMessage]=useState('');const [error,setError]=useState('');const [pending,start]=useTransition();const router=useRouter();
 return <Stack component="form" noValidate spacing={2.5} onSubmit={event=>{event.preventDefault();if(!validate(event.currentTarget))return;const element=event.currentTarget;const data=new FormData(element);setError('');setMessage('');start(async()=>{try{const result=await saveProviderKey(data);if(result.error)setError(result.error);else{const savedKey=String(data.get('key')||'');element.reset();setMessage('Your key is securely saved.');onSaved?.(savedKey.slice(-4));}}catch{setError('Unable to save your key. Please try again.');}});}}>
  <TextField {...field("key")} label={connected?'Replace your API key':'OpenAI API key'} name="key" type="password" required autoComplete="off" placeholder="sk-…" slotProps={{htmlInput:{maxLength:503,spellCheck:false}}}/>
  {error&&<Alert severity="error">{error}</Alert>}{message&&<Alert severity="success" role="status">{message}</Alert>}
  <Stack direction="row" spacing={1.5}><Button variant="contained" type="submit" disabled={pending}>{pending?'Saving…':'Save key'}</Button>{connected&&<Button type="button" variant="outlined" color="error" disabled={pending} onClick={()=>{setError('');setMessage('');start(async()=>{try{const result=await removeProviderKey();if(result.error)setError(result.error);else{setMessage('Your key has been removed.');onRemoved?.();router.refresh();}}catch{setError('Unable to remove your key.');}});}}>Remove key</Button>}</Stack>
 </Stack>;
}

export function OpenRouterKeyForm({connected,onSaved,onRemoved}:{connected:boolean;onSaved?:(suffix:string)=>void;onRemoved?:()=>void}) {
 const {validate,field}=useFieldErrors();
 const [message,setMessage]=useState('');const [error,setError]=useState('');const [pending,start]=useTransition();const router=useRouter();
 return <Stack component="form" noValidate spacing={2.5} onSubmit={event=>{event.preventDefault();if(!validate(event.currentTarget))return;const element=event.currentTarget;const data=new FormData(element);setError('');setMessage('');start(async()=>{try{const result=await saveOpenRouterKey(data);if(result.error)setError(result.error);else{const savedKey=String(data.get('key')||'');element.reset();setMessage('OpenRouter is connected. New agent tasks will use it first.');onSaved?.(savedKey.slice(-4));router.refresh();}}catch{setError('Unable to connect OpenRouter. Please try again.');}});}}>
  <TextField {...field("key")} label={connected?'Replace OpenRouter key':'OpenRouter API key'} name="key" type="password" required autoComplete="off" placeholder="sk-or-v1-…" slotProps={{htmlInput:{maxLength:512,spellCheck:false}}}/>
  {error&&<Alert severity="error">{error}</Alert>}{message&&<Alert severity="success" role="status">{message}</Alert>}
  <Stack direction="row" spacing={1.5}><Button variant="contained" type="submit" disabled={pending}>{pending?'Connecting…':'Save key'}</Button>{connected&&<Button type="button" variant="outlined" color="error" disabled={pending} onClick={()=>{setError('');setMessage('');start(async()=>{try{const result=await removeOpenRouterKey();if(result.error)setError(result.error);else{setMessage('OpenRouter disconnected.');onRemoved?.();router.refresh();}}catch{setError('Unable to remove your OpenRouter key.');}});}}>Remove key</Button>}</Stack>
 </Stack>;
}

export function GroqKeyForm({connected,onSaved,onRemoved}:{connected:boolean;onSaved?:(suffix:string)=>void;onRemoved?:()=>void}) {
 const {validate,field}=useFieldErrors();
 const [message,setMessage]=useState('');const [error,setError]=useState('');const [pending,start]=useTransition();const router=useRouter();
 return <Stack component="form" noValidate spacing={2.5} onSubmit={event=>{event.preventDefault();if(!validate(event.currentTarget))return;const element=event.currentTarget;const data=new FormData(element);setError('');setMessage('');start(async()=>{try{const result=await saveGroqKey(data);if(result.error)setError(result.error);else{const savedKey=String(data.get('key')||'');element.reset();setMessage('Groq is connected and available for agent tasks.');onSaved?.(savedKey.slice(-4));router.refresh();}}catch{setError('Unable to connect Groq. Please try again.');}});}}>
  <TextField {...field("key")} label={connected?'Replace Groq API key':'Groq API key'} name="key" type="password" required autoComplete="off" placeholder="gsk_…" slotProps={{htmlInput:{maxLength:504,spellCheck:false}}}/>
  {error&&<Alert severity="error">{error}</Alert>}{message&&<Alert severity="success" role="status">{message}</Alert>}
  <Stack direction="row" spacing={1.5}><Button variant="contained" type="submit" disabled={pending}>{pending?'Connecting…':'Save key'}</Button>{connected&&<Button type="button" variant="outlined" color="error" disabled={pending} onClick={()=>{setError('');setMessage('');start(async()=>{try{const result=await removeGroqKey();if(result.error)setError(result.error);else{setMessage('Groq disconnected.');onRemoved?.();router.refresh();}}catch{setError('Unable to remove your Groq key.');}});}}>Remove key</Button>}</Stack>
 </Stack>;
}
