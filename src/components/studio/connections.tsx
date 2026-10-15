'use client';
import { useEffect, useState } from 'react';
import { Alert, Avatar, Box, Button, Card, CardContent, Chip, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material';
import { X as CloseOutlined } from 'lucide-react';
import { LockKeyhole as LockOutlined } from 'lucide-react';
import { KeyForm } from './forms';
import { OpenAIMark } from './provider-mark';
type DeviceState = {
    status: 'idle' | 'pending' | 'connected' | 'error' | 'unconfigured';
    verificationUrl?: string;
    userCode?: string;
    planType?: string;
    error?: string;
    scopes?: string[];
    identity?: { email?: string | null; name?: string | null };
};
export function Connections({ suffix }: {
    suffix: string | null;
}) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [keySuffix, setKeySuffix] = useState(suffix);
    const [device, setDevice] = useState<DeviceState>({ status: 'idle' });
    useEffect(() => {
        let active = true;
        fetch('/api/studio/connections/chatgpt', { cache: 'no-store' }).then(async response => ({ response, data: await response.json() })).then(({ response, data }) => {
            if (!active) return;
            if (typeof data.connected === 'boolean') {
                setDevice(data.connected ? { status: 'connected', scopes: data.scopes, identity: data.identity } : data.configured === false ? { status: 'unconfigured', error: 'OpenAI has not issued a sign-in client ID for this integration yet.' } : { status: 'idle' });
            } else if (['connected', 'pending', 'error', 'unconfigured'].includes(data.status)) setDevice(data);
            else if (!response.ok) setDevice({ status: 'error', error: data.error || 'The AI sign-in service could not load this connection.' });
        }).catch(() => { });
        return () => { active = false; };
    }, []);
    async function beginDeviceLogin() {
        setDevice({ status: 'pending' });
        try {
            const response = await fetch('/api/studio/connections/chatgpt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start' }) });
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.error || 'Could not start ChatGPT connection.');
            if (typeof data.authorizationUrl === 'string') {
                window.location.assign(data.authorizationUrl);
                return;
            }
            setDevice({ status: 'pending', verificationUrl: data.verificationUrl, userCode: data.userCode });
        }
        catch (error) {
            setDevice({ status: 'error', error: error instanceof Error ? error.message : 'Could not start ChatGPT connection.' });
        }
    }
    useEffect(() => {
        if (device.status !== 'pending' || !device.userCode)
            return;
        let active = true;
        const poll = async () => {
            try {
                const response = await fetch('/api/studio/connections/chatgpt', { cache: 'no-store' });
                const data = await response.json();
                if (active && data.status === 'connected')
                    setDevice({ status: 'connected', planType: data.planType });
                else if (active && data.status === 'error')
                    setDevice({ status: 'error', error: data.error });
            }
            catch { /* Keep the code visible; the next poll can recover from transient network errors. */ }
        };
        const timer = window.setInterval(poll, 2500);
        void poll();
        return () => { active = false; window.clearInterval(timer); };
    }, [device.status, device.userCode]);
    async function disconnectDevice() {
        const response = await fetch('/api/studio/connections/chatgpt', { method: 'DELETE' });
        if (response.ok)
            setDevice({ status: 'idle' });
        else {
            const data = await response.json().catch(() => ({}));
            setDevice({ status: 'error', error: data.error || 'Could not disconnect this workspace.' });
        }
    }
    const canUsePlan = device.scopes?.includes('chatgpt.tokens.use.direct');
    return <><Alert severity="info" icon={false} sx={{ mb: 3 }}>Connect your ChatGPT plan or OpenAI API key. If the selected connection reaches its usage limit, GuildOS will retry with the other connected option. Connections are private to this workspace.</Alert>{typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ai_connection') === 'openai' && <Alert severity={new URLSearchParams(window.location.search).get('status') === 'connected' ? 'success' : 'info'} sx={{ mb: 3 }}>{new URLSearchParams(window.location.search).get('status') === 'connected' ? 'ChatGPT account connected.' : 'ChatGPT sign-in was not completed. You can try again.'}</Alert>}<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, maxWidth: 1050 }}>
 <Card><CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', minHeight: 310 }}><Stack direction="row" sx={{ mb: 3, justifyContent: "space-between", alignItems: "center" }}><Avatar variant="rounded" sx={{ bgcolor: '#edf3ef', color: '#111111' }}><OpenAIMark/></Avatar><Chip label={device.status === 'connected' ? 'Connected' : 'ChatGPT plan'} color={device.status === 'connected' ? 'success' : 'default'} variant="outlined"/></Stack><Typography variant="h6">ChatGPT</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3, lineHeight: 1.75 }}>Plus or Pro plan · Sign in with your ChatGPT account to use its plan for GuildOS.</Typography>
 {device.status === 'connected' ? <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}><Typography variant="body2" color="success.main">Connected{device.identity?.email ? ' · ' + device.identity.email : device.planType ? ' · ' + device.planType : ''}</Typography><Button size="small" onClick={disconnectDevice}>Disconnect</Button></Stack> : <Button variant="outlined" fullWidth disabled={device.status === 'pending' || device.status === 'unconfigured'} onClick={beginDeviceLogin} sx={{ mt: 'auto' }}>{device.status === 'pending' ? device.userCode ? 'Waiting for approval…' : 'Starting connection…' : device.status === 'error' ? 'Try again' : device.status === 'unconfigured' ? 'Unavailable on this deployment' : 'Connect ChatGPT'}</Button>}
 {device.status === 'connected' && !canUsePlan && <Alert severity="info" sx={{ mt: 2 }}>This account is connected, but ChatGPT plan usage has not been enabled for this integration yet. You can still use an OpenAI API key below.</Alert>}
 {device.status === 'pending' && device.userCode && <Alert severity="info" role="status" sx={{ mt: 2 }}><Typography variant="caption">VERIFICATION CODE</Typography><Typography sx={{ fontFamily: 'monospace', fontSize: 26, letterSpacing: 3, my: 1 }}>{device.userCode}</Typography><Button size="small" component="a" href={device.verificationUrl} target="_blank" rel="noreferrer">Open ChatGPT verification</Button></Alert>}
 {(device.status === 'error' || device.status === 'unconfigured') && <Alert severity={device.status === 'unconfigured' ? 'info' : 'error'} sx={{ mt: 2 }}>{device.error}</Alert>}<Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>Beta · Requires the GuildOS connection service.</Typography></CardContent></Card>
 <Card><CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', minHeight: 310 }}><Stack direction="row" sx={{ mb: 3, justifyContent: "space-between", alignItems: "center" }}><Avatar variant="rounded" sx={{ bgcolor: '#edf1f7', color: '#111111' }}><OpenAIMark/></Avatar><Chip label={keySuffix ? 'Connected · •••• ' + keySuffix : 'Bring your own key'} variant="outlined" color={keySuffix ? 'success' : 'default'}/></Stack><Typography variant="h6">OpenAI API</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3, lineHeight: 1.75 }}>Pay as you go · Use models billed to your OpenAI API account.</Typography><Button fullWidth variant="contained" onClick={() => setDialogOpen(true)} sx={{ mt: 'auto' }}>{keySuffix ? 'Manage API key' : 'Connect API key'}</Button><Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>Encrypted at rest. Used only on the server.</Typography></CardContent></Card></Box>
 <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm" aria-labelledby="key-dialog-title"><DialogTitle id="key-dialog-title" sx={{ pt: 3, pr: 7 }}>{keySuffix ? 'Update your API key' : 'Connect your API key'}</DialogTitle><IconButton aria-label="Close key dialog" onClick={() => setDialogOpen(false)} sx={{ position: 'absolute', right: 16, top: 16 }}><CloseOutlined /></IconButton><DialogContent sx={{ pb: 3 }}><Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Bring your own key and keep control of provider billing.</Typography><Alert severity="info" icon={<LockOutlined size={18}/>} sx={{ mb: 3 }}>Your key is encrypted before storage and only decrypted in memory when a generation runs.</Alert><KeyForm connected={Boolean(keySuffix)} onSaved={setKeySuffix} onRemoved={() => setKeySuffix(null)}/><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>API usage is billed by OpenAI. Remove or replace this key at any time.</Typography></DialogContent></Dialog>
 </>;
}
