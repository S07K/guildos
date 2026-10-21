'use client';
import { useEffect, useState } from 'react';
import { Alert, Avatar, Box, Button, Card, CardContent, Chip, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material';
import { X as CloseOutlined } from 'lucide-react';
import { LockKeyhole as LockOutlined } from 'lucide-react';
import { KeyForm, OpenRouterKeyForm, GroqKeyForm } from './forms';
import { OpenAIMark } from './provider-mark';
import { AiProviderMark } from '@/components/ai-provider-mark';

function ConnectionLogo({ provider }: { provider: 'chatgpt' | 'openai' | 'openrouter' | 'groq' }) {
    const backgrounds = { chatgpt: '#edf3ef', openai: '#edf1f7', openrouter: '#f0edf8', groq: '#F54F35' };
    return <Avatar variant="rounded" sx={{ width: 40, height: 40, flexShrink: 0, bgcolor: backgrounds[provider], color: '#111111' }}>
        {provider === 'groq' ? <svg xmlns="http://www.w3.org/2000/svg" viewBox="56 36 88 128" width="24" height="24" aria-hidden="true"><path fill="#FEFBFB" d="m128 49 1.895 1.52C136.336 56.288 140.602 64.49 142 73c.097 1.823.148 3.648.161 5.474l.03 3.247.012 3.482.017 3.613c.01 2.522.016 5.044.02 7.565.01 3.84.041 7.68.072 11.521.007 2.455.012 4.91.016 7.364l.038 3.457c-.033 11.717-3.373 21.83-11.475 30.547-4.552 4.23-9.148 7.372-14.891 9.73l-2.387 1.055c-9.275 3.355-20.3 2.397-29.379-1.13-5.016-2.38-9.156-5.17-13.234-8.925 3.678-4.526 7.41-8.394 12-12l3.063 2.375c5.572 3.958 11.135 5.211 17.937 4.625 6.96-1.384 12.455-4.502 17-10 4.174-6.784 4.59-12.222 4.531-20.094l.012-3.473c.003-2.414-.005-4.827-.022-7.241-.02-3.68 0-7.36.026-11.04-.003-2.353-.008-4.705-.016-7.058l.025-3.312c-.098-7.996-1.732-13.21-6.681-19.47-6.786-5.458-13.105-8.211-21.914-7.792-7.327 1.188-13.278 4.7-17.777 10.601C75.472 72.012 73.86 78.07 75 85c2.191 7.547 5.019 13.948 12 18 5.848 3.061 10.892 3.523 17.438 3.688l2.794.103c2.256.082 4.512.147 6.768.209v16c-16.682.673-29.615.654-42.852-10.848-8.28-8.296-13.338-19.55-13.71-31.277.394-9.87 3.93-17.894 9.562-25.875l1.688-2.563C84.698 35.563 110.05 34.436 128 49Z"/></svg> : provider === 'openrouter' ? <AiProviderMark id="openrouter" size={24}/> : <OpenAIMark size={24}/>}
    </Avatar>;
}

type DeviceState = {
    status: 'idle' | 'pending' | 'connected' | 'error' | 'unconfigured';
    transport?: 'codex';
    verificationUrl?: string;
    userCode?: string;
    planType?: string;
    error?: string;
    scopes?: string[];
    identity?: { email?: string | null; name?: string | null };
};
export function Connections({ suffix, openRouterSuffix, groqSuffix }: {
    suffix: string | null;
    openRouterSuffix: string | null;
    groqSuffix: string | null;
}) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [keySuffix, setKeySuffix] = useState(suffix);
    const [routerSuffix, setRouterSuffix] = useState(openRouterSuffix);
    const [routerDialogOpen,setRouterDialogOpen]=useState(false);
    const [groqDialogOpen,setGroqDialogOpen]=useState(false);
    const [groqKeySuffix,setGroqKeySuffix]=useState(groqSuffix);
    const [device, setDevice] = useState<DeviceState>({ status: 'idle' });
    useEffect(() => {
        let active = true;
        fetch('/api/studio/connections/chatgpt', { cache: 'no-store' }).then(async response => ({ response, data: await response.json() })).then(({ response, data }) => {
            if (!active) return;
            if (typeof data.connected === 'boolean') {
                setDevice(data.connected ? { status: 'connected', scopes: data.scopes, identity: data.identity } : data.configured === false ? { status: 'unconfigured', error: 'ChatGPT website sign-in is not configured on this deployment.' } : { status: 'idle' });
            } else if (['idle', 'connected', 'pending', 'error', 'unconfigured'].includes(data.status)) setDevice(data);
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
            setDevice({ ...data, status: 'pending' });
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
                    setDevice(data);
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
            setDevice({ status: 'idle', transport: device.transport });
        else {
            const data = await response.json().catch(() => ({}));
            setDevice({ status: 'error', error: data.error || 'Could not disconnect this workspace.' });
        }
    }
    const canUsePlan = device.transport === 'codex' || device.scopes?.includes('chatgpt.tokens.use.direct');
    return <>{typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ai_connection') === 'openai' && <Alert severity={new URLSearchParams(window.location.search).get('status') === 'connected' ? 'success' : 'info'} sx={{ mb: 3 }}>{new URLSearchParams(window.location.search).get('status') === 'connected' ? 'ChatGPT account connected.' : 'ChatGPT sign-in was not completed. You can try again.'}</Alert>}<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl:'repeat(3,minmax(0,1fr))' }, gap: 3, maxWidth: 1350 }}>
 <Card><CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', minHeight: 310 }}><Stack direction="row" sx={{ mb: 3, justifyContent: "space-between", alignItems: "center" }}><ConnectionLogo provider="chatgpt"/><Chip label={device.status === 'connected' ? 'Connected' : 'ChatGPT plan'} color={device.status === 'connected' ? 'success' : 'default'} variant="outlined"/></Stack><Typography variant="h6">ChatGPT</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3, lineHeight: 1.75 }}>Connect your ChatGPT account to use models available with your plan.</Typography>
 {device.status === 'connected' ? <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}><Typography variant="body2" color="success.main">Connected{device.identity?.email ? ' · ' + device.identity.email : device.planType ? ' · ' + device.planType : ''}</Typography><Button size="small" onClick={disconnectDevice}>Disconnect</Button></Stack> : <Button variant="outlined" fullWidth disabled={device.status === 'pending' || device.status === 'unconfigured'} onClick={beginDeviceLogin} sx={{ mt: 'auto' }}>{device.status === 'pending' ? device.userCode ? 'Waiting for approval…' : 'Starting connection…' : device.status === 'error' ? 'Try again' : device.status === 'unconfigured' ? 'Unavailable on this deployment' : 'Connect ChatGPT'}</Button>}
 {device.status === 'connected' && !canUsePlan && <Alert severity="info" sx={{ mt: 2 }}>This account is connected, but ChatGPT plan usage has not been enabled for this integration yet. You can still use an OpenAI API key below.</Alert>}
 {device.status === 'pending' && device.userCode && <Alert severity="info" role="status" sx={{ mt: 2 }}><Typography variant="caption">VERIFICATION CODE</Typography><Typography sx={{ fontFamily: 'monospace', fontSize: 26, letterSpacing: 3, my: 1 }}>{device.userCode}</Typography><Typography variant="body2" sx={{ mb: 1 }}>Enter this code in ChatGPT to approve the connection.</Typography><Button size="small" component="a" href={device.verificationUrl} target="_blank" rel="noreferrer">Open ChatGPT verification</Button><Button size="small" onClick={disconnectDevice}>Cancel sign-in</Button></Alert>}
 {(device.status === 'error' || device.status === 'unconfigured') && <Alert severity={device.status === 'unconfigured' ? 'info' : 'error'} sx={{ mt: 2 }}>{device.error}</Alert>}</CardContent></Card>
 <Card><CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', minHeight: 310 }}><Stack direction="row" sx={{ mb: 3, justifyContent: "space-between", alignItems: "center" }}><ConnectionLogo provider="openai"/><Chip label={keySuffix ? 'Connected · •••• ' + keySuffix : 'Bring your own key'} variant="outlined" color={keySuffix ? 'success' : 'default'}/></Stack><Typography variant="h6">OpenAI API</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3, lineHeight: 1.75 }}>Pay as you go · Use models billed to your OpenAI API account.</Typography><Button fullWidth variant="contained" onClick={() => setDialogOpen(true)} sx={{ mt: 'auto' }}>{keySuffix ? 'Manage API key' : 'Connect API key'}</Button><Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>Encrypted at rest. Used only on the server.</Typography></CardContent></Card>
 <Card><CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', minHeight: 310 }}><Stack direction="row" sx={{ mb: 3, justifyContent: 'space-between', alignItems: 'center' }}><ConnectionLogo provider="openrouter"/><Chip label={routerSuffix ? 'Connected · •••• '+routerSuffix : 'Bring your own key'} variant="outlined" color={routerSuffix ? 'success' : 'default'}/></Stack><Typography variant="h6">OpenRouter</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3, lineHeight: 1.75 }}>Use NVIDIA Nemotron 3 Super (free) for agent tasks and designs. Free tier limits apply.</Typography><Button fullWidth variant="contained" onClick={()=>setRouterDialogOpen(true)} sx={{ mt:'auto' }}>{routerSuffix?'Manage API key':'Connect OpenRouter'}</Button><Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>Encrypted at rest. No token charge for this model.</Typography></CardContent></Card>
 <Card><CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', minHeight: 310 }}><Stack direction="row" sx={{ mb: 3, justifyContent: 'space-between', alignItems: 'center' }}><ConnectionLogo provider="groq"/><Chip label={groqKeySuffix ? 'Connected · •••• '+groqKeySuffix : 'Bring your own key'} variant="outlined" color={groqKeySuffix ? 'success' : 'default'}/></Stack><Typography variant="h6">Groq</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3, lineHeight: 1.75 }}>Fast inference with GPT OSS 120B for project chat, canvas tasks, and designs. Groq usage and billing limits apply.</Typography><Button fullWidth variant="contained" onClick={()=>setGroqDialogOpen(true)} sx={{ mt:'auto' }}>{groqKeySuffix?'Manage API key':'Connect Groq'}</Button><Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>Encrypted at rest. Used only on the server.</Typography></CardContent></Card></Box>
 <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm" aria-labelledby="key-dialog-title"><DialogTitle id="key-dialog-title" sx={{ pt: 3, pr: 7 }}>{keySuffix ? 'Update your API key' : 'Connect your API key'}</DialogTitle><IconButton aria-label="Close key dialog" onClick={() => setDialogOpen(false)} sx={{ position: 'absolute', right: 16, top: 16 }}><CloseOutlined /></IconButton><DialogContent sx={{ pb: 3 }}><Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Bring your own key and keep control of provider billing.</Typography><Alert severity="info" icon={<LockOutlined size={18}/>} sx={{ mb: 3 }}>Your key is encrypted before storage and only decrypted in memory when a generation runs.</Alert><KeyForm connected={Boolean(keySuffix)} onSaved={setKeySuffix} onRemoved={() => setKeySuffix(null)}/><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>API usage is billed by OpenAI. Remove or replace this key at any time.</Typography></DialogContent></Dialog>
 <Dialog open={routerDialogOpen} onClose={()=>setRouterDialogOpen(false)} fullWidth maxWidth="sm" aria-labelledby="openrouter-dialog-title"><DialogTitle id="openrouter-dialog-title" sx={{pt:3,pr:7}}>{routerSuffix?'Manage OpenRouter key':'Connect OpenRouter'}</DialogTitle><IconButton aria-label="Close OpenRouter dialog" onClick={()=>setRouterDialogOpen(false)} sx={{position:'absolute',right:16,top:16}}><CloseOutlined/></IconButton><DialogContent sx={{pb:3}}><Typography variant="body2" color="text.secondary" sx={{mb:2}}>Paste an OpenRouter API key. We verify it before saving.</Typography><Alert severity="info" icon={<LockOutlined size={18}/>} sx={{mb:3}}>Your key is encrypted at rest and used only for server-side model requests.</Alert><OpenRouterKeyForm connected={Boolean(routerSuffix)} onSaved={setRouterSuffix} onRemoved={()=>setRouterSuffix(null)}/></DialogContent></Dialog>
 <Dialog open={groqDialogOpen} onClose={()=>setGroqDialogOpen(false)} fullWidth maxWidth="sm" aria-labelledby="groq-dialog-title"><DialogTitle id="groq-dialog-title" sx={{pt:3,pr:7}}>{groqKeySuffix?'Manage Groq key':'Connect Groq'}</DialogTitle><IconButton aria-label="Close Groq dialog" onClick={()=>setGroqDialogOpen(false)} sx={{position:'absolute',right:16,top:16}}><CloseOutlined/></IconButton><DialogContent sx={{pb:3}}><Typography variant="body2" color="text.secondary" sx={{mb:2}}>Paste a Groq API key. GuildOS verifies access to GPT OSS 120B before saving.</Typography><Alert severity="info" icon={<LockOutlined size={18}/>} sx={{mb:3}}>Your key is encrypted at rest and used only for server-side model requests.</Alert><GroqKeyForm connected={Boolean(groqKeySuffix)} onSaved={setGroqKeySuffix} onRemoved={()=>setGroqKeySuffix(null)}/></DialogContent></Dialog>
 </>;
}
