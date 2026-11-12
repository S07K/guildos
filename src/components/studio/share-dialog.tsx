'use client';
import { useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Copy, Link2 } from 'lucide-react';

type ShareLink = { id: string; screenId: string | null; createdAt: string; url: string };

/**
 * More › Share: a view-only link to the selected screen or the whole board. Anyone with
 * the link can view it without signing in, until it is revoked.
 */
export function ShareDialog({ projectId, screen, screenNames, onClose }: { projectId: string; screen: { id: string; name: string }; screenNames: Record<string, string>; onClose: () => void }) {
 const [scope, setScope] = useState<'screen' | 'board'>('screen');
 const [links, setLinks] = useState<ShareLink[] | null>(null);
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [copied, setCopied] = useState('');
 const request = async (method: 'GET' | 'POST' | 'DELETE', body?: object) => {
  const response = await fetch(method === 'GET' ? `/api/studio/share?projectId=${projectId}` : '/api/studio/share', { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify({ projectId, ...body }) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
 };
 useEffect(() => { request('GET').then(data => setLinks(data.links)).catch(failure => setError(failure.message)); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
 const current = links?.find(link => scope === 'screen' ? link.screenId === screen.id : link.screenId === null);
 const run = (task: () => Promise<void>) => { setBusy(true); setError(''); task().catch(failure => setError(failure instanceof Error ? failure.message : 'Something went wrong.')).finally(() => setBusy(false)); };
 const create = () => run(async () => { const { link } = await request('POST', { screenId: scope === 'screen' ? screen.id : null }); setLinks(items => [link, ...(items || []).filter(item => item.id !== link.id)]); });
 const revoke = (link: ShareLink) => run(async () => { await request('DELETE', { linkId: link.id }); setLinks(items => (items || []).filter(item => item.id !== link.id)); });
 const copy = async (link: ShareLink) => { try { await navigator.clipboard.writeText(link.url); setCopied(link.id); } catch { setError('Copy the link from the field instead.'); } };
 const label = (link: ShareLink) => link.screenId ? screenNames[link.screenId] || 'A screen' : 'Whole board';
 return <Dialog open onClose={onClose} maxWidth="sm" fullWidth slotProps={{ paper: { 'aria-label': 'Share' } }}>
  <DialogTitle>Share</DialogTitle>
  <DialogContent>
   <Stack spacing={2}>
    <ToggleButtonGroup exclusive size="small" value={scope} onChange={(_, value) => value && setScope(value)} aria-label="What to share" sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 1.5 } }}>
     <ToggleButton value="screen">{screen.name}</ToggleButton><ToggleButton value="board">Whole board</ToggleButton>
    </ToggleButtonGroup>
    <Typography variant="body2" color="text.secondary">Anyone with the link can view {scope === 'screen' ? 'this screen' : 'every screen on the board'}, without signing in. They cannot edit, and it always shows the latest saved version.</Typography>
    {current
     ? <Stack direction="row" spacing={1}><TextField size="small" fullWidth value={current.url} slotProps={{ htmlInput: { readOnly: true, 'aria-label': 'Share link' } }} onFocus={event => event.target.select()}/><Button variant="contained" startIcon={<Copy size={16}/>} onClick={() => void copy(current)}>{copied === current.id ? 'Copied' : 'Copy'}</Button></Stack>
     : <Button variant="contained" startIcon={<Link2 size={16}/>} disabled={busy || !links} onClick={create} sx={{ alignSelf: 'flex-start' }}>Create link</Button>}
    {error && <Alert severity="error">{error}</Alert>}
    {!!links?.length && <Box>
     <Typography variant="subtitle2" sx={{ mb: .5 }}>Active links</Typography>
     <Stack component="ul" aria-label="Active links" sx={{ listStyle: 'none', p: 0, m: 0 }}>
      {links.map(link => <Stack component="li" key={link.id} direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', py: .5 }}>
       <Typography variant="body2" noWrap>{label(link)} <Typography component="span" variant="caption" color="text.secondary">· {new Date(link.createdAt).toLocaleDateString()}</Typography></Typography>
       <Button size="small" color="error" disabled={busy} onClick={() => revoke(link)} aria-label={`Revoke link to ${label(link)}`}>Revoke</Button>
      </Stack>)}
     </Stack>
    </Box>}
   </Stack>
  </DialogContent>
  <DialogActions><Button onClick={onClose}>Done</Button></DialogActions>
 </Dialog>;
}
