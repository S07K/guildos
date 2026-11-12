'use client';
import { useEffect, useState } from 'react';
import { Box, Button, IconButton, Stack, Typography } from '@mui/material';
import { X } from 'lucide-react';
import type { ScreenVersion } from '@/lib/studio/screens';

/**
 * A screen's version history, newest first. Restoring saves the old document as a
 * new version, so history is never rewritten.
 */
export function ScreenVersions({ projectId, screenId, screenName, headVersionId, busy, onRestore, onClose }: {
 projectId: string; screenId: string; screenName: string; headVersionId: string | null; busy: boolean;
 onRestore: (version: ScreenVersion) => void; onClose: () => void;
}) {
 const [versions, setVersions] = useState<ScreenVersion[] | null>(null);
 const [error, setError] = useState('');
 useEffect(() => {
  const controller = new AbortController();
  setVersions(null);
  fetch(`/api/studio/screens/versions?projectId=${projectId}&screenId=${screenId}`, { cache: 'no-store', signal: controller.signal })
   .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setVersions(data.versions); })
   .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Versions could not be loaded.'); });
  return () => controller.abort();
 }, [projectId, screenId, headVersionId]);
 return <>
  <Stack direction="row" sx={{ px: 2, py: 1.5, alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider' }}>
   <Box sx={{ minWidth: 0 }}><Typography variant="subtitle2">Versions</Typography><Typography variant="caption" color="text.secondary" noWrap>{screenName}</Typography></Box>
   <IconButton size="small" aria-label="Close versions" onClick={onClose}><X size={17}/></IconButton>
  </Stack>
  {error && <Typography role="alert" sx={{ p: 2, color: 'error.main', fontSize: 13 }}>{error}</Typography>}
  {!versions && !error && <Typography sx={{ p: 2, color: 'text.secondary', fontSize: 13 }}>Loading versions…</Typography>}
  <Stack component="ol" aria-label={`${screenName} versions`} sx={{ listStyle: 'none', m: 0, p: 1 }}>
   {versions?.map((version, index) => <Box component="li" key={version.id} sx={{ p: 1.25, borderRadius: 1.5, '&:hover': { bgcolor: '#f3f6f4' } }}>
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
     <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{new Date(version.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</Typography>
     {version.id === headVersionId ? <Typography sx={{ fontSize: 11.5, color: '#2f5f48', fontWeight: 650 }}>Current</Typography>
      : <Button size="small" disabled={busy} onClick={() => onRestore(version)} sx={{ textTransform: 'none', minWidth: 0 }}>Restore</Button>}
    </Stack>
    <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: .25, overflowWrap: 'anywhere' }}>{version.feedback.replace(/⁣[^⁣]*⁣/g, '').trim().slice(0, 140) || (index === versions.length - 1 ? 'First version' : 'Edited')}</Typography>
    <Typography sx={{ fontSize: 11.5, color: '#8a949b' }}>{version.model === 'manual-edit' ? 'Manual edit' : version.model}</Typography>
   </Box>)}
  </Stack>
 </>;
}
