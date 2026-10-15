'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Avatar, Box, Button, Chip, CircularProgress, IconButton, Paper, Stack, TextField, Typography } from '@mui/material';
import { dropdownSurfaceSx } from './dropdown-surface';
import { ArrowUp, Hash, X } from 'lucide-react';
import { agentRoles, agentIdentity, type AgentRole, type AgentAnchor } from '@/lib/studio/agent-roles';
import { AgentMark } from './agent-identity';

export type GuildNote = { id: string; version_id: string | null; author_role: AgentRole | 'human'; mentioned_role: AgentRole | null; anchor: AgentAnchor; body: string; created_at: string };
const names: Record<AgentRole | 'human', string> = { human: 'You', ...Object.fromEntries(agentRoles.map(role => [role, agentIdentity[role].persona])) } as Record<AgentRole | 'human', string>;
const mentionPattern = /(^|\s)@([\p{L}\p{N}_-]*)$/u;
const layerMentionPattern = /(^|\s)#([\p{L}\p{N}_ -]*)$/u;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function GuildPanel({ projectId, versionId, currentAnchor, layers: layerOptions = [], addedNotes = [], initialMention = null, onInitialMentionUsed, selectedContext = null }: { projectId: string; versionId: string | null; currentAnchor: AgentAnchor; layers?: { id: string; name: string }[]; addedNotes?: GuildNote[]; initialMention?: AgentRole | null; onInitialMentionUsed?: () => void; selectedContext?: { id: string; name: string } | null }) {
 const [notes, setNotes] = useState<GuildNote[]>(addedNotes);
 const [text, setText] = useState('');
 const [composerContext, setComposerContext] = useState(selectedContext);
 const [error, setError] = useState('');
 const [saving, setSaving] = useState(false);
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
   const data = await response.json();
   if (!response.ok) throw new Error(data.error || 'Could not load the project conversation.');
   if (!cancelled) {
    setNotes((current: GuildNote[]) => [...current.filter(note => !data.notes.some((fresh: GuildNote) => fresh.id === note.id)), ...data.notes].sort((a: GuildNote,b: GuildNote) => a.created_at.localeCompare(b.created_at)));
    if (!hasLoaded) { hasLoaded = true; setError(''); }
   }
  }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load the project conversation.'); });
  void load();
  const interval = window.setInterval(() => void load(), 5000);
  return () => { cancelled = true; window.clearInterval(interval); };
 }, [projectId]);
 useEffect(() => { if (addedNotes.length) setNotes(items => [...items.filter(item => !addedNotes.some(added => added.id === item.id)), ...addedNotes].sort((a,b) => a.created_at.localeCompare(b.created_at))); }, [addedNotes]);
 useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [notes.length]);
 useEffect(() => { setActiveSuggestionIndex(0); }, [mentionQuery, layerQuery]);
 useEffect(() => { activeOptionRef.current?.scrollIntoView({ block: 'nearest' }); }, [activeSuggestionIndex]);
 useLayoutEffect(() => { setComposerContext(selectedContext); }, [selectedContext?.id, selectedContext?.name]);
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

 const visible = useMemo(() => notes, [notes]);
 function updateText(value: string, position: number) {
  setText(value); setCaret(position);
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
 function insertLayer(name: string) {
  const before = text.slice(0, caret).replace(layerMentionPattern, '$1');
  const after = text.slice(caret);
  const inserted = `${before}#${name} ${after}`;
  const nextCaret = before.length + name.length + 2;
  setText(inserted); setCaret(nextCaret); setMentionQuery(null); setLayerQuery(null);
  requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(nextCaret, nextCaret); });
 }
 async function submit() {
  const draftMessage = text.trim();
  if (!draftMessage || saving) return;
  const contextPrefix = composerContext ? `#${composerContext.name} ` : '';
  const message = `${contextPrefix}${draftMessage}`.slice(0, 2000);
  const mention = agentRoles.find(role => new RegExp(`@${agentIdentity[role].persona}\\b`, 'i').test(message)) || null;
  setSaving(true); setError('');
  try {
   const response = await fetch('/api/studio/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, versionId, anchor: currentAnchor, mentionedRole: mention, text: message }) });
   const data = await response.json();
   if (!response.ok) throw new Error(data.error || 'Could not send this message.');
   setNotes(items => [...items, data.note]); setText(''); setMentionQuery(null); setLayerQuery(null);
   if (mention) {
    const replyResponse = await fetch(`/api/studio/agents/${mention}/messages?projectId=${encodeURIComponent(projectId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: message, sharedThread: true }) });
    const replyData = await replyResponse.json();
    if (!replyResponse.ok || replyData.warning) throw new Error(replyData.error || replyData.warning || `${names[mention]} could not reply. Your message is in the channel.`);
    if (replyData.sharedNote) setNotes(items => [...items, replyData.sharedNote]);
   }
  } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not send this message.'); }
  finally { setSaving(false); }
 }
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
   {visible.length ? <Stack spacing={2} aria-label="Shared project conversation">{visible.map(note => <Stack key={note.id} direction="row" spacing={1.25} sx={{ alignItems: 'flex-start' }}>
    {note.author_role === 'human' ? <Avatar sx={{ width: 32, height: 32, fontSize: 12, fontWeight: 700, bgcolor: '#e9eef2', color: '#526374' }}>Y</Avatar> : <AgentMark role={note.author_role} size={32}/>}
    <Box sx={{ minWidth: 0, flex: 1 }}>
     <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}><Typography variant="body2" sx={{ fontWeight: 700 }}>{names[note.author_role]}</Typography>{note.author_role !== 'human' && <Typography variant="caption" color="text.secondary">{agentIdentity[note.author_role].name}</Typography>}<Typography variant="caption" color="text.secondary">{new Date(note.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Typography></Stack>
     <Paper variant="outlined" sx={{ mt: .5, px: 1.5, py: 1.15, borderRadius: '4px 14px 14px 14px', bgcolor: note.author_role === 'human' ? '#f4f7f5' : 'background.paper' }}><Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.55 }}>{note.body}</Typography></Paper>
     <Stack direction="row" spacing={.75} sx={{ mt: .6, flexWrap: 'wrap' }}>{note.anchor !== 'page' && <Chip size="small" label={note.anchor} sx={{ height: 21, fontSize: 10 }}/ >}{note.mentioned_role && <Chip size="small" label={`@${names[note.mentioned_role]}`} sx={{ height: 21, fontSize: 10, bgcolor: agentIdentity[note.mentioned_role].tint, color: agentIdentity[note.mentioned_role].color }}/>}</Stack>
    </Box>
   </Stack>)}</Stack> : <Box sx={{ minHeight: '100%', display: 'grid', placeItems: 'center', px: 3 }}><Stack spacing={1} sx={{ textAlign: 'center', maxWidth: 300 }}><Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Start the project conversation</Typography><Typography variant="body2" color="text.secondary">Share direction with the guild, or mention a specialist with @ to bring them in.</Typography></Stack></Box>}
  </Box>
  {error && <Alert severity="error" sx={{ mx: 2, mb: 1 }}>{error}</Alert>}
  <Box sx={{ borderTop: '1px solid', borderColor: 'divider', p: 1.5, bgcolor: '#fbfcfb' }}>
   <Box sx={{ position: 'relative', p: 1.25, border: '1px solid #dfe6e1', borderRadius: '8px', bgcolor: 'background.paper', transition: 'border-color 120ms ease, box-shadow 120ms ease', '&:focus-within': { borderColor: '#789783', boxShadow: '0 0 0 3px rgba(56,102,80,.08)' } }}>
    <Box sx={{ minWidth: 0, position: 'relative', px: 1, py: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
     {(suggestions.length > 0 || layerSuggestions.length > 0) && <Paper role="listbox" aria-label={mentionQuery !== null ? 'Mention an agent' : 'Mention a layer'} sx={{ ...dropdownSurfaceSx, position: 'absolute', zIndex: 4, bottom: 'calc(100% + 12px)', left: 0, right: 0, boxSizing: 'border-box', maxHeight: 260, overflowX: 'hidden', overflowY: 'auto', p: .5 }}>{suggestions.map((role, index) => <Button key={role} ref={index === activeSuggestionIndex ? activeOptionRef : undefined} role="option" aria-selected={index === activeSuggestionIndex} onClick={() => insertMention(role)} fullWidth sx={{ minWidth: 0, justifyContent: 'flex-start', textTransform: 'none', color: 'text.primary', px: 1, py: .75, textAlign: 'left', bgcolor: index === activeSuggestionIndex ? '#f0f4f1' : 'transparent', '&:hover': { bgcolor: '#f0f4f1' } }}><Box sx={{ flex: 'none', lineHeight: 0 }}><AgentMark role={role} size={30}/></Box><Box sx={{ ml: 1, minWidth: 0, textAlign: 'left' }}><Typography variant="body2" noWrap sx={{ fontWeight: 700, lineHeight: 1.2 }}>{agentIdentity[role].persona}</Typography><Typography variant="caption" noWrap color="text.secondary">{agentIdentity[role].name}</Typography></Box></Button>)}{layerSuggestions.map((item, index) => <Button key={item.id} ref={index === activeSuggestionIndex ? activeOptionRef : undefined} role="option" aria-selected={index === activeSuggestionIndex} onClick={() => insertLayer(item.name)} fullWidth sx={{ minWidth: 0, justifyContent: 'flex-start', textTransform: 'none', color: 'text.primary', px: 1, py: .75, textAlign: 'left', bgcolor: index === activeSuggestionIndex ? '#f0f4f1' : 'transparent', '&:hover': { bgcolor: '#f0f4f1' } }}><Box sx={{ width: 30, height: 30, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 1, bgcolor: '#eef3ef', color: 'primary.main' }}><Hash size={16}/></Box><Box sx={{ ml: 1, minWidth: 0, textAlign: 'left' }}><Typography variant="body2" noWrap sx={{ fontWeight: 650, lineHeight: 1.2 }}>{item.name}</Typography><Typography variant="caption" noWrap color="text.secondary">Layer</Typography></Box></Button>)}</Paper>}
     {composerContext && <Chip size="small" icon={<Hash size={14}/>} label={composerContext.name} onDelete={() => setComposerContext(null)} deleteIcon={<X size={14}/>} sx={{ alignSelf: 'flex-start', height: 26, borderRadius: '6px', bgcolor: '#3b496b', color: '#9bc8f2', '& .MuiChip-icon': { color: 'inherit', ml: .75 }, '& .MuiChip-deleteIcon': { color: 'inherit', mr: .5, '&:hover': { color: '#fff' } } }}/>}
     <Box sx={{ minWidth: 0, position: 'relative' }}>
      <Box ref={textOverlayRef} aria-hidden="true" sx={{ position: 'absolute', zIndex: 1, inset: 0, overflow: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'break-word', pointerEvents: 'none', color: 'text.primary' }}>{highlightedMessage}</Box>
      <TextField inputRef={inputRef} fullWidth multiline minRows={3} maxRows={6} value={text} onChange={event => updateText(event.target.value, event.target.selectionStart || 0)} onScroll={event => { if (textOverlayRef.current) textOverlayRef.current.scrollTop = event.currentTarget.scrollTop; }} onClick={() => setCaret(inputRef.current?.selectionStart || 0)} onKeyUp={() => setCaret(inputRef.current?.selectionStart || 0)} onKeyDown={event => { const count = mentionQuery !== null ? suggestions.length : layerQuery !== null ? layerSuggestions.length : 0; if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && count > 0) { event.preventDefault(); setActiveSuggestionIndex(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + count) % count); return; } if (event.key === 'Enter' && !event.shiftKey) { if (mentionQuery !== null) { if (suggestions[activeSuggestionIndex]) { event.preventDefault(); insertMention(suggestions[activeSuggestionIndex]); } } else if (layerQuery !== null) { if (layerSuggestions[activeSuggestionIndex]) { event.preventDefault(); insertLayer(layerSuggestions[activeSuggestionIndex].name); } } else { event.preventDefault(); void submit(); } } if (event.key === 'Escape') { setMentionQuery(null); setLayerQuery(null); } }} placeholder="Ask for changes… Use @ for agents and # for layers" size="small" slotProps={{ htmlInput: { maxLength: 2000, 'aria-label': 'Message the project guild', style: { padding: 0 } } }} sx={{ position: 'relative', zIndex: 2, '& .MuiOutlinedInput-root': { alignItems: 'flex-start', borderRadius: 0, bgcolor: 'transparent', p: 0, '& fieldset': { border: 0 }, '&:hover fieldset': { border: 0 }, '&.Mui-focused fieldset': { border: 0 } }, '& textarea:not(:placeholder-shown)': { color: 'transparent !important', WebkitTextFillColor: 'transparent !important', caretColor: '#202b38' }, '& textarea::placeholder': { color: '#9ba4ac', opacity: 1 }, '& .MuiInputBase-inputMultiline': { p: 0, lineHeight: 1.5 } }}/>
     </Box>
    </Box>
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'flex-end', mt: .5, minWidth: 0 }}>
     <IconButton aria-label="Send message" color="primary" disabled={!text.trim() || saving} onClick={() => void submit()} sx={{ width: 32, height: 32, flex: 'none', borderRadius: '8px', bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' }, '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled' } }}>{saving ? <CircularProgress size={15} color="inherit"/> : <ArrowUp size={17}/>}</IconButton>
    </Stack>
   </Box>
  </Box>
 </Box>;
}
