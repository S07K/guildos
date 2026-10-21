'use client';
import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, Divider, Drawer, IconButton, List, ListItemButton, ListItemText, Stack, TextField, Typography } from '@mui/material';
import { X as CloseOutlined } from 'lucide-react';
import { Send as SendOutlined } from 'lucide-react';
import { agentIdentity, agentRoles, type AgentRole } from '@/lib/studio/agent-roles';
import { AgentMark } from './agent-identity';

type Message = { id: string; author_kind: 'human'|'agent'; body: string; created_at: string; input_tokens?: number; output_tokens?: number; model?: string };
export function AgentConversation({ projectId, role, open, onClose, onSelectRole, onApplyDirection }: { projectId: string; role: AgentRole; open: boolean; onClose: () => void; onSelectRole: (role: AgentRole) => void; onApplyDirection: (text: string) => void }) {
 const [messages, setMessages] = useState<Message[]>([]), [text, setText] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [loading, setLoading] = useState(false);
 const end = useRef<HTMLDivElement>(null); const identity = agentIdentity[role];
 useEffect(() => {
  if (!open) return;
  let cancelled = false; setError('');
  fetch(`/api/studio/agents/${role}/messages?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' }).then(async response => {
   const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not load this conversation.');
   if (!cancelled) setMessages(data.messages || []);
  }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load this conversation.'); });
  return () => { cancelled = true; };
 }, [open, projectId, role]);
 useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, loading]);
 async function send() {
  const message = text.trim(); if (!message || loading) return;
  setLoading(true); setError('');
  try {
   const response = await fetch(`/api/studio/agents/${role}/messages?projectId=${encodeURIComponent(projectId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: message }) });
   const data = await response.json(); if (!response.ok) throw new Error(data.error || `${identity.persona} could not reply.`);
   setMessages(items => [...items, ...data.messages]); setText('');
   if (data.switchedFrom) setNotice(`Usage limit reached. Continued with ${data.usage?.model?.startsWith('chatgpt/') ? 'your ChatGPT plan' : data.usage?.model?.startsWith('openrouter/')?'OpenRouter':data.usage?.model?.startsWith('groq/')?'Groq':'your OpenAI API key'}.`);
  } catch (cause) { setError(cause instanceof Error ? cause.message : 'The agent could not reply.'); }
  finally { setLoading(false); }
 }
 return <Drawer anchor="right" open={open} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: '100%', sm: 590 }, maxWidth: '100%', display: 'flex' } } }}>
  <Stack direction="row" sx={{ minHeight: 70, alignItems: 'center', px: 2, borderBottom: '1px solid', borderColor: 'divider', gap: 1.5 }}><AgentMark role={role} size={44}/><Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontWeight: 700 }}>{identity.persona} <Typography component="span" color="text.secondary">· {identity.name}</Typography></Typography><Typography variant="caption" color="text.secondary">Project conversation · context aware</Typography></Box><IconButton aria-label="Close conversation" onClick={onClose}><CloseOutlined/></IconButton></Stack>
  <Box sx={{ display: 'grid', gridTemplateColumns: '148px minmax(0,1fr)', flex: 1, minHeight: 0 }}>
   <Box sx={{ borderRight: '1px solid', borderColor: 'divider', overflowY: 'auto', py: 1 }}><Typography variant="overline" sx={{ px: 2, color: 'text.secondary', fontSize: 10 }}>YOUR GUILD</Typography><List dense disablePadding>{agentRoles.map(item => <ListItemButton key={item} selected={item === role} onClick={() => onSelectRole(item)} sx={{ py: 1.2, '&.Mui-selected': { bgcolor: '#edf3ee' } }}><AgentMark role={item} size={30}/><ListItemText sx={{ ml: 1, minWidth: 0 }} primary={agentIdentity[item].persona} secondary={agentIdentity[item].name} slotProps={{ primary: { sx: { fontSize: 12, fontWeight: 650 } }, secondary: { sx: { fontSize: 10, whiteSpace: 'nowrap' } } }}/></ListItemButton>)}</List></Box>
   <Stack sx={{ minWidth: 0, minHeight: 0 }}>
    <Stack direction="row" sx={{ px: 2, py: 1.5, alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider' }}><Box><Typography variant="subtitle2">Chat with {identity.persona}</Typography><Typography variant="caption" color="text.secondary">{identity.action}</Typography></Box><Chip size="small" label="This project" variant="outlined"/></Stack>
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 2, py: 2.5 }}>
     {messages.length === 0 && <Stack sx={{ minHeight: '100%', justifyContent: 'center', alignItems: 'center', textAlign: 'center', px: 2 }} spacing={1.5}><AgentMark role={role} size={70}/><Typography variant="h6">Talk it through with {identity.persona}.</Typography><Typography variant="body2" color="text.secondary">They know this project&apos;s brief, current draft, and guild discussion. Ask for feedback or work through a design decision.</Typography><Button size="small" onClick={() => setText(`Review the ${identity.short.toLowerCase()} of this project and suggest one improvement.`)}>Ask for a review</Button></Stack>}
     <Stack spacing={2}>{messages.map(message => <Stack key={message.id} direction="row" spacing={1.2} sx={{ alignItems: 'flex-start', flexDirection: message.author_kind === 'human' ? 'row-reverse' : 'row' }}>{message.author_kind === 'agent' && <AgentMark role={role} size={31}/>}<Box sx={{ maxWidth: '88%', minWidth: 0 }}><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: .5, textAlign: message.author_kind === 'human' ? 'right' : 'left' }}>{message.author_kind === 'human' ? 'You' : identity.persona}</Typography><Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: message.author_kind === 'human' ? '#dce8df' : 'divider', bgcolor: message.author_kind === 'human' ? '#f2f7f3' : 'background.paper' }}><Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.65 }}>{message.body}</Typography></Box>{message.author_kind === 'agent' && <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: .5 }}>{!!(message.input_tokens || message.output_tokens) && <Typography variant="caption" color="text.secondary">{(message.input_tokens || 0) + (message.output_tokens || 0)} tokens</Typography>}<Button size="small" onClick={() => { onApplyDirection(message.body); onClose(); }}>Use as revision direction</Button></Stack>}</Box></Stack>)}</Stack>
     {loading && <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 2 }}><AgentMark role={role} size={30} state="working"/><Typography variant="body2" color="text.secondary">{identity.persona} is thinking…</Typography></Stack>}
     <div ref={end}/>
    </Box>
    {error && <Alert severity="error" sx={{ mx: 2, mb: 1 }}>{error}</Alert>}
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mx: 2, mb: 1 }}>{notice}</Alert>}
    <Divider/>
    <Stack direction="row" spacing={1} sx={{ p: 2, alignItems: 'flex-end' }}><TextField fullWidth multiline minRows={2} maxRows={6} label={`Message ${identity.persona}`} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Ask about this project…" slotProps={{ htmlInput: { maxLength: 4000 } }}/><IconButton color="primary" aria-label={`Send message to ${identity.persona}`} disabled={!text.trim() || loading} onClick={() => void send()} sx={{ width: 48, height: 48, borderRadius: 2, bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' }, '&.Mui-disabled': { bgcolor: 'action.disabledBackground' } }}><SendOutlined/></IconButton></Stack>
    <Typography variant="caption" color="text.secondary" sx={{ px: 2, pb: 1.5 }}>Replies use your connected provider. Enter to send · Shift + Enter for a new line.</Typography>
   </Stack>
  </Box>
 </Drawer>;
}
