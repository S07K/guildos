'use client';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Snackbar, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { ArrowLeft as ArrowBackOutlined } from 'lucide-react';
import { Undo2 as UndoOutlined } from 'lucide-react';
import { Redo2 as RedoOutlined } from 'lucide-react';
import { Save as SaveOutlined } from 'lucide-react';
import { Monitor as DesktopWindowsOutlined } from 'lucide-react';
import { Smartphone as SmartphoneOutlined } from 'lucide-react';
import { Hand as PanToolOutlined } from 'lucide-react';
import { Layers as LayersOutlined } from 'lucide-react';
import { FileText as ArticleOutlined } from 'lucide-react';
import { History as HistoryOutlined } from 'lucide-react';
import { ChevronDown as ExpandMoreOutlined } from 'lucide-react';
import { renderDesign } from '@/lib/studio/design.mjs';
import { blankCanvas, CANVAS_WORKSPACE_SIZE, containingFrame, isCanvas, renderCanvas, type CanvasDocument, type CanvasNode } from '@/lib/studio/canvas';
import { CanvasSurface, type CanvasTool } from './canvas-surface';
import { AccountMenu } from './account-menu';
import { createTheme, ThemeProvider, useTheme } from '@mui/material/styles';
import { Paper, Slider } from '@mui/material';
import { PanelLeft as ViewSidebarOutlined } from 'lucide-react';
import { Folder as FolderOutlined } from 'lucide-react';
import { X as CloseOutlined } from 'lucide-react';
import { ChevronDown as ProjectMenuIcon } from 'lucide-react';
import { GripVertical as DragIndicatorOutlined } from 'lucide-react';
import { MousePointer2 as NearMeOutlined } from 'lucide-react';
import { Scan as CropFreeOutlined } from 'lucide-react';
import { Square as RectangleOutlined } from 'lucide-react';
import { Circle as CircleOutlined } from 'lucide-react';
import { Type as TextFieldsOutlined } from 'lucide-react';
import { Minus as HorizontalRuleOutlined } from 'lucide-react';
import { Pencil as DrawOutlined } from 'lucide-react';
import { Eye as VisibilityOutlined } from 'lucide-react';
import { EyeOff as VisibilityOffOutlined } from 'lucide-react';
import { MessageSquare as ForumOutlined } from 'lucide-react';
import { GuildPanel, type GuildNote } from './guild-panel';
import { GuildOSMark } from './brand';
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
    sectionOrder?: ('hero'|'features'|'closing')[];
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
    const [projectName, setProjectName] = useState(project.name);
    const [editingProjectName, setEditingProjectName] = useState(false);
    const [projectNameDraft, setProjectNameDraft] = useState(project.name);
    const [editingNodeName, setEditingNodeName] = useState<string | null>(null);
    const [nodeNameDraft, setNodeNameDraft] = useState('');
    const cancelProjectRename = useRef(false);
    const savingProjectName = useRef(false);
    const cancelNodeRename = useRef(false);
    const [selected, setSelected] = useState(initialVersions[0]?.id || '');
    const active = versions.find(item => item.id === selected);
    const [draft, setDraft] = useState<Design | CanvasDocument | null>(active?.document || null);
    const [layer, setLayer] = useState<Layer>('hero');
    const [feedback, setFeedback] = useState('');
    const [newGuildNotes, setNewGuildNotes] = useState<GuildNote[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [providerNotice, setProviderNotice] = useState('');
    const [mobile, setMobile] = useState(false);
    const [zoom, setZoom] = useState(65);
    const zoomRef = useRef(65);
    const committedZoomRef = useRef(65);
    const zoomAnchorRef = useRef<{fromZoom:number;scrollLeft:number;scrollTop:number;anchorX:number;anchorY:number;paddingLeft:number;paddingTop:number}|null>(null);
        const [leftPanel, setLeftPanel] = useState<'file'|'guild'|'brief'>('file');
    const [rightMode, setRightMode] = useState<'properties'|'history'|null>(null);
    const [projectMenuAnchor, setProjectMenuAnchor] = useState<HTMLElement | null>(null);
    const [tool, setTool] = useState<CanvasTool>('select');
    const [framePreset, setFramePreset] = useState('custom');
    const framePresets = [{id:'custom',label:'Custom',width:0,height:0},{id:'phone',label:'Phone · 393 × 852',width:393,height:852},{id:'phone-large',label:'Phone large · 440 × 956',width:440,height:956},{id:'tablet',label:'Tablet · 820 × 1180',width:820,height:1180},{id:'tablet-large',label:'Tablet large · 1024 × 1366',width:1024,height:1366},{id:'laptop',label:'Laptop · 1280 × 832',width:1280,height:832},{id:'desktop',label:'Desktop · 1440 × 1024',width:1440,height:1024}];
    const selectedFramePreset = framePresets.find(item=>item.id===framePreset);
    const framePresetSize = selectedFramePreset&&selectedFramePreset.width?{width:selectedFramePreset.width,height:selectedFramePreset.height}:null;
    const panMode = tool === 'hand';
    const [nodeId, setNodeId] = useState('');
    const [leftOpen, setLeftOpen] = useState(true);
    const draggedNodeId = useRef<string | null>(null);
    const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
    const setLayerDragPreview = (event: React.DragEvent<HTMLElement>, label: string) => {
        const preview = document.createElement('div');
        preview.textContent = label;
        Object.assign(preview.style, { position: 'fixed', top: '-1000px', left: '-1000px', padding: '8px 12px', border: '1px solid #dce4df', borderRadius: '8px', background: '#fff', color: '#263238', boxShadow: '0 8px 20px #26323826', font: '500 12px sans-serif', whiteSpace: 'nowrap', pointerEvents: 'none' });
        document.body.appendChild(preview);
        event.dataTransfer.setDragImage(preview, 16, 16);
        window.setTimeout(() => preview.remove(), 0);
    };
    const [provider, setProvider] = useState(connections.chatgpt && !connections.api ? 'chatgpt' : 'api');
    const [guildMention, setGuildMention] = useState<AgentRole | null>(null);
    const [discardAction,setDiscardAction] = useState<(() => void) | null>(null);
    const editorTheme = useTheme();
    const tooltipTheme = useMemo(() => createTheme(editorTheme, {
        components: {
            MuiTooltip: {
                defaultProps: { arrow: true },
                styleOverrides: {
                    tooltip: { backgroundColor: '#202124', color: '#f5f5f5', fontSize: '.75rem', fontWeight: 500, lineHeight: 1.2, borderRadius: 6, padding: '6px 8px', boxShadow: '0 4px 12px rgba(0,0,0,.22)' },
                    arrow: { color: '#202124' },
                },
            },
        },
    }), [editorTheme]);
    const pointers = useRef(new Map<number,{x:number;y:number}>());
    const pinch = useRef<{distance:number;zoom:number}|null>(null);
    const [pendingVersion, setPendingVersion] = useState<Version | null>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const canvasCentered = useRef(false);
    const recordZoomAnchor = (anchorX:number,anchorY:number) => {const element=canvasRef.current;if(!element)return;const content=element.firstElementChild as HTMLElement|null;const style=content?getComputedStyle(content):null;const existing=zoomAnchorRef.current;if(existing){existing.anchorX=anchorX;existing.anchorY=anchorY;return;}zoomAnchorRef.current={fromZoom:committedZoomRef.current,scrollLeft:element.scrollLeft,scrollTop:element.scrollTop,anchorX,anchorY,paddingLeft:style?parseFloat(style.paddingLeft)||0:0,paddingTop:style?parseFloat(style.paddingTop)||0:0};};
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
        return isCanvas(draft) ? renderCanvas(draft,projectName) : renderDesign(draft, project.cta_url);
    }
    catch {
        return active ? (isCanvas(active.document)?renderCanvas(active.document,projectName):renderDesign(active.document, project.cta_url)) : '';
    } }, [draft, active, project.cta_url, projectName]);
    const previewHtml = useMemo(() => { const selector = { page: '', header: 'header', hero: '.hero', features: '.features', closing: '.closing', footer: 'footer' }[layer]; return selector && rightMode === 'properties' ? html.replace('</style>', selector + '{outline:2px solid #6f9b7e;outline-offset:-2px}</style>') : html; }, [html, layer, rightMode === 'properties']);
    const dirty = !!draft && (!active || JSON.stringify(draft) !== JSON.stringify(active.document));
    const update = (key: keyof Omit<Design,'sectionOrder'>, value: string) => {
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
        if (active && !feedback.trim()) return;
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
            if (data.switchedFrom) setProviderNotice(`Usage limit reached. GuildOS continued with ${data.provider === 'chatgpt' ? 'your ChatGPT plan' : 'your OpenAI API key'}.`);
            else if (data.notes?.length) { setLeftOpen(true); setLeftPanel('guild'); }
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
    const updateText = (key: keyof Omit<Design,'sectionOrder'>, label: string, multiline = false) => draft && !isCanvas(draft) ? <TextField key={key} label={label} value={String(draft[key])} onChange={event => update(key, event.target.value)} multiline={multiline} minRows={multiline ? 3 : undefined} disabled={busy || saving} slotProps={{ htmlInput: { maxLength: 2000 } }}/> : null;
    const artboardWidth = isCanvas(draft) ? draft.width : mobile ? 390 : 1100;
    const artboardHeight = isCanvas(draft) ? draft.height : 1800;
    const workspaceWidth = isCanvas(draft) ? CANVAS_WORKSPACE_SIZE : artboardWidth;
    const workspaceHeight = isCanvas(draft) ? CANVAS_WORKSPACE_SIZE : artboardHeight;
    const commitCanvas = () => {if(draft){setPast(items=>[...items.slice(-49),structuredClone(draft)]);setFuture([]);}};
    const selectedNode = isCanvas(draft) ? draft.nodes.find(node=>node.id===nodeId) : undefined;
    const copiedNode = useRef<CanvasNode | null>(null);
    const pasteCount = useRef(0);
    const renameProject = async () => {
        if(savingProjectName.current)return;
        const name=projectNameDraft.trim().slice(0,100);
        setEditingProjectName(false);
        if(!name||name===projectName){setProjectNameDraft(projectName);return;}
        savingProjectName.current=true;
        try {
            const response=await fetch('/api/studio/projects',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:project.id,name})});
            const data=await response.json();
            if(!response.ok)throw new Error(data.error||'Project name could not be saved.');
            setProjectName(data.project.name);
            setProjectNameDraft(data.project.name);
        } catch(cause) {
            setProjectNameDraft(projectName);
            setError(cause instanceof Error?cause.message:'Project name could not be saved.');
        } finally {
            savingProjectName.current=false;
        }
    };
    const renameNode = (id:string,name:string) => {const clean=name.trim().slice(0,100);setEditingNodeName(null);if(clean&&isCanvas(draft)&&draft.nodes.find(node=>node.id===id)?.name!==clean){commitCanvas();setDraft({...draft,nodes:draft.nodes.map(node=>node.id===id?{...node,name:clean}:node)});} };
    const patchNode = (patch:Partial<CanvasNode>) => {if(!isCanvas(draft)||!selectedNode)return;commitCanvas();setDraft({...draft,nodes:draft.nodes.map(node=>node.id===nodeId?{...node,...patch}:node)});};
    const removeNode = () => {if(!isCanvas(draft)||!nodeId)return;commitCanvas();setDraft({...draft,nodes:draft.nodes.filter(node=>node.id!==nodeId)});setNodeId('');};
    const copyNode = () => {if(!isCanvas(draft)||!selectedNode)return;copiedNode.current=structuredClone(selectedNode);pasteCount.current=0;};
    const pasteNode = () => {if(!isCanvas(draft)||!copiedNode.current)return;commitCanvas();const source=copiedNode.current,offset=24*(++pasteCount.current);const node={...structuredClone(source),id:crypto.randomUUID(),name:source.name+' copy',x:source.x+offset,y:source.y+offset};setDraft({...draft,nodes:[...draft.nodes,node]});setNodeId(node.id);setTool('select');setRightMode('properties');};
    const reorderCanvasNode = (sourceId:string,targetId:string) => {
        if(!isCanvas(draft)||sourceId===targetId)return;
        const ordered=[...draft.nodes].reverse();
        const from=ordered.findIndex(node=>node.id===sourceId),to=ordered.findIndex(node=>node.id===targetId);
        if(from<0||to<0)return;
        const [moved]=ordered.splice(from,1);ordered.splice(to,0,moved);
        commitCanvas();setDraft({...draft,nodes:ordered.reverse()});setFuture([]);
    };
    const designSectionOrder = !draft || isCanvas(draft) ? ['hero','features','closing'] as const : draft.sectionOrder || ['hero','features','closing'];
    const orderedDesignLayers = [...layers.filter(item=>item.id==='page'||item.id==='header'),...designSectionOrder.map(id=>layers.find(item=>item.id===id)!).filter(Boolean),...layers.filter(item=>item.id==='footer')];
    const orderedCanvasNodes = isCanvas(draft) ? [...draft.nodes].reverse() : [];
    const canvasChildren = new Map<string, CanvasNode[]>();
    const canvasChildIds = new Set<string>();
    for (const node of orderedCanvasNodes) {
        if (node.type === 'frame') continue;
        const parent = isCanvas(draft) ? containingFrame(node, draft.nodes) : undefined;
        if (parent) {
            canvasChildIds.add(node.id);
            canvasChildren.set(parent.id, [...(canvasChildren.get(parent.id) || []), node]);
        }
    }
    const topLevelCanvasNodes = orderedCanvasNodes.filter(node => !canvasChildIds.has(node.id));
    const renderCanvasLayerRow = (node: CanvasNode, nested = false) => <ListItemButton key={node.id} draggable onDragStart={event=>{draggedNodeId.current=node.id;setLayerDragPreview(event,node.name);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',node.id);}} onDragOver={event=>{event.preventDefault();setDragOverNodeId(node.id);}} onDragLeave={()=>setDragOverNodeId(current=>current===node.id?null:current)} onDrop={event=>{event.preventDefault();const source=draggedNodeId.current||event.dataTransfer.getData('text/plain');reorderCanvasNode(source,node.id);draggedNodeId.current=null;setDragOverNodeId(null);}} onDragEnd={()=>{draggedNodeId.current=null;setDragOverNodeId(null);}} selected={nodeId===node.id} onClick={()=>{setNodeId(node.id);setTool('select');setRightMode('properties');}} sx={{borderRadius:1,py:.75,pl:nested?3:1.5,cursor:'grab',borderTop:dragOverNodeId===node.id?'2px solid #557c63':'2px solid transparent','&.Mui-selected':{bgcolor:'#e9f1eb',color:'#386650'},'&:active':{cursor:'grabbing'}}}><ListItemIcon sx={{minWidth:24,color:'text.disabled'}}><DragIndicatorOutlined size={15}/></ListItemIcon><ListItemIcon sx={{minWidth:24,color:'inherit'}}>{node.type==='text'?<TextFieldsOutlined size={17}/>:node.type==='ellipse'?<CircleOutlined size={16}/>:node.type==='frame'?<CropFreeOutlined size={16}/>:<RectangleOutlined size={16}/>}</ListItemIcon>{editingNodeName===node.id?<TextField autoFocus variant="standard" size="small" value={nodeNameDraft} slotProps={{htmlInput:{'aria-label':'Layer name',maxLength:100}}} onClick={event=>event.stopPropagation()} onChange={event=>setNodeNameDraft(event.target.value)} onBlur={()=>{if(cancelNodeRename.current){cancelNodeRename.current=false;return;}renameNode(node.id,nodeNameDraft);}} onKeyDown={event=>{event.stopPropagation();if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}if(event.key==='Escape'){cancelNodeRename.current=true;setEditingNodeName(null);}}} sx={{flex:1,minWidth:0,'& .MuiInputBase-input':{fontSize:12,py:.25}}}/>:<ListItemText primary={<span onDoubleClick={event=>{event.stopPropagation();setNodeNameDraft(node.name);setEditingNodeName(node.id);}} title="Double-click to rename">{node.name}</span>} slotProps={{primary:{sx:{fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}}}/>}<IconButton size="small" aria-label={'Toggle visibility '+node.name} onClick={event=>{event.stopPropagation();if(!isCanvas(draft))return;commitCanvas();setDraft({...draft,nodes:draft.nodes.map(item=>item.id===node.id?{...item,hidden:!item.hidden}:item)});}}>{node.hidden?<VisibilityOffOutlined size={14}/>:<VisibilityOutlined size={14}/>}</IconButton></ListItemButton>;
    const reorderDesignSection = (sourceId:string,targetId:string) => {
        if(!draft||isCanvas(draft)||sourceId===targetId)return;
        const order=[...designSectionOrder],from=order.indexOf(sourceId as typeof order[number]),to=order.indexOf(targetId as typeof order[number]);
        if(from<0||to<0)return;
        const [moved]=order.splice(from,1);order.splice(to,0,moved);
        setPast(items=>[...items.slice(-29),structuredClone(draft)]);setFuture([]);setDraft({...draft,sectionOrder:order});
    };
    const startBlank = () => {const action=()=>{setDraft(blankCanvas());setSelected('');setNodeId('');setPast([]);setFuture([]);setTool('select');setRightMode('properties');setError('');};dirty?setDiscardAction(()=>action):action();};
    useEffect(()=>{
      const element=canvasRef.current;if(!element)return;
      let frame=0;
      const wheel=(event:WheelEvent)=>{event.preventDefault();const old=zoomRef.current,next=Math.max(10,Math.min(300,old*Math.exp(-event.deltaY*.005)));if(next===old)return;const bounds=element.getBoundingClientRect();recordZoomAnchor(event.clientX-bounds.left,event.clientY-bounds.top);zoomRef.current=next;if(!frame)frame=requestAnimationFrame(()=>{frame=0;setZoom(zoomRef.current);});};
      element.addEventListener('wheel',wheel,{passive:false});return()=>{element.removeEventListener('wheel',wheel);if(frame)cancelAnimationFrame(frame);};
    },[]);
    useLayoutEffect(()=>{const element=canvasRef.current;const anchor=zoomAnchorRef.current;if(element&&anchor&&zoom!==anchor.fromZoom){const ratio=zoom/anchor.fromZoom;element.scrollLeft=anchor.paddingLeft+(anchor.scrollLeft+anchor.anchorX-anchor.paddingLeft)*ratio-anchor.anchorX;element.scrollTop=anchor.paddingTop+(anchor.scrollTop+anchor.anchorY-anchor.paddingTop)*ratio-anchor.anchorY;zoomAnchorRef.current=null;}committedZoomRef.current=zoom;zoomRef.current=zoom;},[zoom]);
    useEffect(()=>{if(!isCanvas(draft)){canvasCentered.current=false;return;}if(canvasCentered.current)return;const frame=requestAnimationFrame(()=>{const element=canvasRef.current;if(!element)return;const origin=40000*zoom/100;element.scrollLeft=origin-element.clientWidth/2;element.scrollTop=origin-element.clientHeight/2;canvasCentered.current=true;});return()=>cancelAnimationFrame(frame);},[isCanvas(draft),zoom]);
    useEffect(() => {
        const shortcuts=(event:KeyboardEvent)=>{if((event.target as HTMLElement).isContentEditable||event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)return;if(event.key==='Delete'||event.key==='Backspace'){if(isCanvas(draft)&&nodeId){event.preventDefault();removeNode();}}if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='c'){if(isCanvas(draft)&&nodeId){event.preventDefault();copyNode();}}if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='v'){if(isCanvas(draft)&&copiedNode.current){event.preventDefault();pasteNode();}}if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='d'){if(isCanvas(draft)&&selectedNode){event.preventDefault();copyNode();pasteNode();}}if(!event.metaKey&&!event.ctrlKey){const key=event.key.toLowerCase();const tools:Record<string,CanvasTool>={v:'select',h:'hand',f:'frame',r:'rectangle',o:'ellipse',t:'text',l:'line',p:'path'};if(tools[key])setTool(tools[key]);}};
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
    const designProperties = <Box sx={{p:2.5}}>
     {!draft?<Stack spacing={2}><Typography variant="h6">A blank beginning</Typography><Typography variant="body2" color="text.secondary">Create your own design with text and shapes, or generate a draft from your brief.</Typography><Button variant="outlined" onClick={startBlank}>Start manually</Button></Stack>:isCanvas(draft)?selectedNode?<Stack spacing={2.5}>
      <TextField label="Layer name" value={selectedNode.name} onChange={event=>patchNode({name:event.target.value})} slotProps={{htmlInput:{maxLength:100}}}/>
      <Box sx={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:1.5}}>{(['x','y','width','height'] as const).map(key=><TextField key={key} label={{x:'X',y:'Y',width:'W',height:'H'}[key]} type="number" value={Math.round(selectedNode[key])} onChange={event=>patchNode({[key]:key==='width'||key==='height'?Math.max(1,Number(event.target.value)):Number(event.target.value)})}/>)}</Box>
      <TextField label="Fill" type="color" value={selectedNode.fill} onChange={event=>patchNode({fill:event.target.value})}/><Stack direction="row" spacing={1.5}><TextField label="Stroke" type="color" value={selectedNode.stroke} onChange={event=>patchNode({stroke:event.target.value})}/><TextField label="Stroke width" type="number" value={selectedNode.strokeWidth} onChange={event=>patchNode({strokeWidth:Math.max(0,Math.min(100,Number(event.target.value)))})}/></Stack>
      {selectedNode.type==='text'&&<><TextField label="Text content" multiline minRows={3} value={selectedNode.text} onChange={event=>patchNode({text:event.target.value})} slotProps={{htmlInput:{maxLength:5000}}}/><TextField label="Font size" type="number" value={selectedNode.fontSize} onChange={event=>patchNode({fontSize:Math.max(1,Math.min(500,Number(event.target.value)))})}/><TextField label="Font weight" select value={selectedNode.fontWeight} onChange={event=>patchNode({fontWeight:Number(event.target.value)})}>{[300,400,500,600,700,800,900].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField></>}
      {(selectedNode.type==='rectangle'||selectedNode.type==='frame')&&<TextField label="Corner radius" type="number" value={selectedNode.radius} onChange={event=>patchNode({radius:Math.max(0,Math.min(1000,Number(event.target.value)))})}/>}
      <Box><Typography variant="caption">Opacity · {Math.round(selectedNode.opacity*100)}%</Typography><Slider size="small" value={selectedNode.opacity*100} aria-label="Layer opacity" onChange={(_,value)=>patchNode({opacity:Number(value)/100})}/></Box>

     </Stack>:<Stack spacing={2.5}>{tool==='frame'&&<><Typography variant="h6">Frame</Typography><TextField select label="Device preset" value={framePreset} onChange={event=>setFramePreset(event.target.value)}>{framePresets.map(item=><MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}</TextField></>}<Typography variant="body2" color="text.secondary">Pick a tool and draw on the workspace. Select a layer to edit its properties.</Typography></Stack>:<><TextField select label="Selected section" value={layer} onChange={event=>setLayer(event.target.value as Layer)} sx={{mb:3}}>{layers.map(item=><MenuItem key={item.id} value={item.id}>{item.title}</MenuItem>)}</TextField><Stack spacing={2.5}>
      {layer==='page'&&<>{updateText('brand','Brand name')}<TextField select label="Typography" value={draft.style} onChange={event=>update('style',event.target.value)}>{['editorial','bold','minimal'].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField><TextField select label="Color palette" value={draft.palette} onChange={event=>update('palette',event.target.value)}>{['ocean','moss','clay','midnight'].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField></>}
      {layer==='header'&&updateText('brand','Brand name')}{layer==='hero'&&<>{updateText('eyebrow','Eyebrow')}{updateText('headline','Headline',true)}{updateText('description','Description',true)}{updateText('cta','Button label')}</>}{layer==='features'&&draft.features.map((feature,index)=><Accordion key={index} defaultExpanded={index===0} disableGutters><AccordionSummary expandIcon={<ExpandMoreOutlined/>}><Typography variant="body2">Benefit {index+1}</Typography></AccordionSummary><AccordionDetails><Stack spacing={2}><TextField label={'Benefit '+(index+1)+' title'} value={feature.title} onChange={event=>updateFeature(index,'title',event.target.value)}/><TextField label={'Benefit '+(index+1)+' description'} value={feature.description} multiline minRows={3} onChange={event=>updateFeature(index,'description',event.target.value)}/></Stack></AccordionDetails></Accordion>)}{layer==='closing'&&<>{updateText('closingTitle','Closing heading',true)}{updateText('closingDescription','Closing description',true)}{updateText('cta','Button label')}</>}{layer==='footer'&&updateText('brand','Brand name')}<Divider/><Typography variant="caption" color="text.secondary">Save changes to create a new version without using model tokens.</Typography>
     </Stack></>}
    </Box>;
    return <ThemeProvider theme={tooltipTheme}><Box className="design-workspace" sx={{bgcolor:'background.default',color:'text.primary'}}>
  <Stack component="header" direction="row" spacing={1.5} sx={{minHeight:58,px:2,bgcolor:'background.default',alignItems:'center',flexWrap:{xs:'wrap',sm:'nowrap'},py:{xs:1,sm:0}}}>
   <Link href="/studio" className="editor-logo" aria-label="Back to dashboard"><GuildOSMark/><span>guildos</span></Link><Divider orientation="vertical" flexItem sx={{my:1.5}}/><Stack direction="row" className="project-title-menu" sx={{alignItems:'center',gap:.5,minWidth:0,maxWidth:340,bgcolor:'#edf2ef',borderRadius:'10px',p:.5,pl:1}}>{editingProjectName?<TextField autoFocus size="small" value={projectNameDraft} slotProps={{htmlInput:{'aria-label':'Project name',maxLength:100}}} onChange={event=>setProjectNameDraft(event.target.value)} onBlur={()=>{if(cancelProjectRename.current){cancelProjectRename.current=false;return;}void renameProject();}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void renameProject();event.currentTarget.blur();}if(event.key==='Escape'){cancelProjectRename.current=true;setProjectNameDraft(projectName);setEditingProjectName(false);}}} sx={{minWidth:0,maxWidth:230,'& .MuiInputBase-input':{py:.45,px:.5,fontSize:'clamp(14px, 0.9vw, 17px)',fontWeight:650}}}/>:<><Typography component="h1" variant="body2" onDoubleClick={()=>{setProjectNameDraft(projectName);setEditingProjectName(true);}} sx={{fontWeight:650,fontSize:'clamp(14px, 0.9vw, 17px)',maxWidth:230,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:'text',px:.6,py:.5}} title="Double-click to rename">{projectName}</Typography><IconButton size="small" aria-label="Project actions" aria-haspopup="menu" aria-expanded={!!projectMenuAnchor} onClick={event=>setProjectMenuAnchor(event.currentTarget)} sx={{width:28,height:28,flex:'none',color:'#65746b'}}><ProjectMenuIcon size={15}/></IconButton></>}</Stack><Menu anchorEl={projectMenuAnchor} open={!!projectMenuAnchor} onClose={()=>setProjectMenuAnchor(null)} slotProps={{paper:{sx:{minWidth:230,mt:.5,'& .MuiMenuItem-root':{fontSize:14,lineHeight:1.4,minHeight:44,px:2},'& .MuiListItemText-primary':{fontSize:14,lineHeight:1.4},'& .MuiListItemIcon-root':{minWidth:34},'& svg':{width:17,height:17}}},list:{'aria-label':'Project actions'}}}>
    <MenuItem selected={rightMode==='history'} onClick={()=>{setRightMode(current=>current==='history'?null:'history');setProjectMenuAnchor(null);}}><ListItemIcon><HistoryOutlined size={17}/></ListItemIcon><ListItemText slotProps={{primary:{sx:{fontSize:14,lineHeight:1.4}}}}>{rightMode==='history'?'Hide':'Show'} version history</ListItemText></MenuItem>
    <Divider/>
    <MenuItem disabled={!past.length||busy||saving} onClick={()=>{setProjectMenuAnchor(null);undo();}}><ListItemIcon><UndoOutlined size={17}/></ListItemIcon><ListItemText slotProps={{primary:{sx:{fontSize:14,lineHeight:1.4}}}}>Undo</ListItemText></MenuItem>
    <MenuItem disabled={!future.length||busy||saving} onClick={()=>{setProjectMenuAnchor(null);redo();}}><ListItemIcon><RedoOutlined size={17}/></ListItemIcon><ListItemText slotProps={{primary:{sx:{fontSize:14,lineHeight:1.4}}}}>Redo</ListItemText></MenuItem>
    <MenuItem disabled={!dirty||saving||busy} onClick={()=>{setProjectMenuAnchor(null);void persistManual();}}><ListItemIcon><SaveOutlined size={17}/></ListItemIcon><ListItemText slotProps={{primary:{sx:{fontSize:14,lineHeight:1.4}}}}>Save changes</ListItemText></MenuItem>
   </Menu>
   <Box sx={{flex:1,minWidth:8}}/><Stack direction="row" spacing={.25} sx={{alignItems:'center',display:{xs:'none',md:'flex'}}}>{!isCanvas(draft)&&<ToggleButtonGroup exclusive size="small" value={mobile?'mobile':'desktop'} onChange={(_,value)=>value&&setMobile(value==='mobile')} aria-label="Preview size"><ToggleButton value="desktop" aria-label="Desktop preview" sx={{p:.4}}><DesktopWindowsOutlined size={15}/></ToggleButton><ToggleButton value="mobile" aria-label="Mobile preview" sx={{p:.4}}><SmartphoneOutlined size={15}/></ToggleButton></ToggleButtonGroup>}</Stack>
   {dirty&&<Chip role="status" size="small" label={saving?'Saving…':'Unsaved'} variant="outlined" color="warning"/>}
   <AccountMenu/>
  </Stack>
  <Box className="design-workspace-body" style={{gridTemplateColumns:`${leftOpen?'48px clamp(300px,25vw,360px)':'48px 0px'} minmax(0,1fr) ${rightMode?'clamp(230px,20vw,320px)':'0px'}`}}>
   <Box component="nav" className="editor-rail" aria-label="Editor navigation" sx={{display:'flex',bgcolor:'background.paper',borderRight:'1px solid',borderColor:'divider'}}>
    {[{id:'file',label:'Layers',Icon:FolderOutlined},{id:'guild',label:'Project conversation',Icon:ForumOutlined},{id:'brief',label:'Brief',Icon:ArticleOutlined}].map(item=><Tooltip key={item.id} title={item.label} placement="right"><IconButton aria-label={item.label} aria-pressed={leftOpen&&leftPanel===item.id} onClick={()=>{setLeftPanel(item.id as typeof leftPanel);setLeftOpen(true);}} sx={{width:36,height:36,borderRadius:'8px',color:leftOpen&&leftPanel===item.id?'#426a55':'text.secondary',bgcolor:leftOpen&&leftPanel===item.id?'#eaf1ec':'transparent','&:hover':{bgcolor:'#f1f5f2'}}}><item.Icon size={18}/></IconButton></Tooltip>)}
    <Box sx={{flex:1}}/>
   </Box>
   <Box component="aside" className="design-side-panel layers-panel" aria-label="Layers and versions" sx={{display:leftOpen?'block':'none',bgcolor:'background.paper',borderRight:'1px solid',borderColor:'divider',...(leftPanel==='guild'?{display:leftOpen?'flex':'none',flexDirection:'column',overflow:'hidden'}:{})}}>
    {leftPanel==='file'?<><Box sx={{px:2,py:1.25,borderBottom:'1px solid',borderColor:'divider',display:'flex',alignItems:'center',justifyContent:'space-between'}}><Typography variant="subtitle2">Layers</Typography><Tooltip title={leftOpen?'Collapse layers':'Expand layers'}><IconButton size="small" aria-label={leftOpen?'Collapse layers':'Expand layers'} onClick={()=>setLeftOpen(open=>!open)}><ViewSidebarOutlined size={17}/></IconButton></Tooltip></Box><Box sx={{p:1}}>{!draft?<Typography variant="body2" color="text.secondary" sx={{p:1.5}}>No layers yet. Start a blank canvas or generate a first draft.</Typography>:isCanvas(draft)?<List disablePadding>{topLevelCanvasNodes.map(node=>node.type==='frame'?<Box component="li" key={node.id} sx={{listStyle:'none',display:'flex',alignItems:'flex-start'}}><Accordion defaultExpanded disableGutters elevation={0} sx={{flex:1,minWidth:0,bgcolor:'transparent','&:before':{display:'none'},'&.Mui-expanded':{m:0}}}><AccordionSummary expandIcon={<ExpandMoreOutlined size={16}/>} draggable onDragStart={event=>{draggedNodeId.current=node.id;setLayerDragPreview(event,node.name);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',node.id);}} onDragOver={event=>{event.preventDefault();setDragOverNodeId(node.id);}} onDragLeave={()=>setDragOverNodeId(current=>current===node.id?null:current)} onDrop={event=>{event.preventDefault();const source=draggedNodeId.current||event.dataTransfer.getData('text/plain');reorderCanvasNode(source,node.id);draggedNodeId.current=null;setDragOverNodeId(null);}} onDragEnd={()=>{draggedNodeId.current=null;setDragOverNodeId(null);}} onClick={()=>{setNodeId(node.id);setTool('select');setRightMode('properties');}} sx={{minHeight:42,px:1.5,borderRadius:1,bgcolor:nodeId===node.id?'#e9f1eb':'transparent','&.Mui-expanded':{minHeight:42},'& .MuiAccordionSummary-content,& .MuiAccordionSummary-content.Mui-expanded':{my:.5},'& .MuiAccordionSummary-expandIconWrapper':{order:-1,mr:1}}}><ListItemIcon sx={{minWidth:24,color:'text.disabled'}}><DragIndicatorOutlined size={15}/></ListItemIcon><ListItemIcon sx={{minWidth:24,color:'inherit'}}><CropFreeOutlined size={16}/></ListItemIcon>{editingNodeName===node.id?<TextField autoFocus variant="standard" size="small" value={nodeNameDraft} slotProps={{htmlInput:{'aria-label':'Layer name',maxLength:100}}} onClick={event=>event.stopPropagation()} onChange={event=>setNodeNameDraft(event.target.value)} onBlur={()=>{if(cancelNodeRename.current){cancelNodeRename.current=false;return;}renameNode(node.id,nodeNameDraft);}} onKeyDown={event=>{event.stopPropagation();if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}if(event.key==='Escape'){cancelNodeRename.current=true;setEditingNodeName(null);}}} sx={{flex:1,minWidth:0,'& .MuiInputBase-input':{fontSize:12,py:.25}}}/>:<Typography onDoubleClick={event=>{event.stopPropagation();setNodeNameDraft(node.name);setEditingNodeName(node.id);}} title="Double-click to rename" sx={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:12}}>{node.name}</Typography>}</AccordionSummary><AccordionDetails sx={{p:0,pl:1}}><List disablePadding>{(canvasChildren.get(node.id)||[]).map(child=>renderCanvasLayerRow(child,true))}</List></AccordionDetails></Accordion><IconButton size="small" aria-label={'Toggle visibility '+node.name} onClick={event=>{event.stopPropagation();commitCanvas();setDraft({...draft,nodes:draft.nodes.map(item=>item.id===node.id?{...item,hidden:!item.hidden}:item)});}} sx={{mt:.6}}>{node.hidden?<VisibilityOffOutlined size={14}/>:<VisibilityOutlined size={14}/>}</IconButton></Box>:renderCanvasLayerRow(node))}</List>:<List disablePadding>{orderedDesignLayers.map(item=><ListItemButton key={item.id} draggable={['hero','features','closing'].includes(item.id)} onDragStart={event=>{if(!['hero','features','closing'].includes(item.id)){event.preventDefault();return;}draggedNodeId.current=item.id;setLayerDragPreview(event,item.title);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.id);}} onDragOver={event=>{if(['hero','features','closing'].includes(item.id)){event.preventDefault();setDragOverNodeId(item.id);}}} onDragLeave={()=>setDragOverNodeId(current=>current===item.id?null:current)} onDrop={event=>{event.preventDefault();const source=draggedNodeId.current||event.dataTransfer.getData('text/plain');reorderDesignSection(source,item.id);draggedNodeId.current=null;setDragOverNodeId(null);}} onDragEnd={()=>{draggedNodeId.current=null;setDragOverNodeId(null);}} selected={layer===item.id} onClick={()=>{setLayer(item.id);setRightMode('properties');}} sx={{borderRadius:1,py:1,cursor:['hero','features','closing'].includes(item.id)?'grab':'default',borderTop:dragOverNodeId===item.id?'2px solid #557c63':'2px solid transparent','&.Mui-selected':{bgcolor:'#e9f1eb',color:'#386650'}}}><ListItemIcon sx={{minWidth:30,color:'inherit'}}>{['hero','features','closing'].includes(item.id)?<DragIndicatorOutlined size={15}/>:<LayersOutlined size={17}/>}</ListItemIcon><ListItemText primary={item.title} slotProps={{primary:{sx:{fontSize:12}}}}/></ListItemButton>)}</List>}</Box></>:<>
    {leftPanel==='guild'?<GuildPanel projectId={project.id} versionId={active?.id||null} currentAnchor={isCanvas(draft)?'page':layer} selectedContext={selectedNode?{id:selectedNode.id,name:selectedNode.name}:null} layers={isCanvas(draft)?draft.nodes.filter(node=>!node.hidden).map(node=>({id:node.id,name:node.name})):layers.map(item=>({id:item.id,name:item.title}))} addedNotes={newGuildNotes} initialMention={guildMention} onInitialMentionUsed={()=>setGuildMention(null)}/>:null}
    {leftPanel==='brief'?<Stack spacing={2} sx={{p:2.5}}><Typography variant="h6">Original brief</Typography><Typography variant="body2" color="text.secondary" sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.8}}>{project.brief}</Typography><Divider/><Typography variant="caption" color="text.secondary">Button destination</Typography><Typography variant="body2" sx={{overflowWrap:'anywhere'}}>{project.cta_url}</Typography></Stack>:null}
    </>}
   </Box>
   <Box component="aside" className="design-properties-panel" aria-label={rightMode==='history'?'Version history':'Selected element properties'} sx={{display:rightMode?'block':'none',bgcolor:'background.paper',borderLeft:'1px solid',borderColor:'divider',minWidth:0,minHeight:0,overflowY:'auto'}}>{rightMode==='history'?<><Stack direction="row" sx={{px:2,py:1.5,alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid',borderColor:'divider'}}><Typography variant="subtitle2">Version history</Typography><IconButton size="small" aria-label="Close version history" onClick={()=>setRightMode(null)}><CloseOutlined size={17}/></IconButton></Stack><Typography variant="caption" color="text.secondary" sx={{display:'block',px:2,py:1.5}}>Select a version to restore it.</Typography><List sx={{px:1}}>{versions.map((item,index)=><ListItemButton key={item.id} selected={selected===item.id} disabled={busy||saving} onClick={()=>dirty?setPendingVersion(item):selectVersion(item)} sx={{borderRadius:1,mb:.5}}><ListItemIcon sx={{minWidth:28,color:selected===item.id?'primary.main':'text.secondary'}}><HistoryOutlined size={17}/></ListItemIcon><ListItemText primary={'Version '+(versions.length-index)} secondary={<>{new Date(item.created_at).toISOString().slice(0,16).replace('T',' ')} · {item.model==='manual-edit'?'Manual design':item.feedback||'Guild revision'}</>} slotProps={{primary:{sx:{fontSize:12,fontWeight:600}},secondary:{sx:{fontSize:11}}}}/></ListItemButton>)}{!versions.length&&<Typography variant="body2" color="text.secondary" sx={{p:2}}>No versions yet.</Typography>}</List></>:rightMode==='properties'?<><Stack direction="row" sx={{px:2.5,pt:2,alignItems:'center',justifyContent:'space-between'}}><Typography variant="subtitle2" color="text.secondary">Properties</Typography><Tooltip title="Close properties"><IconButton size="small" aria-label="Close properties" onClick={()=>setRightMode(null)}><CloseOutlined size={17}/></IconButton></Tooltip></Stack>{designProperties}</>:null}</Box>
   <Box component="section" className="design-canvas" aria-label="Design canvas" sx={{position:'relative'}}>
    <Box ref={canvasRef} className="canvas-scroll" sx={{cursor:panMode?'grab':'default',touchAction:'none'}} onPointerDownCapture={event=>{pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.current.size===2){const[a,b]=[...pointers.current.values()],bounds=event.currentTarget.getBoundingClientRect();pinch.current={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:zoomRef.current};recordZoomAnchor((a.x+b.x)/2-bounds.left,(a.y+b.y)/2-bounds.top);}}} onPointerMoveCapture={event=>{if(!pointers.current.has(event.pointerId))return;pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pinch.current&&pointers.current.size===2){const[a,b]=[...pointers.current.values()],bounds=event.currentTarget.getBoundingClientRect(),next=Math.max(10,Math.min(300,pinch.current.zoom*Math.hypot(a.x-b.x,a.y-b.y)/pinch.current.distance));recordZoomAnchor((a.x+b.x)/2-bounds.left,(a.y+b.y)/2-bounds.top);zoomRef.current=next;setZoom(next);event.stopPropagation();}}} onPointerUpCapture={event=>{pointers.current.delete(event.pointerId);pinch.current=null;}} onPointerCancelCapture={()=>{pointers.current.clear();pinch.current=null;}} onPointerDown={event=>{if(!panMode)return;const el=event.currentTarget;drag.current={x:event.clientX,y:event.clientY,left:el.scrollLeft,top:el.scrollTop};el.setPointerCapture(event.pointerId);}} onPointerMove={event=>{if(!drag.current)return;event.currentTarget.scrollLeft=drag.current.left-(event.clientX-drag.current.x);event.currentTarget.scrollTop=drag.current.top-(event.clientY-drag.current.y);}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
     <Box className="canvas-content"><Box sx={{width:workspaceWidth*zoom/100,height:workspaceHeight*zoom/100,position:'relative',flex:'none'}}><Box className="design-artboard" sx={{width:workspaceWidth,height:workspaceHeight,transform:`scale(${zoom/100})`,...(isCanvas(draft)?{background:'transparent',boxShadow:'none'}:{})}}>
     {draft?(isCanvas(draft)?<CanvasSurface document={draft} tool={tool} framePreset={framePresetSize} selected={nodeId} onSelect={id=>{setNodeId(id);setRightMode(id?'properties':null);}} onChange={setDraft} onCommit={commitCanvas} disabled={busy||saving}/>:<iframe title="Generated landing page" srcDoc={previewHtml} sandbox="" referrerPolicy="no-referrer" style={{height:artboardHeight,pointerEvents:'none'}}/>):null}
     </Box></Box></Box>
    </Box>
    <Paper className="editor-tool-dock" elevation={8} role="toolbar" aria-label="Design tools" sx={{position:'absolute',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:5,p:.75,borderRadius:1.5,bgcolor:'#24282e',border:'1px solid #3a424a',boxShadow:'0 10px 34px #121b2755',display:'flex',alignItems:'center',gap:.35,maxWidth:'calc(100% - 24px)',overflowX:'auto'}}>
     {([{id:'select',label:'Select · V',Icon:NearMeOutlined},{id:'hand',label:'Hand · H',Icon:PanToolOutlined},{id:'frame',label:'Frame · F',Icon:CropFreeOutlined},{id:'rectangle',label:'Rectangle · R',Icon:RectangleOutlined},{id:'ellipse',label:'Ellipse · O',Icon:CircleOutlined},{id:'text',label:'Text · T',Icon:TextFieldsOutlined},{id:'line',label:'Line · L',Icon:HorizontalRuleOutlined},{id:'path',label:'Pencil · P',Icon:DrawOutlined}] as const).map((item,index)=><Box key={item.id} sx={{display:'flex',alignItems:'center'}}>{[2,3,5,6].includes(index)&&<Divider orientation="vertical" flexItem sx={{mx:.45,borderColor:'#515960'}}/>}<Tooltip arrow placement="top" title={<Box sx={{display:'flex',alignItems:'center',gap:1.5}}><span>{item.label.split(' · ')[0]}</span><Box component="span" sx={{fontSize:'.6875rem',fontWeight:600,color:'#aeb4ba'}}>{item.label.split(' · ')[1]}</Box></Box>} slotProps={{tooltip:{sx:{bgcolor:'#202124',color:'#f5f5f5',fontSize:'.75rem',fontWeight:500,lineHeight:1,borderRadius:'6px',px:1.1,py:.75,boxShadow:'0 4px 12px rgba(0,0,0,.22)'}},arrow:{sx:{color:'#202124'}}}}><span><IconButton aria-label={item.label.split(' ·')[0]+' tool'} aria-pressed={tool===item.id} disabled={busy||saving||(!!draft&&!isCanvas(draft)&&!['select','hand'].includes(item.id))} onClick={()=>{if(!draft)setDraft(blankCanvas());if(item.id==='frame'){setNodeId('');setRightMode('properties');}setTool(item.id);}} sx={{width:40,height:40,borderRadius:'8px',bgcolor:tool===item.id?'#4e7cae':'transparent',color:tool===item.id?'#fff':'#d9dfe4','&:hover':{bgcolor:tool===item.id?'#4e7cae':'#3b4249'},'&.Mui-disabled':{color:'#777f86'}}}><item.Icon size={21}/></IconButton></span></Tooltip></Box>)}
    </Paper>
   </Box>
  </Box>
  <Snackbar open={!!error} autoHideDuration={6000} onClose={(_,reason)=>{if(reason!=='clickaway')setError('');}} anchorOrigin={{vertical:'bottom',horizontal:'center'}}><Alert severity="error" variant="filled" onClose={()=>setError('')} sx={{maxWidth:'min(560px, calc(100vw - 32px))'}}>{error}</Alert></Snackbar>
  <Snackbar open={!!providerNotice} autoHideDuration={6000} onClose={(_,reason)=>{if(reason!=='clickaway')setProviderNotice('');}} anchorOrigin={{vertical:'bottom',horizontal:'center'}}><Alert severity="success" variant="filled" onClose={()=>setProviderNotice('')} sx={{maxWidth:'min(560px, calc(100vw - 32px))'}}>{providerNotice}</Alert></Snackbar>
  <Dialog open={!!pendingVersion||!!discardAction} onClose={()=>{setPendingVersion(null);setDiscardAction(null);}} maxWidth="xs" fullWidth><DialogTitle>Discard unsaved changes?</DialogTitle><DialogContent><Typography variant="body2">Save your work first, or discard these local changes.</Typography></DialogContent><DialogActions><Button onClick={()=>{setPendingVersion(null);setDiscardAction(null);}}>Keep editing</Button><Button color="error" onClick={()=>{if(pendingVersion)selectVersion(pendingVersion);discardAction?.();setPendingVersion(null);setDiscardAction(null);}}>Discard changes</Button></DialogActions></Dialog>
 </Box></ThemeProvider>;
}
