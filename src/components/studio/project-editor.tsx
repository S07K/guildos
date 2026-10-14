'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, LinearProgress, List, ListItemButton, ListItemIcon, ListItemText, MenuItem, Stack, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import UndoOutlined from '@mui/icons-material/UndoOutlined';
import RedoOutlined from '@mui/icons-material/RedoOutlined';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import DesktopWindowsOutlined from '@mui/icons-material/DesktopWindowsOutlined';
import SmartphoneOutlined from '@mui/icons-material/SmartphoneOutlined';
import ZoomInOutlined from '@mui/icons-material/ZoomInOutlined';
import ZoomOutOutlined from '@mui/icons-material/ZoomOutOutlined';
import FitScreenOutlined from '@mui/icons-material/FitScreenOutlined';
import PanToolOutlined from '@mui/icons-material/PanToolOutlined';
import LayersOutlined from '@mui/icons-material/LayersOutlined';
import ArticleOutlined from '@mui/icons-material/ArticleOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import { renderDesign } from '@/lib/studio/design.mjs';
import { blankCanvas, isCanvas, renderCanvas, type CanvasDocument, type CanvasNode } from '@/lib/studio/canvas';
import { CanvasSurface, type CanvasTool } from './canvas-surface';
import { AccountMenu } from './account-menu';
import { ThemeProvider, useTheme } from '@mui/material/styles';
import { useMediaQuery, Paper, Slider } from '@mui/material';
import ViewSidebarOutlined from '@mui/icons-material/ViewSidebarOutlined';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import PeopleAltOutlined from '@mui/icons-material/PeopleAltOutlined';
import BuildOutlined from '@mui/icons-material/BuildOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import DragIndicatorOutlined from '@mui/icons-material/DragIndicatorOutlined';
import NearMeOutlined from '@mui/icons-material/NearMeOutlined';
import CropFreeOutlined from '@mui/icons-material/CropFreeOutlined';
import RectangleOutlined from '@mui/icons-material/RectangleOutlined';
import CircleOutlined from '@mui/icons-material/CircleOutlined';
import TextFieldsOutlined from '@mui/icons-material/TextFieldsOutlined';
import HorizontalRuleOutlined from '@mui/icons-material/HorizontalRuleOutlined';
import DrawOutlined from '@mui/icons-material/DrawOutlined';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutline from '@mui/icons-material/DeleteOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import ArrowUpward from '@mui/icons-material/ArrowUpward';
import ArrowDownward from '@mui/icons-material/ArrowDownward';
import ForumOutlined from '@mui/icons-material/ForumOutlined';
import { GuildPanel, type GuildNote } from './guild-panel';
import { AgentConversation } from './agent-conversation';
import { GuildLineup } from './agent-identity';
import type { AgentRole } from '@/lib/studio/agent-roles';
type Feature = {
    title: string;
    description: string;
};
type Design = {
    brand: string;
    eyebrow: string;
    headline: string;
    description: string;
    cta: string;
    style: 'editorial' | 'bold' | 'minimal';
    palette: 'ocean' | 'moss' | 'clay' | 'midnight';
    features: Feature[];
    closingTitle: string;
    closingDescription: string;
    designNotes: string;
};
type Version = {
    id: string;
    document: Design | CanvasDocument;
    feedback: string;
    created_at: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
};
type Project = {
    id: string;
    name: string;
    brief: string;
    cta_url: string;
};
type Layer = 'page' | 'header' | 'hero' | 'features' | 'closing' | 'footer';
const layers: {
    id: Layer;
    title: string;
    icon: string;
}[] = [
    { id: 'page', title: 'Page settings', icon: '▦' }, { id: 'header', title: 'Navigation', icon: '⌑' },
    { id: 'hero', title: 'Hero section', icon: '▤' }, { id: 'features', title: 'Benefits', icon: '▥' },
    { id: 'closing', title: 'Closing section', icon: '▤' }, { id: 'footer', title: 'Footer', icon: '▰' },
];
export function ProjectEditor({ project, initialVersions, connections = { api:false, chatgpt:false } }: {
    project: Project;
    initialVersions: Version[];
    connections?: {api:boolean;chatgpt:boolean};
}) {
    const [versions, setVersions] = useState(initialVersions);
    const [selected, setSelected] = useState(initialVersions[0]?.id || '');
    const active = versions.find(item => item.id === selected);
    const [draft, setDraft] = useState<Design | CanvasDocument | null>(active?.document || null);
    const [layer, setLayer] = useState<Layer>('hero');
    const [feedback, setFeedback] = useState('');
    const [newGuildNotes, setNewGuildNotes] = useState<GuildNote[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [mobile, setMobile] = useState(false);
    const [zoom, setZoom] = useState(65);
    const zoomRef = useRef(65);
    const [inspectorTab, setInspectorTab] = useState('design');
    const [leftTab, setLeftTab] = useState('layers');
    const [leftPanel, setLeftPanel] = useState<'file'|'agents'|'tools'>('file');
    const [tool, setTool] = useState<CanvasTool>('select');
    const panMode = tool === 'hand';
    const [nodeId, setNodeId] = useState('');
    const [leftOpen, setLeftOpen] = useState(true), [rightOpen, setRightOpen] = useState(true);
    const draggedNodeId = useRef<string | null>(null);
    const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
    const [provider, setProvider] = useState(connections.chatgpt && !connections.api ? 'chatgpt' : 'api');
    const [chatAgent, setChatAgent] = useState<AgentRole | null>(null);
    const [discardAction,setDiscardAction] = useState<(() => void) | null>(null);
    const editorTheme = useTheme();
    const narrow = useMediaQuery('(max-width:800px)');
    const pointers = useRef(new Map<number,{x:number;y:number}>());
    const pinch = useRef<{distance:number;zoom:number}|null>(null);
    const [pendingVersion, setPendingVersion] = useState<Version | null>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const drag = useRef<{
        x: number;
        y: number;
        left: number;
        top: number;
    } | null>(null);
    const [past, setPast] = useState<(Design | CanvasDocument)[]>([]);
    const [future, setFuture] = useState<(Design | CanvasDocument)[]>([]);
    const [saving, setSaving] = useState(false);
    const html = useMemo(() => { if (!draft)
        return ''; try {
        return isCanvas(draft) ? renderCanvas(draft,project.name) : renderDesign(draft, project.cta_url);
    }
    catch {
        return active ? (isCanvas(active.document)?renderCanvas(active.document,project.name):renderDesign(active.document, project.cta_url)) : '';
    } }, [draft, active, project.cta_url]);
    const previewHtml = useMemo(() => { const selector = { page: '', header: 'header', hero: '.hero', features: '.features', closing: '.closing', footer: 'footer' }[layer]; return selector && inspectorTab === 'design' ? html.replace('</style>', selector + '{outline:2px solid #6f9b7e;outline-offset:-2px}</style>') : html; }, [html, layer, inspectorTab]);
    const dirty = !!draft && (!active || JSON.stringify(draft) !== JSON.stringify(active.document));
    const update = (key: keyof Design, value: string) => {
        if (!draft || isCanvas(draft))
            return;
        setPast(items => [...items.slice(-29), draft]);
        setFuture([]);
        setDraft(current => current && !isCanvas(current) ? { ...current, [key]: value } : current);
    };
    const updateFeature = (index: number, key: keyof Feature, value: string) => {
        if (!draft || isCanvas(draft))
            return;
        setPast(items => [...items.slice(-29), draft]);
        setFuture([]);
        setDraft(current => current && !isCanvas(current) ? { ...current, features: current.features.map((feature, i) => i === index ? { ...feature, [key]: value } : feature) } : current);
    };
    const selectVersion = (item: Version) => { setSelected(item.id); setDraft(structuredClone(item.document)); setPast([]); setFuture([]); setError(''); };
    const undo = () => { const previous = past.at(-1); if (!previous || !draft)
        return; setFuture(items => [draft, ...items]); setPast(items => items.slice(0, -1)); setDraft(previous); };
    const redo = () => { const next = future[0]; if (!next || !draft)
        return; setPast(items => [...items, draft]); setFuture(items => items.slice(1)); setDraft(next); };
    async function persistManual(): Promise<Version | null> {
        if (!draft || !dirty || saving)
            return null;
        setSaving(true);
        setError('');
        try {
            const response = await fetch('/api/studio/versions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, parentVersionId: active?.id, document: draft, feedback: 'Manual canvas edits' }) });
            const data = await response.json();
            if (!response.ok || !data.version?.id)
                throw new Error(data.error || 'Could not save these edits.');
            setVersions(items => [data.version, ...items]);
            setSelected(data.version.id);
            setDraft(data.version.document);
            setPast([]);
            setFuture([]);
            return data.version as Version;
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not save these edits.');
        }
        finally {
            setSaving(false);
        }
        return null;
    }
    async function generate() {
        if (busy || saving)
            return;
        if (active && !feedback.trim()) {
            setInspectorTab('ai');
            return;
        }
        let baseVersion = active;
        if (dirty) {
            const saved = await persistManual();
            if (!saved)
                return;
            baseVersion = saved;
        }
        setBusy(true);
        setError('');
        try {
            const response = await fetch('/api/studio/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, versionId: baseVersion?.id, feedback: baseVersion ? feedback.trim() || 'Use this manual canvas as the starting point for a complete landing page.' : '', provider }), signal: AbortSignal.timeout(125000) });
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.error || 'Generation failed. Please try again.');
            if (!data.version?.id)
                throw new Error('The design could not be saved.');
            setVersions(items => [data.version, ...items]);
            setSelected(data.version.id);
            setDraft(data.version.document);
            if (Array.isArray(data.notes)) setNewGuildNotes(data.notes);
            if (data.warning) setError(data.warning);
            else if (data.notes?.length) { setRightOpen(true); setInspectorTab('guild'); }
            setFeedback('');
            setPast([]);
            setFuture([]);
        }
        catch (cause) {
            setError(cause instanceof Error && cause.name !== 'TimeoutError' ? cause.message : 'This is taking longer than expected. Reload the project to check whether your version was saved.');
        }
        finally {
            setBusy(false);
        }
    }
    function download() {
        if (!draft)
            return;
        const url = URL.createObjectURL(new Blob([isCanvas(draft) ? renderCanvas(draft,project.name) : renderDesign(draft, project.cta_url)], { type: 'text/html;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = (project.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 60) || 'landing-page') + '.html';
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    const updateText = (key: keyof Design, label: string, multiline = false) => draft && !isCanvas(draft) ? <TextField key={key} label={label} value={String(draft[key])} onChange={event => update(key, event.target.value)} multiline={multiline} minRows={multiline ? 3 : undefined} disabled={busy || saving} slotProps={{ htmlInput: { maxLength: 2000 } }}/> : null;
    const artboardWidth = isCanvas(draft) ? draft.width : mobile ? 390 : 1100;
    const artboardHeight = isCanvas(draft) ? draft.height : 1800;
    const fit = () => { const available = canvasRef.current?.clientWidth || 800; setZoom(Math.max(20, Math.min(100, Math.floor((available - 96) / artboardWidth * 100)))); };
    const commitCanvas = () => {if(draft){setPast(items=>[...items.slice(-49),structuredClone(draft)]);setFuture([]);}};
    const selectedNode = isCanvas(draft) ? draft.nodes.find(node=>node.id===nodeId) : undefined;
    const patchNode = (patch:Partial<CanvasNode>) => {if(!isCanvas(draft)||!selectedNode)return;commitCanvas();setDraft({...draft,nodes:draft.nodes.map(node=>node.id===nodeId?{...node,...patch}:node)});};
    const removeNode = () => {if(!isCanvas(draft)||!nodeId)return;commitCanvas();setDraft({...draft,nodes:draft.nodes.filter(node=>node.id!==nodeId)});setNodeId('');};
    const duplicateNode = () => {if(!isCanvas(draft)||!selectedNode)return;commitCanvas();const node={...structuredClone(selectedNode),id:crypto.randomUUID(),name:selectedNode.name+' copy',x:selectedNode.x+24,y:selectedNode.y+24};setDraft({...draft,nodes:[...draft.nodes,node]});setNodeId(node.id);};
    const reorderCanvasNode = (sourceId:string,targetId:string) => {
        if(!isCanvas(draft)||sourceId===targetId)return;
        const ordered=[...draft.nodes].reverse();
        const from=ordered.findIndex(node=>node.id===sourceId),to=ordered.findIndex(node=>node.id===targetId);
        if(from<0||to<0)return;
        const [moved]=ordered.splice(from,1);ordered.splice(to,0,moved);
        commitCanvas();setDraft({...draft,nodes:ordered.reverse()});setFuture([]);
    };
    const startBlank = () => {const action=()=>{setDraft(blankCanvas());setSelected('');setNodeId('');setPast([]);setFuture([]);setTool('select');setInspectorTab('design');setError('');};dirty?setDiscardAction(()=>action):action();};
    useEffect(()=>{
      const element=canvasRef.current;if(!element)return;
      let frame=0,startZoom=zoomRef.current,startLeft=0,startTop=0,anchorX=0,anchorY=0;
      const wheel=(event:WheelEvent)=>{if(!event.ctrlKey&&!event.metaKey)return;event.preventDefault();const bounds=element.getBoundingClientRect(),old=zoomRef.current,next=Math.max(10,Math.min(300,old*Math.exp(-event.deltaY*.005)));if(next===old)return;if(!frame){startZoom=old;startLeft=element.scrollLeft;startTop=element.scrollTop;anchorX=event.clientX-bounds.left;anchorY=event.clientY-bounds.top;frame=requestAnimationFrame(()=>{frame=0;const finalZoom=zoomRef.current;setZoom(current=>current===finalZoom?current:finalZoom);const ratio=finalZoom/startZoom;element.scrollLeft=(startLeft+anchorX)*ratio-anchorX;element.scrollTop=(startTop+anchorY)*ratio-anchorY;});}zoomRef.current=next;};
      element.addEventListener('wheel',wheel,{passive:false});return()=>{element.removeEventListener('wheel',wheel);if(frame)cancelAnimationFrame(frame);};
    },[]);
    useEffect(()=>{zoomRef.current=zoom;},[zoom]);
    useEffect(() => {
        const shortcuts=(event:KeyboardEvent)=>{if((event.target as HTMLElement).isContentEditable||event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)return;if(event.key==='Delete'||event.key==='Backspace'){if(isCanvas(draft)&&nodeId){event.preventDefault();removeNode();}}if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='d'){event.preventDefault();duplicateNode();}if(!event.metaKey&&!event.ctrlKey){const key=event.key.toLowerCase();const tools:Record<string,CanvasTool>={v:'select',h:'hand',f:'frame',r:'rectangle',o:'ellipse',t:'text',l:'line',p:'path'};if(tools[key])setTool(tools[key]);}};
        window.addEventListener('keydown',shortcuts);
        const onKey = (event: KeyboardEvent) => { if (!(event.metaKey || event.ctrlKey))
            return; if (event.key.toLowerCase() === 's') {
            event.preventDefault();
            void persistManual();
        }
        else if (event.key.toLowerCase() === 'z' && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) {
            event.preventDefault();
            if (event.shiftKey)
                redo();
            else
                undo();
        } };
        window.addEventListener('keydown', onKey);
        return () => {window.removeEventListener('keydown', onKey);window.removeEventListener('keydown',shortcuts);};
    });
    return <ThemeProvider theme={editorTheme}><Box className="design-workspace" sx={{bgcolor:'background.default',color:'text.primary'}}>
  <Stack component="header" direction="row" spacing={1.5} sx={{minHeight:58,px:2,borderBottom:'1px solid',borderColor:'divider',bgcolor:'background.paper',alignItems:'center',flexWrap:{xs:'wrap',sm:'nowrap'},py:{xs:1,sm:0}}}>
   <Link href="/studio" className="editor-logo" aria-label="Back to dashboard">guildos</Link><Divider orientation="vertical" flexItem sx={{my:1.5}}/><Box sx={{minWidth:0,flex:1}}><Typography component="h1" variant="body2" sx={{fontWeight:600}} noWrap>{project.name}</Typography><Typography variant="caption" color="text.secondary">{active?'Version '+(versions.length-versions.indexOf(active)):draft?'Manual canvas':'New project'}</Typography></Box>
   <Tooltip title={leftOpen&&rightOpen?'Minimize UI':'Show panels'}><IconButton size="small" aria-label={leftOpen&&rightOpen?'Minimize UI':'Show panels'} onClick={()=>{const open=!(leftOpen&&rightOpen);setLeftOpen(open);setRightOpen(open);}}><ViewSidebarOutlined fontSize="small"/></IconButton></Tooltip>
   <Chip label={saving?'Saving…':dirty?'Unsaved':active?'Saved':'Draft'} variant="outlined" color={dirty?'warning':'default'} sx={{display:{xs:'none',md:'flex'}}}/>
   <Tooltip title="Undo"><span><IconButton size="small" aria-label="Undo" onClick={undo} disabled={!past.length||busy||saving}><UndoOutlined fontSize="small"/></IconButton></span></Tooltip><Tooltip title="Redo"><span><IconButton size="small" aria-label="Redo" onClick={redo} disabled={!future.length||busy||saving}><RedoOutlined fontSize="small"/></IconButton></span></Tooltip>
   {dirty&&<Button size="small" variant="contained" startIcon={<SaveOutlined/>} onClick={()=>void persistManual()} disabled={saving||busy}>Save changes</Button>}{draft&&<Button size="small" startIcon={<DownloadOutlined/>} onClick={download} sx={{display:{xs:'none',sm:'inline-flex'}}}>Export HTML</Button>}
   <Button size="small" onClick={startBlank} disabled={busy||saving} sx={{display:{xs:'none',sm:'inline-flex'}}}>New canvas</Button><Button size="small" variant="contained" startIcon={<AutoAwesomeOutlined/>} disabled={busy||saving} onClick={()=>{setRightOpen(true);setInspectorTab('ai');}}>{busy?'Generating…':active?'Run guild revision':'Run guild'}</Button><AccountMenu/>
  </Stack>{busy&&<LinearProgress aria-label="Generating design"/>}
  <Box className="design-workspace-body" style={{gridTemplateColumns:narrow?(rightOpen?'minmax(0,1fr) 240px':'minmax(0,1fr)'):(leftOpen?'54px 228px ':'0px 0px ')+'minmax(0,1fr) '+(rightOpen?'296px':'0px')}}>
   <Box component="nav" className="editor-rail" aria-label="Editor navigation" sx={{display:leftOpen&&!narrow?'flex':'none',bgcolor:'background.paper',borderRight:'1px solid',borderColor:'divider'}}>
    {[{id:'file',label:'File',Icon:FolderOutlined},{id:'agents',label:'Agents',Icon:PeopleAltOutlined},{id:'tools',label:'Tools',Icon:BuildOutlined}].map(item=><Tooltip key={item.id} title={item.label} placement="right"><IconButton aria-label={item.label} aria-pressed={leftPanel===item.id} onClick={()=>setLeftPanel(item.id as typeof leftPanel)} sx={{width:42,height:42,borderRadius:1,color:leftPanel===item.id?'#426a55':'text.secondary',bgcolor:leftPanel===item.id?'#eaf1ec':'transparent','&:hover':{bgcolor:'#f1f5f2'}}}><item.Icon fontSize="small"/></IconButton></Tooltip>)}
    <Box sx={{flex:1}}/><Tooltip title="Design properties" placement="right"><IconButton aria-label="Design properties" onClick={()=>{setRightOpen(true);setInspectorTab('design');}} sx={{width:42,height:42,borderRadius:1,color:inspectorTab==='design'?'#426a55':'text.secondary',bgcolor:inspectorTab==='design'?'#eaf1ec':'transparent'}}><TuneOutlined fontSize="small"/></IconButton></Tooltip>
   </Box>
   <Box component="aside" className="design-side-panel layers-panel" aria-label="Layers and versions" sx={{display:leftOpen&&!narrow?'block':'none',bgcolor:'background.paper',borderRight:'1px solid',borderColor:'divider'}}>
    {leftPanel==='file'?<><Tabs value={leftTab} onChange={(_,value)=>setLeftTab(value)} variant="fullWidth"><Tab label="Layers" value="layers"/><Tab label="Versions" value="versions"/></Tabs>{leftTab==='layers'?<Box sx={{p:1}}><Typography variant="caption" color="text.secondary" sx={{display:'block',p:1.5}}>LAYERS {isCanvas(draft)?'· '+draft.nodes.length:''}</Typography>{!draft?<Typography variant="body2" color="text.secondary" sx={{p:1.5}}>No layers yet. Start a blank canvas or generate a first draft.</Typography>:isCanvas(draft)?<List disablePadding>{[...draft.nodes].reverse().map(node=><ListItemButton key={node.id} draggable onDragStart={event=>{draggedNodeId.current=node.id;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',node.id);}} onDragOver={event=>{event.preventDefault();setDragOverNodeId(node.id);}} onDragLeave={()=>setDragOverNodeId(current=>current===node.id?null:current)} onDrop={event=>{event.preventDefault();const source=draggedNodeId.current||event.dataTransfer.getData('text/plain');reorderCanvasNode(source,node.id);draggedNodeId.current=null;setDragOverNodeId(null);}} onDragEnd={()=>{draggedNodeId.current=null;setDragOverNodeId(null);}} selected={nodeId===node.id} onClick={()=>{setNodeId(node.id);setTool('select');setInspectorTab('design');}} sx={{borderRadius:1,py:.75,cursor:'grab',borderTop:dragOverNodeId===node.id?'2px solid #557c63':'2px solid transparent','&.Mui-selected':{bgcolor:'#e9f1eb',color:'#386650'},'&:active':{cursor:'grabbing'}}}><ListItemIcon sx={{minWidth:24,color:'text.disabled'}}><DragIndicatorOutlined sx={{fontSize:15}}/></ListItemIcon><ListItemIcon sx={{minWidth:24,color:'inherit'}}>{node.type==='text'?<TextFieldsOutlined sx={{fontSize:17}}/>:node.type==='ellipse'?<CircleOutlined sx={{fontSize:16}}/>:<RectangleOutlined sx={{fontSize:16}}/>}</ListItemIcon><ListItemText primary={node.name} slotProps={{primary:{sx:{fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}}}/><IconButton size="small" aria-label={'Toggle visibility '+node.name} onClick={event=>{event.stopPropagation();commitCanvas();setDraft({...draft,nodes:draft.nodes.map(item=>item.id===node.id?{...item,hidden:!item.hidden}:item)});}}>{node.hidden?<VisibilityOffOutlined sx={{fontSize:14}}/>:<VisibilityOutlined sx={{fontSize:14}}/>}</IconButton></ListItemButton>)}</List>:<List disablePadding>{layers.map(item=><ListItemButton key={item.id} selected={layer===item.id} onClick={()=>{setLayer(item.id);setInspectorTab('design');}} sx={{borderRadius:1,py:1,'&.Mui-selected':{bgcolor:'#e9f1eb',color:'#386650'}}}><ListItemIcon sx={{minWidth:30,color:'inherit'}}><LayersOutlined sx={{fontSize:17}}/></ListItemIcon><ListItemText primary={item.title} slotProps={{primary:{sx:{fontSize:12}}}}/></ListItemButton>)}</List>}</Box>:<List sx={{p:1}}>{versions.map((item,index)=><ListItemButton key={item.id} selected={selected===item.id} disabled={busy||saving} onClick={()=>dirty?setPendingVersion(item):selectVersion(item)} sx={{borderRadius:1,mb:.5}}><ListItemIcon sx={{minWidth:28}}><HistoryOutlined sx={{fontSize:17}}/></ListItemIcon><ListItemText primary={'Version '+(versions.length-index)} secondary={item.model==='manual-edit'?'Manual design':item.feedback||'AI first draft'} slotProps={{primary:{sx:{fontSize:12,fontWeight:600}},secondary:{sx:{fontSize:11}}}}/></ListItemButton>)}{!versions.length&&<Typography variant="body2" color="text.secondary" sx={{p:2}}>No saved versions yet.</Typography>}</List>}</>:leftPanel==='agents'?<Box sx={{p:1.5}}><Typography variant="subtitle2" sx={{px:1,pb:1}}>Project guild</Typography><GuildLineup compact onSelect={role=>setChatAgent(role)}/></Box>:<Box sx={{p:1.5}}><Typography variant="subtitle2" sx={{px:1,pb:1}}>Tools</Typography><List disablePadding>{([{id:'select',label:'Select',key:'V',Icon:NearMeOutlined},{id:'hand',label:'Hand',key:'H',Icon:PanToolOutlined},{id:'frame',label:'Frame',key:'F',Icon:CropFreeOutlined},{id:'rectangle',label:'Rectangle',key:'R',Icon:RectangleOutlined},{id:'ellipse',label:'Ellipse',key:'O',Icon:CircleOutlined},{id:'text',label:'Text',key:'T',Icon:TextFieldsOutlined},{id:'line',label:'Line',key:'L',Icon:HorizontalRuleOutlined},{id:'path',label:'Pencil',key:'P',Icon:DrawOutlined}] as const).map(item=><ListItemButton key={item.id} selected={tool===item.id} disabled={busy||saving} onClick={()=>{if(!draft)setDraft(blankCanvas());setTool(item.id);}} sx={{borderRadius:1,py:.65}}><ListItemIcon sx={{minWidth:30}}><item.Icon fontSize="small"/></ListItemIcon><ListItemText primary={item.label} secondary={item.key} slotProps={{primary:{sx:{fontSize:12}},secondary:{sx:{fontSize:10}}}}/></ListItemButton>)}</List></Box>}
   </Box>
   <Box component="section" className="design-canvas" aria-label="Design canvas" sx={{position:'relative'}}>
    <Stack direction="row" sx={{justifyContent:'space-between',alignItems:'center',minHeight:44,px:2,bgcolor:'background.paper',borderBottom:'1px solid',borderColor:'divider'}}>
     <Typography variant="caption" color="text.secondary">{isCanvas(draft)?'Canvas':mobile?'Mobile artboard':'Desktop artboard'}</Typography><Stack direction="row" sx={{alignItems:'center'}}><IconButton size="small" aria-label="Zoom out" onClick={()=>setZoom(value=>Math.max(10,value-10))}><ZoomOutOutlined fontSize="small"/></IconButton><Typography variant="caption" sx={{minWidth:40,textAlign:'center'}}>{Math.round(zoom)}%</Typography><IconButton size="small" aria-label="Zoom in" onClick={()=>setZoom(value=>Math.min(300,value+10))}><ZoomInOutlined fontSize="small"/></IconButton><Tooltip title="Fit canvas"><IconButton size="small" aria-label="Fit canvas" onClick={fit}><FitScreenOutlined fontSize="small"/></IconButton></Tooltip></Stack>
     {!isCanvas(draft)&&<ToggleButtonGroup exclusive size="small" value={mobile?'mobile':'desktop'} onChange={(_,value)=>value&&setMobile(value==='mobile')}><ToggleButton value="desktop" aria-label="Desktop preview" sx={{p:.5}}><DesktopWindowsOutlined sx={{fontSize:16}}/></ToggleButton><ToggleButton value="mobile" aria-label="Mobile preview" sx={{p:.5}}><SmartphoneOutlined sx={{fontSize:16}}/></ToggleButton></ToggleButtonGroup>}
    </Stack>
    <Box ref={canvasRef} className="canvas-scroll" sx={{cursor:panMode?'grab':'default',touchAction:'none'}} onPointerDownCapture={event=>{pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.current.size===2){const [a,b]=[...pointers.current.values()];pinch.current={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom};}}} onPointerMoveCapture={event=>{if(!pointers.current.has(event.pointerId))return;pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pinch.current&&pointers.current.size===2){const[a,b]=[...pointers.current.values()];setZoom(Math.max(10,Math.min(300,pinch.current.zoom*Math.hypot(a.x-b.x,a.y-b.y)/pinch.current.distance)));event.stopPropagation();}}} onPointerUpCapture={event=>{pointers.current.delete(event.pointerId);pinch.current=null;}} onPointerCancelCapture={()=>{pointers.current.clear();pinch.current=null;}} onPointerDown={event=>{if(!panMode)return;const el=event.currentTarget;drag.current={x:event.clientX,y:event.clientY,left:el.scrollLeft,top:el.scrollTop};el.setPointerCapture(event.pointerId);}} onPointerMove={event=>{if(!drag.current)return;event.currentTarget.scrollLeft=drag.current.left-(event.clientX-drag.current.x);event.currentTarget.scrollTop=drag.current.top-(event.clientY-drag.current.y);}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
     <Box className="canvas-content"><Box sx={{width:artboardWidth*zoom/100,height:artboardHeight*zoom/100,position:'relative',flex:'none'}}>{!(isCanvas(draft)&&draft.nodes.length===0&&draft.background==='#ffffff')&&<span className="design-frame-label">{project.name} — {artboardWidth} × {artboardHeight}</span>}<Box className="design-artboard" sx={{width:artboardWidth,height:artboardHeight,transform:`scale(${zoom/100})`,...(isCanvas(draft)&&draft.nodes.length===0&&draft.background==='#ffffff'?{background:'transparent',boxShadow:'none'}:{})}}>
     {draft?(isCanvas(draft)?<CanvasSurface document={draft} tool={tool} selected={nodeId} onSelect={setNodeId} onChange={setDraft} onCommit={commitCanvas} disabled={busy||saving}/>:<iframe title="Generated landing page" srcDoc={previewHtml} sandbox="" referrerPolicy="no-referrer" style={{height:artboardHeight,pointerEvents:'none'}}/>):null}
     </Box></Box></Box>
    </Box>
    <Paper className="editor-tool-dock" elevation={8} role="toolbar" aria-label="Design tools" sx={{position:'absolute',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:5,p:.75,borderRadius:1.5,bgcolor:'#24282e',border:'1px solid #3a424a',boxShadow:'0 10px 34px #121b2755',display:'flex',alignItems:'center',gap:.35,maxWidth:'calc(100% - 24px)',overflowX:'auto'}}>
     {([{id:'select',label:'Select · V',Icon:NearMeOutlined},{id:'hand',label:'Hand · H',Icon:PanToolOutlined},{id:'frame',label:'Frame · F',Icon:CropFreeOutlined},{id:'rectangle',label:'Rectangle · R',Icon:RectangleOutlined},{id:'ellipse',label:'Ellipse · O',Icon:CircleOutlined},{id:'text',label:'Text · T',Icon:TextFieldsOutlined},{id:'line',label:'Line · L',Icon:HorizontalRuleOutlined},{id:'path',label:'Pencil · P',Icon:DrawOutlined}] as const).map((item,index)=><Box key={item.id} sx={{display:'flex',alignItems:'center'}}>{[2,3,5,6].includes(index)&&<Divider orientation="vertical" flexItem sx={{mx:.45,borderColor:'#515960'}}/>}<Tooltip title={item.label}><span><IconButton aria-label={item.label.split(' ·')[0]+' tool'} aria-pressed={tool===item.id} disabled={busy||saving||(!!draft&&!isCanvas(draft)&&!['select','hand'].includes(item.id))} onClick={()=>{if(!draft)setDraft(blankCanvas());setTool(item.id);}} sx={{width:40,height:40,borderRadius:'8px',bgcolor:tool===item.id?'#4e7cae':'transparent',color:tool===item.id?'#fff':'#d9dfe4','&:hover':{bgcolor:tool===item.id?'#4e7cae':'#3b4249'},'&.Mui-disabled':{color:'#777f86'}}}><item.Icon sx={{fontSize:21}}/></IconButton></span></Tooltip></Box>)}<Divider orientation="vertical" flexItem sx={{mx:.5,borderColor:'#515960'}}/><Tooltip title="Guild discussion"><IconButton aria-label="Open guild discussion" onClick={()=>{setRightOpen(true);setInspectorTab('guild');}} sx={{width:40,height:40,borderRadius:'8px',color:inspectorTab==='guild'?'#fff':'#d9dfe4',bgcolor:inspectorTab==='guild'?'#4e7cae':'transparent','&:hover':{bgcolor:'#3b4249'}}}><ForumOutlined sx={{fontSize:21}}/></IconButton></Tooltip><Tooltip title="Run the guild"><IconButton aria-label="Open AI panel" onClick={()=>{setRightOpen(true);setInspectorTab('ai');}} sx={{width:40,height:40,borderRadius:'8px',color:inspectorTab==='ai'?'#fff':'#d9dfe4',bgcolor:inspectorTab==='ai'?'#4e7cae':'transparent','&:hover':{bgcolor:'#3b4249'}}}><AutoAwesomeOutlined sx={{fontSize:21}}/></IconButton></Tooltip>
    </Paper>
   </Box>
   <Box component="aside" className="design-side-panel inspector-panel" aria-label="Design properties" sx={{display:rightOpen?'block':'none',bgcolor:'background.paper',borderLeft:'1px solid',borderColor:'divider'}}>
    <Tabs value={inspectorTab} onChange={(_,value)=>setInspectorTab(value)} variant="scrollable" scrollButtons="auto"><Tab label="Design" value="design"/><Tab label="Guild" value="guild"/><Tab label="AI" value="ai"/><Tab label="Brief" value="brief"/></Tabs>
    {inspectorTab==='guild'?<GuildPanel projectId={project.id} versionId={active?.id||null} currentAnchor={isCanvas(draft)?'page':layer} addedNotes={newGuildNotes}/>:null}
    {inspectorTab==='design'?<Box sx={{p:2.5}}>
     {!draft?<Stack spacing={2}><Typography variant="h6">A blank beginning</Typography><Typography variant="body2" color="text.secondary">Create your own design with text and shapes, or generate a draft from your brief.</Typography><Button variant="outlined" onClick={startBlank}>Start manually</Button></Stack>:isCanvas(draft)?selectedNode?<Stack spacing={2.5}>
      <TextField label="Layer name" value={selectedNode.name} onChange={event=>patchNode({name:event.target.value})} slotProps={{htmlInput:{maxLength:100}}}/>
      <Box sx={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:1.5}}>{(['x','y','width','height'] as const).map(key=><TextField key={key} label={{x:'X',y:'Y',width:'W',height:'H'}[key]} type="number" value={Math.round(selectedNode[key])} onChange={event=>patchNode({[key]:key==='width'||key==='height'?Math.max(1,Number(event.target.value)):Number(event.target.value)})}/>)}</Box>
      <TextField label="Fill" type="color" value={selectedNode.fill} onChange={event=>patchNode({fill:event.target.value})}/><Stack direction="row" spacing={1.5}><TextField label="Stroke" type="color" value={selectedNode.stroke} onChange={event=>patchNode({stroke:event.target.value})}/><TextField label="Stroke width" type="number" value={selectedNode.strokeWidth} onChange={event=>patchNode({strokeWidth:Math.max(0,Math.min(100,Number(event.target.value)))})}/></Stack>
      {selectedNode.type==='text'&&<><TextField label="Text content" multiline minRows={3} value={selectedNode.text} onChange={event=>patchNode({text:event.target.value})} slotProps={{htmlInput:{maxLength:5000}}}/><TextField label="Font size" type="number" value={selectedNode.fontSize} onChange={event=>patchNode({fontSize:Math.max(1,Math.min(500,Number(event.target.value)))})}/><TextField label="Font weight" select value={selectedNode.fontWeight} onChange={event=>patchNode({fontWeight:Number(event.target.value)})}>{[300,400,500,600,700,800,900].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField></>}
      {(selectedNode.type==='rectangle'||selectedNode.type==='frame')&&<TextField label="Corner radius" type="number" value={selectedNode.radius} onChange={event=>patchNode({radius:Math.max(0,Math.min(1000,Number(event.target.value)))})}/>}
      <Box><Typography variant="caption">Opacity · {Math.round(selectedNode.opacity*100)}%</Typography><Slider size="small" value={selectedNode.opacity*100} aria-label="Layer opacity" onChange={(_,value)=>patchNode({opacity:Number(value)/100})}/></Box>
      <Stack direction="row" spacing={1}><Tooltip title="Duplicate layer"><IconButton aria-label="Duplicate layer" onClick={duplicateNode}><ContentCopyOutlined fontSize="small"/></IconButton></Tooltip><Tooltip title="Delete layer"><IconButton aria-label="Delete layer" onClick={removeNode}><DeleteOutline fontSize="small"/></IconButton></Tooltip>{([-1,1] as const).map(direction=><Tooltip key={direction} title={direction===1?'Bring forward':'Send backward'}><IconButton aria-label={direction===1?'Bring forward':'Send backward'} onClick={()=>{const index=draft.nodes.findIndex(node=>node.id===nodeId),next=index+direction;if(next<0||next>=draft.nodes.length)return;commitCanvas();const nodes=[...draft.nodes];[nodes[index],nodes[next]]=[nodes[next],nodes[index]];setDraft({...draft,nodes});}}>{direction===1?<ArrowUpward fontSize="small"/>:<ArrowDownward fontSize="small"/>}</IconButton></Tooltip>)}</Stack>
     </Stack>:<Stack spacing={2.5}><Typography variant="h6">Page</Typography><TextField label="Canvas background" type="color" value={draft.background} onChange={event=>{commitCanvas();setDraft({...draft,background:event.target.value});}}/><TextField label="Canvas width" type="number" value={draft.width} onChange={event=>{commitCanvas();setDraft({...draft,width:Math.max(100,Math.min(10000,Number(event.target.value)))});}}/><TextField label="Canvas height" type="number" value={draft.height} onChange={event=>{commitCanvas();setDraft({...draft,height:Math.max(100,Math.min(10000,Number(event.target.value)))});}}/><Typography variant="body2" color="text.secondary">Pick a tool from the dock and draw on the page. Select a layer to edit its properties.</Typography></Stack>:<><TextField select label="Selected section" value={layer} onChange={event=>setLayer(event.target.value as Layer)} sx={{mb:3}}>{layers.map(item=><MenuItem key={item.id} value={item.id}>{item.title}</MenuItem>)}</TextField><Stack spacing={2.5}>
      {layer==='page'&&<>{updateText('brand','Brand name')}<TextField select label="Typography" value={draft.style} onChange={event=>update('style',event.target.value)}>{['editorial','bold','minimal'].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField><TextField select label="Color palette" value={draft.palette} onChange={event=>update('palette',event.target.value)}>{['ocean','moss','clay','midnight'].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField></>}
      {layer==='header'&&updateText('brand','Brand name')}{layer==='hero'&&<>{updateText('eyebrow','Eyebrow')}{updateText('headline','Headline',true)}{updateText('description','Description',true)}{updateText('cta','Button label')}</>}{layer==='features'&&draft.features.map((feature,index)=><Accordion key={index} defaultExpanded={index===0} disableGutters><AccordionSummary expandIcon={<ExpandMoreOutlined/>}><Typography variant="body2">Benefit {index+1}</Typography></AccordionSummary><AccordionDetails><Stack spacing={2}><TextField label={'Benefit '+(index+1)+' title'} value={feature.title} onChange={event=>updateFeature(index,'title',event.target.value)}/><TextField label={'Benefit '+(index+1)+' description'} value={feature.description} multiline minRows={3} onChange={event=>updateFeature(index,'description',event.target.value)}/></Stack></AccordionDetails></Accordion>)}{layer==='closing'&&<>{updateText('closingTitle','Closing heading',true)}{updateText('closingDescription','Closing description',true)}{updateText('cta','Button label')}</>}{layer==='footer'&&updateText('brand','Brand name')}<Divider/><Typography variant="caption" color="text.secondary">Save changes to create a new version without using model tokens.</Typography>
     </Stack></>}
    </Box>:inspectorTab==='ai'?<Stack spacing={2.5} sx={{p:2.5}}><Typography variant="h6">Run the guild</Typography><Typography variant="body2" color="text.secondary">{active?'Describe the next revision. Manual edits are saved first.':'Turn your project brief into a first draft.'}</Typography><Typography variant="caption" color="text.secondary">Or talk through a decision with one specialist</Typography><GuildLineup compact onSelect={role=>setChatAgent(role)}/><TextField select label="Model connection" value={provider} onChange={event=>setProvider(event.target.value)}><MenuItem value="api">OpenAI API key{connections.api?' · connected':''}</MenuItem><MenuItem value="chatgpt">ChatGPT plan{connections.chatgpt?' · connected':''}</MenuItem></TextField>{provider==='chatgpt'&&<Alert severity="info">ChatGPT currently creates one draft. Connect an OpenAI API key to run the five specialist guild workflow.</Alert>}{active&&<TextField label="AI revision direction" value={feedback} onChange={event=>setFeedback(event.target.value)} multiline minRows={5} placeholder="Describe what to change…" slotProps={{htmlInput:{maxLength:4000}}}/>}<Button variant="contained" startIcon={<AutoAwesomeOutlined/>} disabled={busy||saving||(!!active&&!feedback.trim())} onClick={()=>void generate()}>{busy?'Generating…':provider==='api'?(active?'Run guild revision':'Run the guild'):(active?'Generate revision':'Generate first draft')}</Button>{busy&&<Alert severity="info" role="status">{provider==='api'?'Creative Director → UX Architect and Copywriter → UI Designer → QA Critic':'Working on your design…'}</Alert>}<Typography variant="caption" color="text.secondary">{provider==='chatgpt'?'Uses your connected ChatGPT plan.':'Five specialist model calls use your OpenAI API key.'} <Link href="/studio/settings">Manage connection</Link></Typography></Stack>:inspectorTab==='brief'?<Stack spacing={2} sx={{p:2.5}}><Typography variant="h6">Original brief</Typography><Typography variant="body2" color="text.secondary" sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.8}}>{project.brief}</Typography><Divider/><Typography variant="caption" color="text.secondary">Button destination</Typography><Typography variant="body2" sx={{overflowWrap:'anywhere'}}>{project.cta_url}</Typography></Stack>:null}
    {error&&<Alert severity="error" sx={{m:2}}>{error}</Alert>}
   </Box>
  </Box>
  <Dialog open={!!pendingVersion||!!discardAction} onClose={()=>{setPendingVersion(null);setDiscardAction(null);}} maxWidth="xs" fullWidth><DialogTitle>Discard unsaved changes?</DialogTitle><DialogContent><Typography variant="body2">Save your work first, or discard these local changes.</Typography></DialogContent><DialogActions><Button onClick={()=>{setPendingVersion(null);setDiscardAction(null);}}>Keep editing</Button><Button color="error" onClick={()=>{if(pendingVersion)selectVersion(pendingVersion);discardAction?.();setPendingVersion(null);setDiscardAction(null);}}>Discard changes</Button></DialogActions></Dialog>
 </Box><AgentConversation projectId={project.id} role={chatAgent || 'creative_director'} open={!!chatAgent} onClose={()=>setChatAgent(null)} onSelectRole={setChatAgent} onApplyDirection={direction=>{setFeedback(direction.slice(0,4000));setInspectorTab('ai');setRightOpen(true);}}/></ThemeProvider>;
}
