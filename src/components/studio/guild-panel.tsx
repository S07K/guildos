'use client';
import { useEffect, useState } from 'react';
import { Alert, Avatar, Box, Button, Chip, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { agentRoles, agentIdentity, type AgentRole, type AgentAnchor } from '@/lib/studio/agent-roles';
import { AgentMark, GuildLineup } from './agent-identity';

export type GuildNote = { id: string; version_id: string | null; author_role: AgentRole | 'human'; mentioned_role: AgentRole | null; anchor: AgentAnchor; body: string; created_at: string };
const names: Record<AgentRole | 'human', string> = { human: 'You', ...Object.fromEntries(agentRoles.map(role => [role, agentIdentity[role].name])) } as Record<AgentRole | 'human', string>;
const anchors: AgentAnchor[] = ['page', 'header', 'hero', 'features', 'closing', 'footer'];

export function GuildPanel({ projectId, versionId, currentAnchor, addedNotes = [] }: { projectId: string; versionId: string | null; currentAnchor: AgentAnchor; addedNotes?: GuildNote[] }) {
 const [notes, setNotes] = useState<GuildNote[]>(addedNotes);
 const [text, setText] = useState('');
 const [anchor, setAnchor] = useState<AgentAnchor>(currentAnchor);
 const [mention, setMention] = useState<AgentRole | ''>('');
 const [error, setError] = useState('');
 const [saving, setSaving] = useState(false);
 useEffect(() => { setAnchor(currentAnchor); }, [currentAnchor]);
 useEffect(() => {
  let cancelled = false;
  fetch(`/api/studio/notes?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' }).then(async response => {
   const data = await response.json();
   if (!response.ok) throw new Error(data.error || 'Could not load guild discussion.');
   if (!cancelled) setNotes(data.notes);
  }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load guild discussion.'); });
  return () => { cancelled = true; };
 }, [projectId]);
 useEffect(() => { if (addedNotes.length) setNotes(items => [...items.filter(item => !addedNotes.some(added => added.id === item.id)), ...addedNotes]); }, [addedNotes]);
 async function submit() {
  if (!text.trim() || saving) return;
  setSaving(true); setError('');
  try {
   const response = await fetch('/api/studio/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, versionId, anchor, mentionedRole: mention || null, text: text.trim() }) });
   const data = await response.json();
   if (!response.ok) throw new Error(data.error || 'Could not save comment.');
   setNotes(items => [...items, data.note]); setText(''); setMention('');
  } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save comment.'); }
  finally { setSaving(false); }
 }
 const visible = notes.filter(note => !versionId || !note.version_id || note.version_id === versionId);
 return <Stack spacing={2} sx={{ p: 2.5 }}>
  <Box><Typography variant="h6">Guild discussion</Typography><Typography variant="body2" color="text.secondary">Specialists pass decisions and design feedback to one another. Your direction stays in the thread.</Typography></Box>
  <GuildLineup compact/>
  <Divider/>
  {visible.length ? <Stack spacing={1.5} aria-label="Design comments">{visible.map(note => <Box key={note.id} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: note.author_role === 'human' ? '#f1f6f2' : 'background.paper' }}>
   <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>{note.author_role === 'human' ? <Avatar sx={{ width: 28, height: 28, fontSize: 10, fontWeight: 700, bgcolor: '#486b55' }}>Y</Avatar> : <AgentMark role={note.author_role} size={28}/>}<Box sx={{ minWidth: 0, flex: 1 }}><Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>{names[note.author_role]}</Typography><Typography variant="caption" color="text.secondary">{note.anchor} · {new Date(note.created_at).toLocaleDateString()}</Typography></Box></Stack>
   <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{note.body}</Typography>
   {note.mentioned_role && <Chip size="small" label={`@${names[note.mentioned_role]}`} sx={{ mt: 1, fontSize: 10, bgcolor: '#eaf1ed', color: '#376149' }}/ >}
  </Box>)}</Stack> : <Typography variant="body2" color="text.secondary">No comments on this version yet. Leave direction below or run the guild to start a review.</Typography>}
  <Divider/>
  <Typography variant="subtitle2">Leave direction</Typography>
  <TextField label="Comment" size="small" multiline minRows={3} value={text} onChange={event => setText(event.target.value)} placeholder="What should the guild consider?" slotProps={{ htmlInput: { maxLength: 2000 } }}/>
  <TextField select label="On section" size="small" value={anchor} onChange={event => setAnchor(event.target.value as AgentAnchor)}>{anchors.map(item => <MenuItem key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</MenuItem>)}</TextField>
  <TextField select label="Mention an agent" size="small" value={mention} onChange={event => setMention(event.target.value as AgentRole | '')}><MenuItem value="">No mention</MenuItem>{agentRoles.map(role => <MenuItem key={role} value={role}>{names[role]}</MenuItem>)}</TextField>
  <Button variant="contained" disabled={!text.trim() || saving} onClick={() => void submit()}>{saving ? 'Posting…' : 'Post comment'}</Button>
  {error && <Alert severity="error">{error}</Alert>}
 </Stack>;
}
