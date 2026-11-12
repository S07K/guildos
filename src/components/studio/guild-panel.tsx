'use client';

import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Avatar, Box, Button, Chip, Skeleton, IconButton, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { AccountContext } from './account-menu';
import { conversationSegments } from '@/lib/studio/conversation-highlights';
import { dropdownSurfaceSx } from './dropdown-surface';
import { ArrowUp, Hash, Square, X } from 'lucide-react';
import { agentRoles, agentIdentity, type AgentRole, type AgentAnchor } from '@/lib/studio/agent-roles';
import { AgentProgress, type ReviewFeedback, type StoppedTask, type WaitingMessage } from './agent-progress';
import { AgentWorkingIndicator } from './agent-working-indicator';
import { TaskWaitNotice } from './task-wait-notice';
import { AgentMark } from './agent-identity';
import { ConversationSkeleton } from './loading-states';
import Link from 'next/link';
import type { TrialStatus } from '@/lib/studio/trial';
import type { SelectionPreview } from './html-screen-frame';
import { SelectionThumbnail } from './selection-preview';

/** An element picked on an HTML screen; the composer offers Section edit, Add section or Global edit for it. */
/** A selected screen, or an element in it (sectionId set): whole screens are edited globally, elements by section. */
export type ScreenTarget = { screenId: string; sectionId?: string; path?: string; label: string; preview?: SelectionPreview };
export type ScopeMode = 'section' | 'add' | 'global';

export type GuildNote = { id: string; version_id: string | null; author_role: AgentRole | 'human'; mentioned_role: AgentRole | null; anchor: AgentAnchor; body: string; displayContent?: string; created_at: string };
const names: Record<AgentRole | 'human', string> = { human: 'You', ...Object.fromEntries(agentRoles.map(role => [role, agentIdentity[role].persona])) } as Record<AgentRole | 'human', string>;
const mentionPattern = /(^|\s)@([\p{L}\p{N}_-]*)$/u;
const layerMentionPattern = /(^|\s)#([\p{L}\p{N}_ -]*)$/u;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function messageBody(note: GuildNote) {
 if (note.author_role === 'human') return note.displayContent ?? note.body;
 const persona = agentIdentity[note.author_role].persona;
 return note.body.replace(new RegExp(`^\\s*${persona}\\s*(?::|[–—-])\\s*`, 'i'), '');
}
async function conversationData(response:Response) {
 if(!response.headers.get('content-type')?.includes('application/json')) throw new Error('The project conversation is temporarily unavailable. Please retry.');
 try{return await response.json();}
 catch{throw new Error('The project conversation returned an invalid response. Please retry.');}
}

export function GuildPanel({ projectId, versionId, layers: layerOptions = [], initialMention = null, onInitialMentionUsed, selectedContext = null, screenTarget = null, onClearScreenTarget, scopeRequest = null, trial = null }: { screenTarget?: ScreenTarget | null; onClearScreenTarget?: () => void; scopeRequest?: { mode: ScopeMode; at: number } | null; trial?: TrialStatus | null; projectId: string; versionId: string | null; layers?: { id: string; name: string }[]; initialMention?: AgentRole | null; onInitialMentionUsed?: () => void; selectedContext?: { id: string; name: string } | null }) {
 const { avatarUrl } = useContext(AccountContext);
 const [conversationLoaded, setConversationLoaded] = useState(false);
 const [notes, setNotes] = useState<GuildNote[]>([]);
 const [text, setText] = useState('');
 const [workingAgents, setWorkingAgents] = useState<AgentRole[]>([]);
 const [activeTaskIds, setActiveTaskIds] = useState<string[]>([]);
 const [stoppedTask, setStoppedTask] = useState<StoppedTask|null>(null);
 const [stopping, setStopping] = useState(false);
 const [taskWaits, setTaskWaits] = useState<WaitingMessage[]>([]);
 const [reviewFeedback, setReviewFeedback] = useState<ReviewFeedback|null>(null);
 const [composerContext, setComposerContext] = useState(selectedContext);
 const [targetLayerId, setTargetLayerId] = useState<string|null>(selectedContext?.id||null);
 const [scopeMode, setScopeMode] = useState<ScopeMode>('section');
 const [previewOpen, setPreviewOpen] = useState(false);
 // The screen toolbar's Global/Section edit and Add section pick the mode and focus the composer.
 useEffect(() => { if (!scopeRequest) return; setScopeMode(scopeRequest.mode); requestAnimationFrame(() => inputRef.current?.focus()); }, [scopeRequest]);
 useLayoutEffect(() => { setScopeMode(screenTarget?.sectionId ? 'section' : 'global'); }, [screenTarget?.screenId, screenTarget?.sectionId, screenTarget?.path]);
 const [error, setError] = useState('');
 const [saving, setSaving] = useState(false);
 const pendingMessage = useRef<{payload:string;requestId:string}|null>(null);
 const sending = useRef(false);
 const [mentionQuery, setMentionQuery] = useState<string | null>(null);
 const [layerQuery, setLayerQuery] = useState<string | null>(null);
 const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
 const [caret, setCaret] = useState(0);
 const inputRef = useRef<HTMLTextAreaElement>(null);
 const textOverlayRef = useRef<HTMLDivElement>(null);
 const feedRef = useRef<HTMLDivElement>(null);
 const activeOptionRef = useRef<HTMLButtonElement>(null);

 useEffect(() => {
  if (!initialMention) return;
  const persona = agentIdentity[initialMention].persona;
  setText(current => current ? `${current} @${persona} ` : `@${persona} `);
  requestAnimationFrame(() => inputRef.current?.focus());
  onInitialMentionUsed?.();
 }, [initialMention, onInitialMentionUsed]);
 useEffect(() => {
  let cancelled = false;
  let hasLoaded = false;
  const load = () => fetch(`/api/studio/notes?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' }).then(async response => {
   const data = await conversationData(response);
   if (!response.ok) throw new Error(data.error || 'Could not load the project conversation.');
   if (!cancelled) {
    setConversationLoaded(true);
    setNotes((current: GuildNote[]) => [...current.filter(note => !data.notes.some((fresh: GuildNote) => fresh.id === note.id)), ...data.notes].sort((a: GuildNote,b: GuildNote) => a.created_at.localeCompare(b.created_at)));
    if (!hasLoaded) { hasLoaded = true; setError(''); }
   }
  }).catch(cause => { if (!cancelled&&!hasLoaded) setError(cause instanceof Error ? cause.message : 'Could not load the project conversation.'); });
  void load();
  const interval = window.setInterval(() => void load(), 2500);
  return () => { cancelled = true; window.clearInterval(interval); };
 }, [projectId]);
 useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [notes.length]);
 useEffect(() => { setActiveSuggestionIndex(0); }, [mentionQuery, layerQuery]);
 useEffect(() => { activeOptionRef.current?.scrollIntoView({ block: 'nearest' }); }, [activeSuggestionIndex]);
 useLayoutEffect(() => { setComposerContext(selectedContext); setTargetLayerId(selectedContext?.id||null); }, [selectedContext?.id, selectedContext?.name]);
 useLayoutEffect(() => {
  const textarea = inputRef.current;
  const overlay = textOverlayRef.current;
  if (!textarea || !overlay) return;
  const syncTextMetrics = () => {
   const style = window.getComputedStyle(textarea);
   for (const property of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch', 'fontKerning', 'fontFeatureSettings', 'letterSpacing', 'lineHeight', 'wordSpacing', 'textIndent', 'textTransform', 'textAlign', 'direction', 'tabSize'] as const) {
    overlay.style[property] = style[property];
   }
  };
  syncTextMetrics();
  const observer = new ResizeObserver(syncTextMetrics);
  observer.observe(textarea);
  return () => observer.disconnect();
 }, []);

 function requestChanges(feedback: ReviewFeedback) {
  setReviewFeedback(feedback); setComposerContext(null); setTargetLayerId(feedback.instruction.match(/\u2063guildos-layer:([a-z0-9-]{1,80})\u2063/i)?.[1]||null); setText('');
  requestAnimationFrame(() => inputRef.current?.focus());
 }
 function resolveLayerMention(value:string) {
  return layerOptions.flatMap(layer=>[layer.name,layer.name.replace(/\s+/g,'_'),layer.id].map(label=>({id:layer.id,label})))
   .map(layer=>({id:layer.id,index:value.toLowerCase().lastIndexOf(`#${layer.label.toLowerCase()}`),length:layer.label.length}))
   .filter(layer=>layer.index>=0&&!/[\p{L}\p{N}_-]/u.test(value[layer.index+layer.length+1]||''))
   .sort((a,b)=>b.index-a.index||b.length-a.length||Number(b.id===targetLayerId)-Number(a.id===targetLayerId))[0]?.id;
 }
 function updateText(value: string, position: number) {
  setText(value); setCaret(position);
  const mentionedLayer=resolveLayerMention(value);
  if(mentionedLayer)setTargetLayerId(mentionedLayer);
  const beforeCaret = value.slice(0, position);
  const agentToken = beforeCaret.match(mentionPattern);
  const layerToken = beforeCaret.match(layerMentionPattern);
  setMentionQuery(agentToken ? agentToken[2] : null);
  setLayerQuery(layerToken ? layerToken[2].trim() : null);
 }
 function insertMention(role: AgentRole) {
  const before = text.slice(0, caret).replace(mentionPattern, '$1');
  const after = text.slice(caret);
  const inserted = `${before}@${agentIdentity[role].persona} ${after}`;
  const nextCaret = before.length + agentIdentity[role].persona.length + 2;
  setText(inserted); setCaret(nextCaret); setMentionQuery(null); setLayerQuery(null);
  requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(nextCaret, nextCaret); });
 }
 function insertLayer(id:string,name: string) {
  const before = text.slice(0, caret).replace(layerMentionPattern, '$1');
  const after = text.slice(caret);
  const inserted = `${before}#${name} ${after}`;
  const nextCaret = before.length + name.length + 2;
  setText(inserted); setCaret(nextCaret); setTargetLayerId(id); setMentionQuery(null); setLayerQuery(null);
  requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(nextCaret, nextCaret); });
 }
 async function submit() {
  const draftMessage = text;
  if (!draftMessage.trim() || saving || sending.current) return;
  const contextPrefix = reviewFeedback ? `Revise the completed work for: ${reviewFeedback.instruction.slice(0,500)}\nRequested changes: ` : composerContext ? `#${composerContext.name} ` : '';
  const message = `${contextPrefix}${draftMessage}`.slice(0, 2000);
  const layerMentions=layerOptions.flatMap(layer=>[layer.name,layer.name.replace(/\s+/g,'_'),layer.id].map(label=>({id:layer.id,label}))).sort((a,b)=>b.label.length-a.label.length);
  const explicitLayer=layerMentions.flatMap(layer=>{const index=message.lastIndexOf(`#${layer.label}`),end=message[index+layer.label.length+1]||'';return index>=0&&!/[\p{L}\p{N}_-]/u.test(end)?[{id:layer.id,index}]:[];}).sort((a,b)=>b.index-a.index)[0]?.id;
  const mention = agentRoles.find(role => new RegExp(`@${agentIdentity[role].persona}\\b`, 'i').test(message)) || null;
  sending.current = true; setSaving(true); setError('');
  try {
   const screenScope = screenTarget?.sectionId && scopeMode !== 'global' ? { mode: scopeMode, sectionId: screenTarget.sectionId, ...(scopeMode === 'section' && screenTarget.path ? { path: screenTarget.path } : {}) } : undefined;
   const payload = JSON.stringify({ projectId, versionId: reviewFeedback?.versionId || versionId, anchor: 'page', mentionedRole: mention, targetLayerId:screenTarget?undefined:targetLayerId||explicitLayer, screenId: screenTarget?.screenId, screenScope, text: message, displayMessage: draftMessage });
   if (pendingMessage.current?.payload !== payload) pendingMessage.current = {payload,requestId:crypto.randomUUID()};
   const response = await fetch('/api/studio/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({...JSON.parse(payload),requestId:pendingMessage.current.requestId}) });
   const data = await conversationData(response);
   if (!response.ok) throw new Error(data.error || 'Could not send this message.');
   pendingMessage.current = null;
   setNotes(items => [...items.filter(item => item.id !== data.note.id), data.note]); setText(''); setReviewFeedback(null); setMentionQuery(null); setLayerQuery(null);
   window.dispatchEvent(new Event('guildos:tasks-updated'));
  } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not send this message.'); }
  finally { sending.current = false; setSaving(false); }
 }
 async function controlTasks(ids: string[], action: 'cancel' | 'retry') {
  if (!ids.length || stopping) return;
  setStopping(true); setError('');
  try {
   const results = await Promise.all(ids.map(taskId => fetch('/api/studio/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId, action }) })));
   // 409: the task already finished or changed; the refresh shows its real state.
   const failed = results.find(response => !response.ok && response.status !== 409);
   if (failed) throw new Error(((await failed.json().catch(() => ({}))) as { error?: string }).error || (action === 'cancel' ? 'Could not stop the guild.' : 'Could not resume the task.'));
   if (action === 'cancel') setActiveTaskIds([]);
   if (action === 'retry') setStoppedTask(null);
  } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update the task.'); }
  finally { setStopping(false); window.dispatchEvent(new Event('guildos:tasks-updated')); }
 }
 const canStop = activeTaskIds.length > 0 && !text.trim() && !saving;
 const suggestions = mentionQuery === null ? [] : agentRoles.filter(role => `${agentIdentity[role].persona} ${agentIdentity[role].name}`.toLowerCase().includes(mentionQuery.toLowerCase()));
 const layerSuggestions = layerQuery === null ? [] : layerOptions.filter(item => item.name.toLowerCase().includes(layerQuery.toLowerCase())).slice(0, 8);
 const highlightTerms = useMemo(() => [...agentRoles.map(role => `@${agentIdentity[role].persona}`), ...layerOptions.map(item => `#${item.name}`)].sort((a, b) => b.length - a.length), [layerOptions]);
 const highlightedMessage = useMemo(() => {
  if (!text || !highlightTerms.length) return text;
  const matcher = new RegExp(`(${highlightTerms.map(escapeRegExp).join('|')})`, 'gi');
  const termSet = new Set(highlightTerms.map(term => term.toLowerCase()));
  return text.split(matcher).map((part, index) => termSet.has(part.toLowerCase())
   ? <span key={index} style={{ borderRadius: 3, backgroundColor: part.startsWith('#') ? '#e9f1eb' : '#e8effa', color: part.startsWith('#') ? '#315d43' : '#315e90' }}>{part}</span>
   : part);
 }, [text, highlightTerms]);

 return <Box className="guild-channel" sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
  <Stack direction="row" spacing={1} sx={{ px: 1.5, py: 1.25, alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider', minWidth: 0 }}>
   <Box aria-label="Project guild specialists" sx={{ display: 'flex', alignItems: 'center', flex: 'none', pl: .5 }}>{agentRoles.map((role, index) => <Box key={role} sx={{ ml: index ? '-11px' : 0, zIndex: agentRoles.length - index, lineHeight: 0, flex: 'none' }}><AgentMark role={role} size={23}/></Box>)}</Box>
   <Box sx={{ minWidth: 0, flex: 1, overflow: 'hidden' }}><Typography variant="subtitle2" noWrap sx={{ fontWeight: 700, lineHeight: 1.3 }}>Project conversation</Typography><Typography variant="caption" noWrap color="text.secondary" sx={{ display: 'block' }}>Project-wide guild chat</Typography></Box>
  </Stack>
  <Box ref={feedRef} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 2, py: 2 }}>
   {!conversationLoaded&&!notes.length?<ConversationSkeleton/>:notes.length ? <Stack spacing={2} aria-label="Shared project conversation">{notes.map(note => <Stack key={note.id} direction="row" spacing={1.25} sx={{ alignItems: 'flex-start' }}>
    {note.author_role === 'human' ? <Avatar src={avatarUrl} slotProps={{img:{referrerPolicy:"no-referrer"}}} sx={{ width: 32, height: 32, fontSize: 12, fontWeight: 700, bgcolor: '#e9eef2', color: '#526374' }}>Y</Avatar> : <AgentMark role={note.author_role} size={32}/>}
    <Box sx={{ minWidth: 0, flex: 1 }}>
     <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}><Typography variant="body2" sx={{ fontWeight: 700 }}>{names[note.author_role]}</Typography>{note.author_role !== 'human' && <Typography variant="caption" color="text.secondary">{agentIdentity[note.author_role].name}</Typography>}<Typography variant="caption" color="text.secondary">{new Date(note.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Typography></Stack>
     <Paper variant="outlined" sx={{ mt: .5, px: 1.5, py: 1.15, borderRadius: '4px 14px 14px 14px', bgcolor: note.author_role === 'human' ? '#f4f7f5' : 'background.paper' }}><Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.55 }}>{conversationSegments(messageBody(note), layerOptions.map(layer => layer.name)).map((part, index) => part.kind === 'text' ? part.text : <Box component="span" key={index} data-mention={part.kind} sx={{ color: part.role ? agentIdentity[part.role].color : '#315d43', bgcolor: part.role ? agentIdentity[part.role].tint : '#e9f1eb', borderRadius: '3px', px: .25, fontWeight: 600 }}>{part.text}</Box>)}</Typography></Paper>
     {note.author_role === 'human' && taskWaits.some(item => item.noteId === note.id) && <TaskWaitNotice wait={taskWaits.find(item => item.noteId === note.id)!.wait}/>}
     {note.author_role !== 'human' && note.anchor !== 'page' && <Chip size="small" label={note.anchor} sx={{ mt: .6, height: 21, fontSize: 10 }}/>}
    </Box>
   </Stack>)}</Stack> : <Box sx={{ minHeight: 120, display: 'grid', placeItems: 'center', px: 3 }}><Stack spacing={1} sx={{ textAlign: 'center', maxWidth: 300 }}><Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Start the project conversation</Typography><Typography variant="body2" color="text.secondary">Share direction with the guild, or mention a specialist with @ to bring them in.</Typography></Stack></Box>}
   <AgentProgress projectId={projectId} onRequestChanges={requestChanges} onTaskWaits={setTaskWaits} onWorkingAgents={setWorkingAgents} onActiveTasks={setActiveTaskIds} onStoppedTask={setStoppedTask} revisionNotes={notes} conversationLoaded={conversationLoaded}/>
  </Box>
  {error && <Alert severity="error" sx={{ mx: 2, mb: 1 }}>{error}</Alert>}
  {trial && <Alert severity={trial.remaining ? 'info' : 'warning'} sx={{ mx: 2, mb: 1 }} action={<Button component={Link} href="/studio/settings" size="small" color="inherit">Connect</Button>}>
   {trial.enabled && trial.remaining
    ? `Free trial: ${trial.remaining} of ${trial.limit} design runs left. No API key needed.`
    : trial.enabled ? 'Your free runs are used up. Connect a model to keep going. Groq and OpenRouter have free tiers.'
    : 'Connect a model to let the guild work.'}
  </Alert>}
  <Box sx={{ borderTop: '1px solid', borderColor: 'divider', p: 1.5, bgcolor: '#fbfcfb' }}>
   <AgentWorkingIndicator roles={workingAgents}/>
   {!activeTaskIds.length && stoppedTask && <Stack direction="row" role="status" spacing={1} sx={{ alignItems: 'center', mb: 1, minHeight: 28, minWidth: 0 }}><Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0 }}>You stopped the guild. Send an update, or resume where it left off.</Typography><Button size="small" disabled={stopping} onClick={() => void controlTasks([stoppedTask.id], 'retry')} sx={{ flex: 'none', minWidth: 0, py: .25 }}>Resume</Button></Stack>}
   <Box sx={{ position: 'relative', p: 1.25, border: '1px solid #dfe6e1', borderRadius: '8px', bgcolor: 'background.paper', transition: 'border-color 120ms ease, box-shadow 120ms ease', '&:focus-within': { borderColor: '#789783', boxShadow: '0 0 0 3px rgba(56,102,80,.08)' } }}>
    <Box sx={{ minWidth: 0, position: 'relative', px: 1, py: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
     {(suggestions.length > 0 || layerSuggestions.length > 0) && <Paper role="listbox" aria-label={mentionQuery !== null ? 'Mention an agent' : 'Mention a layer'} sx={{ ...dropdownSurfaceSx, position: 'absolute', zIndex: 4, bottom: 'calc(100% + 12px)', left: 0, right: 0, boxSizing: 'border-box', maxHeight: 260, overflowX: 'hidden', overflowY: 'auto', p: .5 }}>{suggestions.map((role, index) => <Button key={role} ref={index === activeSuggestionIndex ? activeOptionRef : undefined} role="option" aria-selected={index === activeSuggestionIndex} onClick={() => insertMention(role)} fullWidth sx={{ minWidth: 0, justifyContent: 'flex-start', textTransform: 'none', color: 'text.primary', px: 1, py: .75, textAlign: 'left', bgcolor: index === activeSuggestionIndex ? '#f0f4f1' : 'transparent', '&:hover': { bgcolor: '#f0f4f1' } }}><Box sx={{ flex: 'none', lineHeight: 0 }}><AgentMark role={role} size={30}/></Box><Box sx={{ ml: 1, minWidth: 0, textAlign: 'left' }}><Typography variant="body2" noWrap sx={{ fontWeight: 700, lineHeight: 1.2 }}>{agentIdentity[role].persona}</Typography><Typography variant="caption" noWrap color="text.secondary">{agentIdentity[role].name}</Typography></Box></Button>)}{layerSuggestions.map((item, index) => <Button key={item.id} ref={index === activeSuggestionIndex ? activeOptionRef : undefined} role="option" aria-selected={index === activeSuggestionIndex} onClick={() => insertLayer(item.id,item.name)} fullWidth sx={{ minWidth: 0, justifyContent: 'flex-start', textTransform: 'none', color: 'text.primary', px: 1, py: .75, textAlign: 'left', bgcolor: index === activeSuggestionIndex ? '#f0f4f1' : 'transparent', '&:hover': { bgcolor: '#f0f4f1' } }}><Box sx={{ width: 30, height: 30, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 1, bgcolor: '#eef3ef', color: 'primary.main' }}><Hash size={16}/></Box><Box sx={{ ml: 1, minWidth: 0, textAlign: 'left' }}><Typography variant="body2" noWrap sx={{ fontWeight: 650, lineHeight: 1.2 }}>{item.name}</Typography><Typography variant="caption" noWrap color="text.secondary">Layer</Typography></Box></Button>)}</Paper>}
     {reviewFeedback && <Stack spacing={.5} sx={{minWidth:0}}><Chip size="small" label="Request changes" onDelete={()=>setReviewFeedback(null)} sx={{alignSelf:'flex-start'}}/><Typography variant="caption" color="text.secondary" sx={{overflowWrap:'anywhere'}}>What would you like changed?</Typography></Stack>}
     {screenTarget && <Stack spacing={.75} sx={{ minWidth: 0 }}>
      <Box sx={{ position: 'relative', alignSelf: 'flex-start', maxWidth: '100%' }} onMouseEnter={() => setPreviewOpen(true)} onMouseLeave={() => setPreviewOpen(false)}>
       <Box data-testid="selection-context" sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: .5, pr: 1.5, py: .5, border: '1.5px solid #1f2a33', borderRadius: '8px', bgcolor: '#eef2f8', maxWidth: '100%' }}>
        {screenTarget.preview && <SelectionThumbnail preview={screenTarget.preview} width={34} maxHeight={30} title="Selection thumbnail"/>}
        <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600, color: '#1f2a33' }}>{screenTarget.label}</Typography>
       </Box>
       {onClearScreenTarget && <IconButton size="small" aria-label="Remove selected context" onClick={onClearScreenTarget} sx={{ position: 'absolute', top: -9, right: -9, width: 20, height: 20, bgcolor: '#1f2a33', color: '#fff', '&:hover': { bgcolor: '#33414c' } }}><X size={12}/></IconButton>}
       {previewOpen && screenTarget.preview && <Paper elevation={6} role="tooltip" aria-label="Selection preview" sx={{ position: 'absolute', zIndex: 6, bottom: 'calc(100% + 10px)', left: 0, width: 300, borderRadius: 2.5, overflow: 'hidden' }}>
        <Typography noWrap sx={{ px: 1.75, py: 1.25, fontWeight: 650, fontSize: 14, borderBottom: '1px solid', borderColor: 'divider' }}>{screenTarget.label}</Typography>
        <Box sx={{ p: 1.5, display: 'grid', placeItems: 'center', bgcolor: '#f6f7f6' }}><SelectionThumbnail preview={screenTarget.preview} width={272} maxHeight={200} title="Selection preview"/></Box>
       </Paper>}
      </Box>
      {screenTarget.sectionId && <ToggleButtonGroup exclusive size="small" value={scopeMode} onChange={(_, value) => value && setScopeMode(value)} aria-label="Edit scope" sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontSize: 12, py: .35, px: 1 } }}>
       <ToggleButton value="section">Section edit</ToggleButton><ToggleButton value="add">Add section</ToggleButton><ToggleButton value="global">Global edit</ToggleButton>
      </ToggleButtonGroup>}
      <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{!screenTarget.sectionId || scopeMode === 'global' ? 'Re-plans this whole screen.' : scopeMode === 'section' ? `Changes only ${screenTarget.label}.` : `Adds a new section after ${screenTarget.sectionId}.`}</Typography>
     </Stack>}
     {composerContext && <Chip size="small" icon={<Hash size={14}/>} label={composerContext.name} onDelete={() => setComposerContext(null)} deleteIcon={<X size={14}/>} sx={{ alignSelf: 'flex-start', height: 26, borderRadius: '6px', bgcolor: '#3b496b', color: '#9bc8f2', '& .MuiChip-icon': { color: 'inherit', ml: .75 }, '& .MuiChip-deleteIcon': { color: 'inherit', mr: .5, '&:hover': { color: '#fff' } } }}/>}
     <Box sx={{ minWidth: 0, position: 'relative' }}>
      <Box ref={textOverlayRef} aria-hidden="true" sx={{ position: 'absolute', zIndex: 1, inset: 0, overflow: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'break-word', pointerEvents: 'none', color: 'text.primary' }}>{highlightedMessage}</Box>
      <TextField inputRef={inputRef} fullWidth multiline minRows={3} maxRows={6} value={text} onChange={event => updateText(event.target.value, event.target.selectionStart || 0)} onScroll={event => { if (textOverlayRef.current) textOverlayRef.current.scrollTop = event.currentTarget.scrollTop; }} onClick={() => setCaret(inputRef.current?.selectionStart || 0)} onKeyUp={() => setCaret(inputRef.current?.selectionStart || 0)} onKeyDown={event => { const count = mentionQuery !== null ? suggestions.length : layerQuery !== null ? layerSuggestions.length : 0; if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && count > 0) { event.preventDefault(); setActiveSuggestionIndex(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + count) % count); return; } if (event.key === 'Enter' && !event.shiftKey) { if (mentionQuery !== null) { if (suggestions[activeSuggestionIndex]) { event.preventDefault(); insertMention(suggestions[activeSuggestionIndex]); } } else if (layerQuery !== null) { if (layerSuggestions[activeSuggestionIndex]) { event.preventDefault(); insertLayer(layerSuggestions[activeSuggestionIndex].id,layerSuggestions[activeSuggestionIndex].name); } } else { event.preventDefault(); void submit(); } } if (event.key === 'Escape') { setMentionQuery(null); setLayerQuery(null); } }} placeholder="Ask for changes… Use @ for agents and # for layers" size="small" slotProps={{ htmlInput: { maxLength: 2000, 'aria-label': 'Message the project guild', style: { padding: 0 } } }} sx={{ position: 'relative', zIndex: 2, '& .MuiOutlinedInput-root': { alignItems: 'flex-start', borderRadius: 0, bgcolor: 'transparent', p: 0, '& fieldset': { border: 0 }, '&:hover fieldset': { border: 0 }, '&.Mui-focused fieldset': { border: 0 } }, '& textarea:not(:placeholder-shown)': { color: 'transparent !important', WebkitTextFillColor: 'transparent !important', caretColor: '#202b38' }, '& textarea::placeholder': { color: '#9ba4ac', opacity: 1 }, '& .MuiInputBase-inputMultiline': { p: 0, lineHeight: 1.5 } }}/>
     </Box>
    </Box>
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'flex-end', mt: .5, minWidth: 0 }}>
     {canStop ? <IconButton aria-label="Stop the guild" title="Stop the current task" disabled={stopping} onClick={() => void controlTasks(activeTaskIds, 'cancel')} sx={{ width: 32, height: 32, flex: 'none', borderRadius: '8px', bgcolor: '#202b38', color: '#fff', '&:hover': { bgcolor: '#000' }, '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled' } }}><Square size={12} fill="currentColor"/></IconButton>
     : <IconButton aria-label="Send message" color="primary" disabled={!text.trim() || saving} onClick={() => void submit()} sx={{ width: 32, height: 32, flex: 'none', borderRadius: '8px', bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' }, '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled' } }}>{saving ? <Skeleton variant="rounded" width={15} height={15} sx={{bgcolor:'currentColor',opacity:.5}}/> : <ArrowUp size={17}/>}</IconButton>}
    </Stack>
   </Box>
  </Box>
 </Box>;
}
