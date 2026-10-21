'use client';
import { preferredProvider } from '@/lib/studio/provider-fallback';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardList, Trash2 } from 'lucide-react';
import { DeleteProjectDialog } from './delete-project-dialog';
import { snapToGrid } from '@/lib/studio/design-system';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Snackbar, Skeleton, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
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
import { blankCanvas, CANVAS_WORKSPACE_MARGIN, CANVAS_WORKSPACE_SIZE, canvasIconUrl, containingFrame, isCanvas, renderCanvas, type CanvasDocument, type CanvasNode } from '@/lib/studio/canvas';
import { AutoLayoutProperties } from './auto-layout-properties';
import { defaultLayout } from '@/lib/studio/canvas-layout';
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
import { ImagePlus as ImagePlusOutlined } from 'lucide-react';
import { Shapes as ShapesOutlined } from 'lucide-react';
import { AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignLeft, AlignCenter, AlignRight, TriangleAlert } from 'lucide-react';
import { MessageSquare as ForumOutlined } from 'lucide-react';
import { TaskBoard } from './task-board';
import { GuildPanel, type GuildNote } from './guild-panel';
import { GuildOSMark } from './brand';
import type { AgentRole } from '@/lib/studio/agent-roles';
import { canvasQualityIssues } from '@/lib/studio/canvas-quality';
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
    cta_url?: string | null;
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
export function ProjectEditor({ project, initialVersions, initialVersionId, connections = { api:false, chatgpt:false, openrouter:false, groq:false } }: {
    project: Project;
    initialVersions: Version[];
    initialVersionId?: string;
    connections?: {api:boolean;chatgpt:boolean;openrouter:boolean;groq:boolean};
}) {
    const router=useRouter();
    const [deleteProjectOpen,setDeleteProjectOpen]=useState(false);
    const [versions, setVersions] = useState(initialVersions);
    const headVersion = useRef<string | null>(initialVersions[0]?.id || null);
    const pendingSave = useRef<{ payload: string; requestId: string } | null>(null);
    const saveInFlight = useRef(false);
    const [saveConflict, setSaveConflict] = useState(false);
    const [remoteVersion, setRemoteVersion] = useState<Version | null>(null);
    const [projectName, setProjectName] = useState(project.name);
    const [editingProjectName, setEditingProjectName] = useState(false);
    const [projectNameDraft, setProjectNameDraft] = useState(project.name);
    const [editingNodeName, setEditingNodeName] = useState<string | null>(null);
    const [nodeNameDraft, setNodeNameDraft] = useState('');
    const cancelProjectRename = useRef(false);
    const savingProjectName = useRef(false);
    const cancelNodeRename = useRef(false);
    const [selected, setSelected] = useState(initialVersionId || initialVersions[0]?.id || '');
    const active = versions.find(item => item.id === selected);
    const [draft, setDraft] = useState<Design | CanvasDocument | null>(active?.document || null);
    const draftRef = useRef<Design | CanvasDocument | null>(draft);
    draftRef.current = draft;
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
        const [leftPanel, setLeftPanel] = useState<'file'|'guild'|'brief'|'tasks'>('file');
    const [rightMode, setRightMode] = useState<'properties'|'history'|null>(null);
    const [projectMenuAnchor, setProjectMenuAnchor] = useState<HTMLElement | null>(null);
    const [tool, setTool] = useState<CanvasTool>('select');
    const imageInput = useRef<HTMLInputElement>(null);
    const imageReplaceId = useRef<string|null>(null);
    const iconReplaceId = useRef<string|null>(null);
    const [iconPickerOpen,setIconPickerOpen] = useState(false);
    const [iconQuery,setIconQuery] = useState('');
    const [iconResults,setIconResults] = useState<string[]>([]);
    const [iconLoading,setIconLoading] = useState(false);
    const [uploadingImage,setUploadingImage] = useState(false);
    const [showLayoutIssues,setShowLayoutIssues] = useState(false);
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
    const [provider] = useState(preferredProvider(connections));
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
        return isCanvas(draft) ? renderCanvas(draft,projectName,project.id) : renderDesign(draft, project.cta_url);
    }
    catch {
        return active ? (isCanvas(active.document)?renderCanvas(active.document,projectName,project.id):renderDesign(active.document, project.cta_url)) : '';
    } }, [draft, active, project.cta_url, projectName]);
    const previewHtml = useMemo(() => { const selector = { page: '', header: 'header', hero: '.hero', features: '.features', closing: '.closing', footer: 'footer' }[layer]; return selector && rightMode === 'properties' ? html.replace('</style>', selector + '{outline:2px solid #6f9b7e;outline-offset:-2px}</style>') : html; }, [html, layer, rightMode === 'properties']);
    const dirty = !!draft && (!active || JSON.stringify(draft) !== JSON.stringify(active.document));
    useEffect(()=>{
        if(!iconPickerOpen)return;
        const controller=new AbortController();
        const timer=setTimeout(async()=>{
            setIconLoading(true);
            try {
                const response=await fetch(`/api/studio/icons?query=${encodeURIComponent(iconQuery)}&limit=36`,{signal:controller.signal});
                if(!response.ok)throw new Error('Icon search is unavailable.');
                const result=await response.json();
                setIconResults(Array.isArray(result.icons)?result.icons:[]);
            }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Icon search is unavailable.');}
            finally{if(!controller.signal.aborted)setIconLoading(false);}
        },iconQuery?180:0);
        return()=>{controller.abort();clearTimeout(timer);};
    },[iconPickerOpen,iconQuery]);
    const liveState = useRef({dirty,busy,saving,selected});
    liveState.current={dirty,busy,saving,selected};
    useEffect(()=>{
        const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
        async function poll(){
            try {
                if(!document.hidden){
                    const observedHead=headVersion.current;
                    const response=await fetch(`/api/studio/canvas?projectId=${project.id}`,{cache:'no-store',signal:controller.signal});
                    if(response.ok){
                        const data=await response.json();const incoming=data.version as Version|undefined;
                        if(incoming && observedHead===headVersion.current && incoming.id!==headVersion.current){
                            const state=liveState.current;
                            setVersions(items=>items.some(item=>item.id===incoming.id)?items:[incoming,...items]);
                            if(!state.dirty&&!state.busy&&!state.saving&&(state.selected===headVersion.current||(!state.selected&&!headVersion.current))){
                                headVersion.current=incoming.id;setSelected(incoming.id);setDraft(incoming.document);setPast([]);setFuture([]);setRemoteVersion(null);
                            }else setRemoteVersion(incoming);
                        }
                    }
                }
            }catch{/* Retain the current canvas when the network is interrupted. */}
            finally{if(!controller.signal.aborted)timer=setTimeout(poll,4000);}
        }
        timer=setTimeout(poll,4000);return()=>{controller.abort();clearTimeout(timer);};
    },[project.id]);
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
    const selectVersion = (item: Version) => { if(item.id===remoteVersion?.id){headVersion.current=item.id;setRemoteVersion(null);} setSelected(item.id); setDraft(structuredClone(item.document)); setPast([]); setFuture([]); setError(''); };
    const undo = () => { const previous = past.at(-1); if (!previous || !draft)
        return; setFuture(items => [draft, ...items]); setPast(items => items.slice(0, -1)); setDraft(previous); };
    const redo = () => { const next = future[0]; if (!next || !draft)
        return; setPast(items => [...items, draft]); setFuture(items => items.slice(1)); setDraft(next); };
    async function persistManual(): Promise<Version | null> {
        if (!draft || !dirty || saving || saveInFlight.current)
            return null;
        saveInFlight.current = true;
        setSaving(true);
        setSaveConflict(false);
        setError('');
        try {
            const payload = JSON.stringify({ projectId: project.id, expectedVersionId: headVersion.current, parentVersionId: active?.id || null, document: draft, feedback: 'Manual canvas edits' });
            if (pendingSave.current?.payload !== payload) pendingSave.current = { payload, requestId: crypto.randomUUID() };
            const response = await fetch('/api/studio/versions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...JSON.parse(payload), requestId: pendingSave.current.requestId }) });
            const data = await response.json();
            if (data.code === 'revision_conflict') setSaveConflict(true);
            if (!response.ok || !data.version?.id)
                throw new Error(data.error || 'Could not save these edits.');
            headVersion.current = data.version.id;
            setRemoteVersion(null);
            setSaveConflict(false);
            pendingSave.current = null;
            setVersions(items => [data.version, ...items.filter(item => item.id !== data.version.id)]);
            setSelected(data.version.id);
            setDraft(current => JSON.stringify(current) === JSON.stringify(draft) ? data.version.document : current);
            setPast([]);
            setFuture([]);
            return data.version as Version;
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not save these edits.');
        }
        finally {
            saveInFlight.current = false;
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
            const response = await fetch('/api/studio/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, expectedVersionId: headVersion.current, versionId: baseVersion?.id, feedback: baseVersion ? feedback.trim() || 'Use this manual canvas as the starting point for a complete landing page.' : '', provider }), signal: AbortSignal.timeout(125000) });
            const data = await response.json();
            if (!response.ok) {
                if (data.code === 'revision_conflict') setSaveConflict(true);
                // Preserve a completed generation locally if its commit lost a race.
                if (data.generatedDocument) setDraft(data.generatedDocument);
                throw new Error(data.error || 'Generation failed. Please try again.');
            }
            if (!data.version?.id)
                throw new Error('The design could not be saved.');
            headVersion.current = data.version.id;
            setRemoteVersion(null);
            setSaveConflict(false);
            pendingSave.current = null;
            setVersions(items => [data.version, ...items.filter(item => item.id !== data.version.id)]);
            setSelected(data.version.id);
            setDraft(current => JSON.stringify(current) === JSON.stringify(draft) ? data.version.document : current);
            if (Array.isArray(data.notes)) setNewGuildNotes(data.notes);
            if (data.warning) setError(data.warning);
            if (data.switchedFrom) setProviderNotice(`Usage limit reached. GuildOS continued with ${data.provider === 'chatgpt' ? 'your ChatGPT plan' : data.provider==='openrouter'?'OpenRouter':data.provider==='groq'?'Groq':'your OpenAI API key'}.`);
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
    const layoutIssues = isCanvas(draft) ? canvasQualityIssues(draft) : [];
    const uploadCanvasImage = async (file:File) => {
        if(uploadingImage||!isCanvas(draft))return;
        setUploadingImage(true);setError('');
        try {
            const body=new FormData();body.set('projectId',project.id);body.set('image',file);
            const response=await fetch('/api/studio/assets',{method:'POST',body});
            const result=await response.json();
            if(!response.ok||!result.id)throw new Error(result.error||'The image could not be uploaded.');
            const current=draftRef.current;
            if(!isCanvas(current))return;
            setPast(items=>[...items.slice(-49),structuredClone(current)]);setFuture([]);
            const replaceId=imageReplaceId.current;
            if(replaceId&&current.nodes.some(node=>node.id===replaceId&&node.type==='image')){
                setDraft({...current,nodes:current.nodes.map(node=>node.id===replaceId?{...node,assetId:result.id}:node)});
                setNodeId(replaceId);
            }else{
                const view=canvasRef.current,scale=zoom/100;
                const centerX=view?(view.scrollLeft+view.clientWidth/2-38)/scale-CANVAS_WORKSPACE_MARGIN:0;
                const centerY=view?(view.scrollTop+view.clientHeight/2-38)/scale-CANVAS_WORKSPACE_MARGIN:0;
                const image:CanvasNode={id:crypto.randomUUID(),type:'image',name:file.name.slice(0,100)||'Image',x:Math.round(Math.max(-19000,Math.min(19000,centerX-160))),y:Math.round(Math.max(-19000,Math.min(19000,centerY-110))),width:320,height:220,fill:'#ffffff',stroke:'#ffffff',strokeWidth:0,radius:0,opacity:1,text:'',fontSize:16,fontWeight:400,assetId:result.id,imageFit:'cover'};
                const parent=current.nodes.find(item=>item.id===nodeId&&item.layout)||current.nodes.find(item=>item.id===current.nodes.find(selected=>selected.id===nodeId)?.parentId&&item.layout)||containingFrame(image,current.nodes);if(parent)image.parentId=parent.id;if(parent?.flow||current.nodes.some(item=>item.flow)){image.flow=true;image.sizing={width:'fill-container',height:'hug-contents'};}
                setDraft({...current,nodes:[...current.nodes,image]});setNodeId(image.id);
            }
            setTool('select');setRightMode('properties');
        }catch(cause){setError(cause instanceof Error?cause.message:'The image could not be uploaded.');}
        finally{imageReplaceId.current=null;setUploadingImage(false);if(imageInput.current)imageInput.current.value='';}
    };
    const insertCanvasIcon = (iconName:string) => {
        const current=draftRef.current;
        if(!isCanvas(current))return;
        setPast(items=>[...items.slice(-49),structuredClone(current)]);setFuture([]);
        const replaceId=iconReplaceId.current;
        if(replaceId&&current.nodes.some(node=>node.id===replaceId&&node.type==='icon')) {
            setDraft({...current,nodes:current.nodes.map(node=>node.id===replaceId?{...node,iconName,name:`${iconName} icon`}:node)});
            setNodeId(replaceId);
        } else {
            const view=canvasRef.current,scale=zoom/100;
            const x=view?(view.scrollLeft+view.clientWidth/2-38)/scale-CANVAS_WORKSPACE_MARGIN:0;
            const y=view?(view.scrollTop+view.clientHeight/2-38)/scale-CANVAS_WORKSPACE_MARGIN:0;
            const node:CanvasNode={id:crypto.randomUUID(),type:'icon',name:`${iconName} icon`,x:Math.round(Math.max(-19000,Math.min(19000,x-24))),y:Math.round(Math.max(-19000,Math.min(19000,y-24))),width:48,height:48,fill:'#202b38',stroke:'#202b38',strokeWidth:2,radius:0,opacity:1,text:'',fontSize:16,fontWeight:400,iconName};
            const parent=current.nodes.find(item=>item.id===nodeId&&item.layout)||current.nodes.find(item=>item.id===current.nodes.find(selected=>selected.id===nodeId)?.parentId&&item.layout)||containingFrame(node,current.nodes);if(parent)node.parentId=parent.id;if(parent?.flow||current.nodes.some(item=>item.flow)){node.flow=true;node.sizing={width:'hug-contents',height:'hug-contents'};}
            setDraft({...current,nodes:[...current.nodes,node]});setNodeId(node.id);
        }
        iconReplaceId.current=null;setIconPickerOpen(false);setIconQuery('');setTool('select');setRightMode('properties');
    };
    const alignSelected = (position:'left'|'center'|'right'|'top'|'middle'|'bottom') => {
        if(!selectedNode||!isCanvas(draft))return;
        const frame=draft.nodes.find(node=>node.id===selectedNode.parentId&&node.type==='frame')||containingFrame(selectedNode,draft.nodes);
        const bounds=frame||{x:0,y:0,width:draft.width,height:draft.height};
        const x=position==='left'?bounds.x:position==='center'?bounds.x+(bounds.width-selectedNode.width)/2:position==='right'?bounds.x+bounds.width-selectedNode.width:selectedNode.x;
        const y=position==='top'?bounds.y:position==='middle'?bounds.y+(bounds.height-selectedNode.height)/2:position==='bottom'?bounds.y+bounds.height-selectedNode.height:selectedNode.y;
        patchNode({x:Math.round(x),y:Math.round(y)});
    };
    const fitTextHeight = () => {
        if(selectedNode?.flow){patchNode({sizing:{width:selectedNode.sizing?.width||'fill-container',height:'hug-contents'}});return;}
        if(!selectedNode||selectedNode.type!=='text')return;
        const context=document.createElement('canvas').getContext('2d');
        if(!context)return;
        context.font=`${selectedNode.fontWeight} ${selectedNode.fontSize}px sans-serif`;
        let lines=0;
        for(const paragraph of selectedNode.text.split('\n')){
            let width=0;lines++;
            for(const word of paragraph.split(/\s+/)){
                const size=context.measureText(`${word} `).width+(word.length+1)*(selectedNode.letterSpacing??0);
                if(width>0&&width+size>selectedNode.width){lines++;width=size;}else width+=size;
            }
        }
        patchNode({height:Math.max(selectedNode.fontSize,Math.ceil(lines*selectedNode.fontSize*(selectedNode.lineHeight??1.2)+4))});
    };
    const copiedNode = useRef<CanvasNode[] | null>(null);
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
    const patchNode = (patch:Partial<CanvasNode>) => {if(!isCanvas(draft)||!selectedNode)return;if(selectedNode.flow&&patch.radius!==undefined)patch={...patch,radius:snapToGrid(patch.radius,1000)};commitCanvas();setDraft({...draft,nodes:draft.nodes.map(node=>node.id===nodeId?{...node,...patch}:node)});};
    const removeNode = () => {if(!isCanvas(draft)||!nodeId)return;commitCanvas();const removed=new Set([nodeId]);if(selectedNode?.flow)for(let pass=0;pass<draft.nodes.length;pass++)for(const node of draft.nodes)if(node.parentId&&removed.has(node.parentId))removed.add(node.id);setDraft({...draft,nodes:draft.nodes.filter(node=>!removed.has(node.id)).map(node=>node.parentId&&removed.has(node.parentId)?{...node,parentId:undefined}:node)});setNodeId('');};
    const copyNode = () => {if(!isCanvas(draft)||!selectedNode)return;const ids=new Set([selectedNode.id]);if(selectedNode.flow)for(let pass=0;pass<draft.nodes.length;pass++)for(const item of draft.nodes)if(item.parentId&&ids.has(item.parentId))ids.add(item.id);copiedNode.current=structuredClone([selectedNode,...draft.nodes.filter(item=>item.id!==selectedNode.id&&ids.has(item.id))]);pasteCount.current=0;};
    const pasteNode = () => {if(!isCanvas(draft)||!copiedNode.current)return;commitCanvas();const source=copiedNode.current,offset=24*(++pasteCount.current),ids=new Map(source.map(item=>[item.id,crypto.randomUUID()]));const nodes=source.map(item=>({...structuredClone(item),id:ids.get(item.id)!,name:item.name+' copy',parentId:item.parentId?(ids.get(item.parentId)||item.parentId):undefined,x:item.x+offset,y:item.y+offset}));setDraft({...draft,nodes:[...draft.nodes,...nodes]});setNodeId(nodes[0].id);setTool('select');setRightMode('properties');};
    const reorderCanvasNode = (sourceId:string,targetId:string) => {
        if(!isCanvas(draft)||sourceId===targetId)return;
        const source=draft.nodes.find(node=>node.id===sourceId),target=draft.nodes.find(node=>node.id===targetId);
        if(source?.flow&&source.parentId!==target?.parentId)return;
        const flow=source?.flow;
        const ordered=flow?[...draft.nodes]:[...draft.nodes].reverse();
        const from=ordered.findIndex(node=>node.id===sourceId),to=ordered.findIndex(node=>node.id===targetId);
        if(from<0||to<0)return;
        const [moved]=ordered.splice(from,1);ordered.splice(to,0,moved);
        commitCanvas();setDraft({...draft,nodes:flow?ordered:ordered.reverse()});setFuture([]);
    };
    const designSectionOrder = !draft || isCanvas(draft) ? ['hero','features','closing'] as const : draft.sectionOrder || ['hero','features','closing'];
    const orderedDesignLayers = [...layers.filter(item=>item.id==='page'||item.id==='header'),...designSectionOrder.map(id=>layers.find(item=>item.id===id)!).filter(Boolean),...layers.filter(item=>item.id==='footer')];
    const orderedCanvasNodes = isCanvas(draft) ? (draft.nodes.some(node=>node.flow)?[...draft.nodes]:[...draft.nodes].reverse()) : [];
    const canvasChildren = new Map<string, CanvasNode[]>();
    const canvasChildIds = new Set<string>();
    for (const node of orderedCanvasNodes) {
        if (node.type === 'frame'&&!node.flow) continue;
        const parent = isCanvas(draft) ? draft.nodes.find(item=>item.id===node.parentId)||containingFrame(node, draft.nodes) : undefined;
        if (parent) {
            canvasChildIds.add(node.id);
            canvasChildren.set(parent.id, [...(canvasChildren.get(parent.id) || []), node]);
        }
    }
    const topLevelCanvasNodes = orderedCanvasNodes.filter(node => !canvasChildIds.has(node.id));
    const renderCanvasLayerRow = (node: CanvasNode, nested = false) => <ListItemButton key={node.id} draggable onDragStart={event=>{draggedNodeId.current=node.id;setLayerDragPreview(event,node.name);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',node.id);}} onDragOver={event=>{event.preventDefault();setDragOverNodeId(node.id);}} onDragLeave={()=>setDragOverNodeId(current=>current===node.id?null:current)} onDrop={event=>{event.preventDefault();const source=draggedNodeId.current||event.dataTransfer.getData('text/plain');reorderCanvasNode(source,node.id);draggedNodeId.current=null;setDragOverNodeId(null);}} onDragEnd={()=>{draggedNodeId.current=null;setDragOverNodeId(null);}} selected={nodeId===node.id} onClick={()=>{setNodeId(node.id);setTool('select');setRightMode('properties');}} sx={{borderRadius:1,py:.75,pl:nested?3:1.5,cursor:'grab',borderTop:dragOverNodeId===node.id?'2px solid #557c63':'2px solid transparent','&.Mui-selected':{bgcolor:'#e9f1eb',color:'#386650'},'&:active':{cursor:'grabbing'}}}><ListItemIcon sx={{minWidth:24,color:'text.disabled'}}><DragIndicatorOutlined size={15}/></ListItemIcon><ListItemIcon sx={{minWidth:24,color:'inherit'}}>{node.type==='text'?<TextFieldsOutlined size={17}/>:node.type==='icon'?<ShapesOutlined size={16}/>:node.type==='image'?<ImagePlusOutlined size={16}/>:node.type==='ellipse'?<CircleOutlined size={16}/>:node.type==='container'?<LayersOutlined size={16}/>:node.type==='frame'?<CropFreeOutlined size={16}/>:<RectangleOutlined size={16}/>}</ListItemIcon>{editingNodeName===node.id?<TextField autoFocus variant="standard" size="small" value={nodeNameDraft} slotProps={{htmlInput:{'aria-label':'Layer name',maxLength:100}}} onClick={event=>event.stopPropagation()} onChange={event=>setNodeNameDraft(event.target.value)} onBlur={()=>{if(cancelNodeRename.current){cancelNodeRename.current=false;return;}renameNode(node.id,nodeNameDraft);}} onKeyDown={event=>{event.stopPropagation();if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}if(event.key==='Escape'){cancelNodeRename.current=true;setEditingNodeName(null);}}} sx={{flex:1,minWidth:0,'& .MuiInputBase-input':{fontSize:12,py:.25}}}/>:<ListItemText primary={<span onDoubleClick={event=>{event.stopPropagation();setNodeNameDraft(node.name);setEditingNodeName(node.id);}} title="Double-click to rename">{node.name}</span>} slotProps={{primary:{sx:{fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}}}/>}<IconButton size="small" aria-label={'Toggle visibility '+node.name} onClick={event=>{event.stopPropagation();if(!isCanvas(draft))return;commitCanvas();setDraft({...draft,nodes:draft.nodes.map(item=>item.id===node.id?{...item,hidden:!item.hidden}:item)});}}>{node.hidden?<VisibilityOffOutlined size={14}/>:<VisibilityOutlined size={14}/>}</IconButton></ListItemButton>;
    const renderFlowLayerTree = (node:CanvasNode):React.ReactNode => <Box key={node.id}>{renderCanvasLayerRow(node)}<Box sx={{ml:1.25,borderLeft:'1px solid #e2e8e3'}}>{(canvasChildren.get(node.id)||[]).map(child=>renderFlowLayerTree(child))}</Box></Box>;
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
        const shortcuts=(event:KeyboardEvent)=>{if((event.target as HTMLElement).isContentEditable||event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)return;if(isCanvas(draft)&&selectedNode&&!selectedNode.flow&&!event.metaKey&&!event.ctrlKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const step=event.shiftKey?10:1;patchNode({x:selectedNode.x+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),y:selectedNode.y+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)});return;}if(event.key==='Delete'||event.key==='Backspace'){if(isCanvas(draft)&&nodeId){event.preventDefault();removeNode();}}if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='c'){if(isCanvas(draft)&&nodeId){event.preventDefault();copyNode();}}if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='v'){if(isCanvas(draft)&&copiedNode.current){event.preventDefault();pasteNode();}}if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='d'){if(isCanvas(draft)&&selectedNode){event.preventDefault();copyNode();pasteNode();}}if(!event.metaKey&&!event.ctrlKey){const key=event.key.toLowerCase();const tools:Record<string,CanvasTool>={v:'select',h:'hand',f:'frame',r:'rectangle',o:'ellipse',t:'text',l:'line',p:'path'};if(tools[key])setTool(tools[key]);}};
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
    const selectedFrame = selectedNode&&isCanvas(draft) ? draft.nodes.find(node=>node.id===selectedNode.parentId&&node.type==='frame')||containingFrame(selectedNode,draft.nodes) : undefined;
    const alignmentTools = [
        {position:'left',Icon:AlignHorizontalJustifyStart},
        {position:'center',Icon:AlignHorizontalJustifyCenter},
        {position:'right',Icon:AlignHorizontalJustifyEnd},
        {position:'top',Icon:AlignVerticalJustifyStart},
        {position:'middle',Icon:AlignVerticalJustifyCenter},
        {position:'bottom',Icon:AlignVerticalJustifyEnd},
    ] as const;
    const inspectorHeading = {fontSize:12,fontWeight:700,color:'#34424d',letterSpacing:'.02em'};
    const designProperties = <Box sx={{p:1.75}}>
     {isCanvas(draft)&&layoutIssues.length>0&&<Box sx={{mb:2,p:1.25,border:'1px solid #ead5ad',borderRadius:1.5,bgcolor:'#fffaf1'}}>
      <Stack direction="row" spacing={1} sx={{alignItems:"center"}}><TriangleAlert size={16} color="#a66815"/><Typography variant="body2" sx={{fontWeight:650,flex:1,fontSize:12.5}}>{layoutIssues.length} layout issue{layoutIssues.length===1?'':'s'}</Typography><Button size="small" onClick={()=>setShowLayoutIssues(value=>!value)} aria-expanded={showLayoutIssues} sx={{minWidth:0,p:.25,fontSize:11,textTransform:'none'}}>{showLayoutIssues?'Hide':'Review'}</Button></Stack>
      {showLayoutIssues&&<Stack spacing={.5} sx={{mt:1,pl:3}}>{layoutIssues.slice(0,5).map(issue=><Typography key={issue.key} variant="caption" color="text.secondary" sx={{lineHeight:1.35}}>{issue.message}</Typography>)}{layoutIssues.length>5&&<Typography variant="caption" color="text.secondary">+{layoutIssues.length-5} more issues</Typography>}</Stack>}
     </Box>}
     {!draft?<Stack spacing={2}><Typography variant="h6">A blank beginning</Typography><Typography variant="body2" color="text.secondary">Create your own design with text and shapes, or generate a draft from your brief.</Typography><Button variant="outlined" onClick={startBlank}>Start manually</Button></Stack>:isCanvas(draft)?selectedNode?<Stack spacing={0}>
      <Box sx={{pb:2}}><Typography sx={inspectorHeading}>Layer</Typography><TextField label="Layer name" size="small" fullWidth value={selectedNode.name} onChange={event=>patchNode({name:event.target.value})} slotProps={{htmlInput:{maxLength:100}}} sx={{mt:1}}/></Box>
      <Divider/>
      {selectedNode.flow?<AutoLayoutProperties node={selectedNode} document={draft} onPatch={patchNode} onAdd={(type,direction)=>{commitCanvas();const node:CanvasNode={id:crypto.randomUUID(),type,name:type==='text'?'Text':direction==='row'?'Row':'Column',x:0,y:0,width:100,height:24,fill:type==='text'?'#202b38':'#ffffff',stroke:'#ffffff',strokeWidth:0,radius:0,opacity:1,text:type==='text'?'Your text':'',fontSize:16,fontWeight:400,flow:true,parentId:selectedNode.id,sizing:{width:'fill-container',height:'hug-contents'},...(type==='container'?{layout:{...defaultLayout,direction:direction||'column'}}:{})};setDraft({...draft,nodes:[...draft.nodes,node]});setNodeId(node.id);}}/>:<Box sx={{py:2}}><Typography sx={inspectorHeading}>Position</Typography><Typography variant="caption" color="text.secondary" sx={{display:'block',mt:1.25,mb:.5}}>Align within {selectedFrame?'frame':'canvas'}</Typography>
       <Box role="group" aria-label="Layer alignment" sx={{display:'grid',gridTemplateColumns:'repeat(6,minmax(0,1fr))',gap:.25,p:.25,borderRadius:1.5,bgcolor:'#f0f3f5'}}>{alignmentTools.map(({position,Icon},index)=><Tooltip key={position} title={`Align ${position}`}><IconButton size="small" aria-label={`Align ${position} within ${selectedFrame?'frame':'canvas'}`} onClick={()=>alignSelected(position)} sx={{minWidth:0,width:'100%',height:34,borderRadius:1,color:'#34424d',borderLeft:index===3?'1px solid #d1d9de':undefined,'&:hover':{bgcolor:'#dfe7eb'}}}><Icon size={17} strokeWidth={1.8}/></IconButton></Tooltip>)}</Box>
       <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:1.5,mb:.5}}>Coordinates and size</Typography><Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:1}}>{(['x','y','width','height'] as const).map(key=><TextField key={key} size="small" fullWidth label={{x:'X',y:'Y',width:'W',height:'H'}[key]} type="number" value={Math.round(selectedNode[key])} onChange={event=>patchNode({[key]:key==='width'||key==='height'?Math.max(1,Number(event.target.value)):Number(event.target.value)})} slotProps={{htmlInput:{'aria-label':{x:'X position',y:'Y position',width:'Width',height:'Height'}[key]}}}/>)}</Box>
      </Box>}
      {['text','button','input'].includes(selectedNode.type)&&<><Divider/><Box sx={{py:2}}><Typography sx={inspectorHeading}>Text</Typography><TextField label="Text content" size="small" fullWidth multiline minRows={3} value={selectedNode.text} onChange={event=>patchNode({text:event.target.value})} slotProps={{htmlInput:{maxLength:5000}}} sx={{mt:1.5}}/>
       <Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:1,mt:1.25}}><TextField label="Font size" size="small" type="number" value={selectedNode.fontSize} onChange={event=>patchNode({fontSize:Math.max(1,Math.min(500,Number(event.target.value)))})}/><TextField label="Font weight" size="small" select value={selectedNode.fontWeight} onChange={event=>patchNode({fontWeight:Number(event.target.value)})}>{[300,400,500,600,700,800,900].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField></Box>
       <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:1.5,mb:.5}}>Text alignment</Typography><Box role="group" aria-label="Text alignment" sx={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:.5}}>{([{value:'left',Icon:AlignLeft},{value:'center',Icon:AlignCenter},{value:'right',Icon:AlignRight}] as const).map(({value,Icon})=><Tooltip key={value} title={`Align text ${value}`}><IconButton size="small" aria-label={`Align text ${value}`} aria-pressed={(selectedNode.textAlign||'left')===value} onClick={()=>patchNode({textAlign:value})} sx={{height:34,borderRadius:1,bgcolor:(selectedNode.textAlign||'left')===value?'#e4eee7':'#f1f3f5',color:(selectedNode.textAlign||'left')===value?'#386650':'#4a5963','&:hover':{bgcolor:'#dce8df'}}}><Icon size={17}/></IconButton></Tooltip>)}</Box>
       <TextField label="Vertical text alignment" size="small" select fullWidth value={selectedNode.verticalAlign||'top'} onChange={event=>patchNode({verticalAlign:event.target.value as CanvasNode['verticalAlign']})} sx={{mt:1.25}}>{(['top','middle','bottom'] as const).map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
       <Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:1,mt:1.25}}><TextField label="Line height" size="small" type="number" value={selectedNode.lineHeight??1.2} slotProps={{htmlInput:{step:.1,min:.8,max:3}}} onChange={event=>patchNode({lineHeight:Math.max(.8,Math.min(3,Number(event.target.value)))})}/><TextField label="Letter spacing" size="small" type="number" value={selectedNode.letterSpacing??0} slotProps={{htmlInput:{step:.5,min:-5,max:30}}} onChange={event=>patchNode({letterSpacing:Math.max(-5,Math.min(30,Number(event.target.value)))})}/></Box><Button size="small" variant="text" onClick={fitTextHeight} sx={{mt:1,textTransform:'none'}}>Fit height to text</Button>
      </Box></>}
      {selectedNode.type==='image'&&<><Divider/><Box sx={{py:2}}><Typography sx={inspectorHeading}>Image</Typography><TextField label="Image fit" size="small" select fullWidth value={selectedNode.imageFit||'cover'} onChange={event=>patchNode({imageFit:event.target.value as 'cover'|'contain'})} sx={{mt:1.5}}><MenuItem value="cover">Cover · crop to fill</MenuItem><MenuItem value="contain">Contain · show entire image</MenuItem></TextField><Button size="small" variant="outlined" onClick={()=>{imageReplaceId.current=selectedNode.id;imageInput.current?.click();}} sx={{mt:1.25,textTransform:'none'}}>Replace image</Button></Box></>}
      {selectedNode.type==='icon'&&<><Divider/><Box sx={{py:2}}><Typography sx={inspectorHeading}>Icon</Typography><Stack direction="row" spacing={1} sx={{alignItems:'center',mt:1.25}}><Box component="img" alt="" src={canvasIconUrl(selectedNode.iconName!,selectedNode.fill,selectedNode.strokeWidth)} sx={{width:32,height:32}}/><Typography variant="body2" sx={{flex:1}}>{selectedNode.iconName}</Typography><Button size="small" variant="outlined" onClick={()=>{iconReplaceId.current=selectedNode.id;setIconPickerOpen(true);}} sx={{textTransform:'none'}}>Change</Button></Stack></Box></>}
      <Divider/>
      <Box sx={{py:2}}><Typography sx={inspectorHeading}>Appearance</Typography>
       {selectedNode.type!=='image'&&<><Box sx={{display:'grid',gridTemplateColumns:selectedNode.type==='icon'?'1fr':'repeat(2,minmax(0,1fr))',gap:1,mt:1.25}}>{(selectedNode.type==='icon'?([{label:'Icon color',key:'fill'}] as const):([{label:'Fill',key:'fill'},{label:'Stroke',key:'stroke'}] as const)).map(item=><Box key={item.key}><Typography variant="caption" color="text.secondary">{item.label}</Typography><Box sx={{display:'flex',alignItems:'center',gap:.75,mt:.25,p:.5,border:'1px solid #d8e0e5',borderRadius:1,minWidth:0}}><input type="color" aria-label={`${item.label} color`} value={selectedNode[item.key]} onChange={event=>patchNode({[item.key]:event.target.value})} style={{width:28,height:26,padding:0,border:0,background:'transparent',cursor:'pointer',flex:'none'}}/><Typography variant="caption" sx={{fontFamily:'monospace',fontSize:11,overflow:'hidden',textOverflow:'ellipsis'}}>{selectedNode[item.key].toUpperCase()}</Typography></Box></Box>)}</Box><Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:1,mt:1.25}}><TextField label={selectedNode.type==='icon'?'Line weight':'Stroke width'} size="small" type="number" value={selectedNode.strokeWidth} onChange={event=>patchNode({strokeWidth:selectedNode.type==='icon'?Math.max(.5,Math.min(4,Number(event.target.value))):Math.max(0,Math.min(100,Number(event.target.value)))})}/>{(selectedNode.type==='rectangle'||selectedNode.type==='frame'||selectedNode.type==='container'||selectedNode.type==='button'||selectedNode.type==='input')&&<TextField label="Corner radius" size="small" type="number" value={selectedNode.radius} onChange={event=>patchNode({radius:Math.max(0,Math.min(1000,Number(event.target.value)))})}/>}</Box></>}
       <Stack direction="row" sx={{mt:1.5,justifyContent:"space-between"}}><Typography variant="caption" color="text.secondary">Opacity</Typography><Typography variant="caption">{Math.round(selectedNode.opacity*100)}%</Typography></Stack><Slider size="small" value={selectedNode.opacity*100} aria-label="Layer opacity" onChange={(_,value)=>patchNode({opacity:Number(value)/100})} sx={{mt:.25}}/>
      </Box>
     </Stack>:<Stack spacing={2.5}>{tool==='frame'&&<><Typography variant="h6">Frame</Typography><TextField select label="Device preset" value={framePreset} onChange={event=>setFramePreset(event.target.value)}>{framePresets.map(item=><MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}</TextField></>}<Typography variant="body2" color="text.secondary">Pick a tool and draw on the workspace. Select a layer to edit its properties.</Typography></Stack>:<><TextField select label="Selected section" value={layer} onChange={event=>setLayer(event.target.value as Layer)} sx={{mb:3}}>{layers.map(item=><MenuItem key={item.id} value={item.id}>{item.title}</MenuItem>)}</TextField><Stack spacing={2.5}>
      {layer==='page'&&<>{updateText('brand','Brand name')}<TextField select label="Typography" value={draft.style} onChange={event=>update('style',event.target.value)}>{['editorial','bold','minimal'].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField><TextField select label="Color palette" value={draft.palette} onChange={event=>update('palette',event.target.value)}>{['ocean','moss','clay','midnight'].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField></>}
      {layer==='header'&&updateText('brand','Brand name')}{layer==='hero'&&<>{updateText('eyebrow','Eyebrow')}{updateText('headline','Headline',true)}{updateText('description','Description',true)}{updateText('cta','Button label')}</>}{layer==='features'&&draft.features.map((feature,index)=><Accordion key={index} defaultExpanded={index===0} disableGutters><AccordionSummary expandIcon={<ExpandMoreOutlined/>}><Typography variant="body2">Benefit {index+1}</Typography></AccordionSummary><AccordionDetails><Stack spacing={2}><TextField label={'Benefit '+(index+1)+' title'} value={feature.title} onChange={event=>updateFeature(index,'title',event.target.value)}/><TextField label={'Benefit '+(index+1)+' description'} value={feature.description} multiline minRows={3} onChange={event=>updateFeature(index,'description',event.target.value)}/></Stack></AccordionDetails></Accordion>)}{layer==='closing'&&<>{updateText('closingTitle','Closing heading',true)}{updateText('closingDescription','Closing description',true)}{updateText('cta','Button label')}</>}{layer==='footer'&&updateText('brand','Brand name')}<Divider/><Typography variant="caption" color="text.secondary">Save changes to create a new version without using model tokens.</Typography>
     </Stack></>}
    </Box>;
   return <ThemeProvider theme={tooltipTheme}><Box className="design-workspace" sx={{bgcolor:'background.default',color:'text.primary'}}>
  <DeleteProjectDialog project={deleteProjectOpen?{id:project.id,name:projectName}:null} onClose={()=>setDeleteProjectOpen(false)} onDeleted={()=>{router.replace('/studio/projects');router.refresh();}}/>
  <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="Upload canvas image" onChange={event=>{const file=event.currentTarget.files?.[0];if(file)void uploadCanvasImage(file);}}/>
  <Stack component="header" direction="row" spacing={1.5} sx={{minHeight:58,px:2,bgcolor:'background.default',alignItems:'center',flexWrap:{xs:'wrap',sm:'nowrap'},py:{xs:1,sm:0}}}>
   <Link href="/studio" className="editor-logo" aria-label="Back to dashboard"><GuildOSMark/></Link><Stack direction="row" className="project-title-menu" sx={{alignItems:'center',gap:.5,minWidth:0,maxWidth:340,bgcolor:'#edf2ef',borderRadius:'10px',p:.5,pl:1,ml:'0 !important'}}>{editingProjectName?<TextField autoFocus size="small" value={projectNameDraft} slotProps={{htmlInput:{'aria-label':'Project name',maxLength:100}}} onChange={event=>setProjectNameDraft(event.target.value)} onBlur={()=>{if(cancelProjectRename.current){cancelProjectRename.current=false;return;}void renameProject();}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void renameProject();event.currentTarget.blur();}if(event.key==='Escape'){cancelProjectRename.current=true;setProjectNameDraft(projectName);setEditingProjectName(false);}}} sx={{minWidth:0,maxWidth:230,'& .MuiInputBase-input':{py:.45,px:.5,fontSize:'clamp(14px, 0.9vw, 17px)',fontWeight:650}}}/>:<><Typography component="h1" variant="body2" onDoubleClick={()=>{setProjectNameDraft(projectName);setEditingProjectName(true);}} sx={{fontWeight:650,fontSize:'clamp(14px, 0.9vw, 17px)',maxWidth:230,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:'text',px:.6,py:.5}} title="Double-click to rename">{projectName}</Typography><IconButton size="small" aria-label="Project actions" aria-haspopup="menu" aria-expanded={!!projectMenuAnchor} onClick={event=>setProjectMenuAnchor(event.currentTarget)} sx={{width:28,height:28,flex:'none',color:'#65746b'}}><ProjectMenuIcon size={15}/></IconButton></>}</Stack><Menu anchorEl={projectMenuAnchor} open={!!projectMenuAnchor} onClose={()=>setProjectMenuAnchor(null)} slotProps={{paper:{sx:{minWidth:230,mt:.5,'& .MuiMenuItem-root':{fontSize:14,lineHeight:1.4,minHeight:44,px:2},'& .MuiListItemText-primary':{fontSize:14,lineHeight:1.4},'& .MuiListItemIcon-root':{minWidth:34},'& svg':{width:17,height:17}}},list:{'aria-label':'Project actions'}}}>
    <MenuItem selected={rightMode==='history'} onClick={()=>{setRightMode(current=>current==='history'?null:'history');setProjectMenuAnchor(null);}}><ListItemIcon><HistoryOutlined size={17}/></ListItemIcon><ListItemText slotProps={{primary:{sx:{fontSize:14,lineHeight:1.4}}}}>{rightMode==='history'?'Hide':'Show'} version history</ListItemText></MenuItem>
    <Divider/>
    <MenuItem disabled={!past.length||busy||saving} onClick={()=>{setProjectMenuAnchor(null);undo();}}><ListItemIcon><UndoOutlined size={17}/></ListItemIcon><ListItemText slotProps={{primary:{sx:{fontSize:14,lineHeight:1.4}}}}>Undo</ListItemText></MenuItem>
    <MenuItem disabled={!future.length||busy||saving} onClick={()=>{setProjectMenuAnchor(null);redo();}}><ListItemIcon><RedoOutlined size={17}/></ListItemIcon><ListItemText slotProps={{primary:{sx:{fontSize:14,lineHeight:1.4}}}}>Redo</ListItemText></MenuItem>
    <MenuItem disabled={!dirty||saving||busy} onClick={()=>{setProjectMenuAnchor(null);void persistManual();}}><ListItemIcon><SaveOutlined size={17}/></ListItemIcon><ListItemText slotProps={{primary:{sx:{fontSize:14,lineHeight:1.4}}}}>Save changes</ListItemText></MenuItem>
    <Divider/>
    <MenuItem disabled={saving||busy} onClick={()=>{setProjectMenuAnchor(null);setDeleteProjectOpen(true);}} sx={{color:'error.main'}}><ListItemIcon sx={{color:'inherit'}}><Trash2 size={17}/></ListItemIcon><ListItemText>Delete project</ListItemText></MenuItem>
   </Menu>
   <Box sx={{flex:1,minWidth:8}}/><Stack direction="row" spacing={.25} sx={{alignItems:'center',display:{xs:'none',md:'flex'}}}>{!isCanvas(draft)&&<ToggleButtonGroup exclusive size="small" value={mobile?'mobile':'desktop'} onChange={(_,value)=>value&&setMobile(value==='mobile')} aria-label="Preview size"><ToggleButton value="desktop" aria-label="Desktop preview" sx={{p:.4}}><DesktopWindowsOutlined size={15}/></ToggleButton><ToggleButton value="mobile" aria-label="Mobile preview" sx={{p:.4}}><SmartphoneOutlined size={15}/></ToggleButton></ToggleButtonGroup>}</Stack>
   {dirty&&<Chip role="status" size="small" label={saving?'Saving…':'Unsaved'} variant="outlined" color="warning"/>}
   {remoteVersion&&<Button size="small" onClick={()=>dirty?setPendingVersion(remoteVersion):selectVersion(remoteVersion)}>New version available</Button>}
   <AccountMenu/>
  </Stack>
  <Box className="design-workspace-body" style={{gridTemplateColumns:`${leftOpen?'48px clamp(300px,25vw,360px)':'48px 0px'} minmax(0,1fr) ${rightMode?'clamp(280px,22vw,340px)':'0px'}`}}>
   <Box component="nav" className="editor-rail" aria-label="Editor navigation" sx={{display:'flex',bgcolor:'background.paper',borderRight:'1px solid',borderColor:'divider'}}>
    {[{id:'file',label:'Layers',Icon:FolderOutlined},{id:'guild',label:'Project conversation',Icon:ForumOutlined},{id:'tasks',label:'Tasks',Icon:ClipboardList},{id:'brief',label:'Brief',Icon:ArticleOutlined}].map(item=><Tooltip key={item.id} title={item.label} placement="right"><IconButton aria-label={item.label} aria-pressed={leftOpen&&leftPanel===item.id} onClick={()=>{setLeftPanel(item.id as typeof leftPanel);setLeftOpen(true);}} sx={{width:36,height:36,borderRadius:'8px',color:leftOpen&&leftPanel===item.id?'#426a55':'text.secondary',bgcolor:leftOpen&&leftPanel===item.id?'#eaf1ec':'transparent','&:hover':{bgcolor:'#f1f5f2'}}}><item.Icon size={18}/></IconButton></Tooltip>)}
    <Box sx={{flex:1}}/>
   </Box>
   <Box component="aside" className="design-side-panel layers-panel" aria-label="Layers and versions" sx={{display:leftOpen?'block':'none',bgcolor:'background.paper',borderRight:'1px solid',borderColor:'divider',...(['guild','tasks'].includes(leftPanel)?{display:leftOpen?'flex':'none',flexDirection:'column',overflow:'hidden'}:{})}}>
    {leftPanel==='file'?<><Box sx={{px:2,py:1.25,borderBottom:'1px solid',borderColor:'divider',display:'flex',alignItems:'center',justifyContent:'space-between'}}><Typography variant="subtitle2">Layers</Typography><Tooltip title={leftOpen?'Collapse layers':'Expand layers'}><IconButton size="small" aria-label={leftOpen?'Collapse layers':'Expand layers'} onClick={()=>setLeftOpen(open=>!open)}><ViewSidebarOutlined size={17}/></IconButton></Tooltip></Box><Box sx={{p:1}}>{!draft?<Typography variant="body2" color="text.secondary" sx={{p:1.5}}>No layers yet. Start a blank canvas or generate a first draft.</Typography>:isCanvas(draft)?<List disablePadding>{topLevelCanvasNodes.map(node=>node.flow?renderFlowLayerTree(node):node.type==='frame'?<Box component="li" key={node.id} sx={{listStyle:'none',display:'flex',alignItems:'flex-start'}}><Accordion defaultExpanded disableGutters elevation={0} sx={{flex:1,minWidth:0,bgcolor:'transparent','&:before':{display:'none'},'&.Mui-expanded':{m:0}}}><AccordionSummary expandIcon={<ExpandMoreOutlined size={16}/>} draggable onDragStart={event=>{draggedNodeId.current=node.id;setLayerDragPreview(event,node.name);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',node.id);}} onDragOver={event=>{event.preventDefault();setDragOverNodeId(node.id);}} onDragLeave={()=>setDragOverNodeId(current=>current===node.id?null:current)} onDrop={event=>{event.preventDefault();const source=draggedNodeId.current||event.dataTransfer.getData('text/plain');reorderCanvasNode(source,node.id);draggedNodeId.current=null;setDragOverNodeId(null);}} onDragEnd={()=>{draggedNodeId.current=null;setDragOverNodeId(null);}} onClick={()=>{setNodeId(node.id);setTool('select');setRightMode('properties');}} sx={{minHeight:42,px:1.5,borderRadius:1,bgcolor:nodeId===node.id?'#e9f1eb':'transparent','&.Mui-expanded':{minHeight:42},'& .MuiAccordionSummary-content,& .MuiAccordionSummary-content.Mui-expanded':{my:.5},'& .MuiAccordionSummary-expandIconWrapper':{order:-1,mr:1}}}><ListItemIcon sx={{minWidth:24,color:'text.disabled'}}><DragIndicatorOutlined size={15}/></ListItemIcon><ListItemIcon sx={{minWidth:24,color:'inherit'}}><CropFreeOutlined size={16}/></ListItemIcon>{editingNodeName===node.id?<TextField autoFocus variant="standard" size="small" value={nodeNameDraft} slotProps={{htmlInput:{'aria-label':'Layer name',maxLength:100}}} onClick={event=>event.stopPropagation()} onChange={event=>setNodeNameDraft(event.target.value)} onBlur={()=>{if(cancelNodeRename.current){cancelNodeRename.current=false;return;}renameNode(node.id,nodeNameDraft);}} onKeyDown={event=>{event.stopPropagation();if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}if(event.key==='Escape'){cancelNodeRename.current=true;setEditingNodeName(null);}}} sx={{flex:1,minWidth:0,'& .MuiInputBase-input':{fontSize:12,py:.25}}}/>:<Typography onDoubleClick={event=>{event.stopPropagation();setNodeNameDraft(node.name);setEditingNodeName(node.id);}} title="Double-click to rename" sx={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:12}}>{node.name}</Typography>}</AccordionSummary><AccordionDetails sx={{p:0,pl:1}}><List disablePadding>{(canvasChildren.get(node.id)||[]).map(child=>child.flow?renderFlowLayerTree(child):renderCanvasLayerRow(child,true))}</List></AccordionDetails></Accordion><IconButton size="small" aria-label={'Toggle visibility '+node.name} onClick={event=>{event.stopPropagation();commitCanvas();setDraft({...draft,nodes:draft.nodes.map(item=>item.id===node.id?{...item,hidden:!item.hidden}:item)});}} sx={{mt:.6}}>{node.hidden?<VisibilityOffOutlined size={14}/>:<VisibilityOutlined size={14}/>}</IconButton></Box>:renderCanvasLayerRow(node))}</List>:<List disablePadding>{orderedDesignLayers.map(item=><ListItemButton key={item.id} draggable={['hero','features','closing'].includes(item.id)} onDragStart={event=>{if(!['hero','features','closing'].includes(item.id)){event.preventDefault();return;}draggedNodeId.current=item.id;setLayerDragPreview(event,item.title);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.id);}} onDragOver={event=>{if(['hero','features','closing'].includes(item.id)){event.preventDefault();setDragOverNodeId(item.id);}}} onDragLeave={()=>setDragOverNodeId(current=>current===item.id?null:current)} onDrop={event=>{event.preventDefault();const source=draggedNodeId.current||event.dataTransfer.getData('text/plain');reorderDesignSection(source,item.id);draggedNodeId.current=null;setDragOverNodeId(null);}} onDragEnd={()=>{draggedNodeId.current=null;setDragOverNodeId(null);}} selected={layer===item.id} onClick={()=>{setLayer(item.id);setRightMode('properties');}} sx={{borderRadius:1,py:1,cursor:['hero','features','closing'].includes(item.id)?'grab':'default',borderTop:dragOverNodeId===item.id?'2px solid #557c63':'2px solid transparent','&.Mui-selected':{bgcolor:'#e9f1eb',color:'#386650'}}}><ListItemIcon sx={{minWidth:30,color:'inherit'}}>{['hero','features','closing'].includes(item.id)?<DragIndicatorOutlined size={15}/>:<LayersOutlined size={17}/>}</ListItemIcon><ListItemText primary={item.title} slotProps={{primary:{sx:{fontSize:12}}}}/></ListItemButton>)}</List>}</Box></>:<>
    {leftPanel==='guild'?<GuildPanel projectId={project.id} versionId={active?.id||null} selectedContext={selectedNode?{id:selectedNode.id,name:selectedNode.name}:null} layers={isCanvas(draft)?draft.nodes.filter(node=>!node.hidden).map(node=>({id:node.id,name:node.name})):layers.map(item=>({id:item.id,name:item.title}))} addedNotes={newGuildNotes} initialMention={guildMention} onInitialMentionUsed={()=>setGuildMention(null)}/>:null}
    {leftPanel==='tasks'?<TaskBoard projectId={project.id} view="list"/>:null}
    {leftPanel==='brief'?<Stack spacing={2} sx={{p:2.5}}><Typography variant="h6">Original brief</Typography><Typography variant="body2" color="text.secondary" sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.8}}>{project.brief}</Typography></Stack>:null}
    </>}
   </Box>
   <Box component="aside" className="design-properties-panel" aria-label={rightMode==='history'?'Version history':'Selected element properties'} sx={{display:rightMode?'block':'none',bgcolor:'background.paper',borderLeft:'1px solid',borderColor:'divider',minWidth:0,minHeight:0,overflowY:'auto'}}>{rightMode==='history'?<><Stack direction="row" sx={{px:2,py:1.5,alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid',borderColor:'divider'}}><Typography variant="subtitle2">Version history</Typography><IconButton size="small" aria-label="Close version history" onClick={()=>setRightMode(null)}><CloseOutlined size={17}/></IconButton></Stack><Typography variant="caption" color="text.secondary" sx={{display:'block',px:2,py:1.5}}>Select a version to restore it.</Typography><List sx={{px:1}}>{versions.map((item,index)=><ListItemButton key={item.id} selected={selected===item.id} disabled={busy||saving} onClick={()=>dirty?setPendingVersion(item):selectVersion(item)} sx={{borderRadius:1,mb:.5}}><ListItemIcon sx={{minWidth:28,color:selected===item.id?'primary.main':'text.secondary'}}><HistoryOutlined size={17}/></ListItemIcon><ListItemText primary={'Version '+(versions.length-index)} secondary={<>{new Date(item.created_at).toISOString().slice(0,16).replace('T',' ')} · {item.model==='manual-edit'?'Manual design':item.feedback||'Guild revision'}</>} slotProps={{primary:{sx:{fontSize:12,fontWeight:600}},secondary:{sx:{fontSize:11}}}}/></ListItemButton>)}{!versions.length&&<Typography variant="body2" color="text.secondary" sx={{p:2}}>No versions yet.</Typography>}</List></>:rightMode==='properties'?<><Stack direction="row" sx={{px:1.75,py:1.25,alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid',borderColor:'divider'}}><Typography variant="subtitle2" sx={{fontWeight:700}}>Properties</Typography><Tooltip title="Close properties"><IconButton size="small" aria-label="Close properties" onClick={()=>setRightMode(null)}><CloseOutlined size={17}/></IconButton></Tooltip></Stack>{designProperties}</>:null}</Box>
   <Box component="section" className="design-canvas" aria-label="Design canvas" sx={{position:'relative'}}>
    <Box ref={canvasRef} className="canvas-scroll" sx={{cursor:panMode?'grab':'default',touchAction:'none',userSelect:'none',WebkitUserSelect:'none'}} onPointerDownCapture={event=>{pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.current.size===2){const[a,b]=[...pointers.current.values()],bounds=event.currentTarget.getBoundingClientRect();pinch.current={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:zoomRef.current};recordZoomAnchor((a.x+b.x)/2-bounds.left,(a.y+b.y)/2-bounds.top);}}} onPointerMoveCapture={event=>{if(!pointers.current.has(event.pointerId))return;pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pinch.current&&pointers.current.size===2){const[a,b]=[...pointers.current.values()],bounds=event.currentTarget.getBoundingClientRect(),next=Math.max(10,Math.min(300,pinch.current.zoom*Math.hypot(a.x-b.x,a.y-b.y)/pinch.current.distance));recordZoomAnchor((a.x+b.x)/2-bounds.left,(a.y+b.y)/2-bounds.top);zoomRef.current=next;setZoom(next);event.stopPropagation();}}} onPointerUpCapture={event=>{pointers.current.delete(event.pointerId);pinch.current=null;}} onPointerCancelCapture={()=>{pointers.current.clear();pinch.current=null;}} onPointerDown={event=>{const target=event.target as Element;const blankCanvasDrag=isCanvas(draft)&&tool==='select'&&!target.closest('[data-node-id]');if(!panMode&&!blankCanvasDrag&&event.button!==1)return;if(event.button!==0&&event.button!==1)return;event.preventDefault();const el=event.currentTarget;drag.current={x:event.clientX,y:event.clientY,left:el.scrollLeft,top:el.scrollTop};el.setPointerCapture(event.pointerId);}} onPointerMove={event=>{if(!drag.current)return;event.currentTarget.scrollLeft=drag.current.left-(event.clientX-drag.current.x);event.currentTarget.scrollTop=drag.current.top-(event.clientY-drag.current.y);}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
     <Box className="canvas-content"><Box sx={{width:workspaceWidth*zoom/100,height:workspaceHeight*zoom/100,position:'relative',flex:'none'}}><Box className="design-artboard" sx={{width:workspaceWidth,height:workspaceHeight,transform:`scale(${zoom/100})`,...(isCanvas(draft)?{background:'transparent',boxShadow:'none'}:{})}}>
     {draft?(isCanvas(draft)?<CanvasSurface document={draft} projectId={project.id} tool={tool} framePreset={framePresetSize} selected={nodeId} onSelect={id=>{setNodeId(id);setRightMode(id?'properties':null);}} onChange={setDraft} onCommit={commitCanvas} disabled={busy||saving||uploadingImage}/>:<iframe title="Generated landing page" srcDoc={previewHtml} sandbox="" referrerPolicy="no-referrer" style={{height:artboardHeight,pointerEvents:'none'}}/>):null}
     </Box></Box></Box>
    </Box>
    <Paper className="editor-tool-dock" elevation={8} role="toolbar" aria-label="Design tools" sx={{position:'absolute',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:5,p:.75,borderRadius:1.5,bgcolor:'#24282e',border:'1px solid #3a424a',boxShadow:'0 10px 34px #121b2755',display:'flex',alignItems:'center',gap:.35,maxWidth:'calc(100% - 24px)',overflowX:'auto'}}>
     {([{id:'select',label:'Select · V',Icon:NearMeOutlined},{id:'hand',label:'Hand · H',Icon:PanToolOutlined},{id:'frame',label:'Frame · F',Icon:CropFreeOutlined},{id:'rectangle',label:'Rectangle · R',Icon:RectangleOutlined},{id:'ellipse',label:'Ellipse · O',Icon:CircleOutlined},{id:'text',label:'Text · T',Icon:TextFieldsOutlined},{id:'line',label:'Line · L',Icon:HorizontalRuleOutlined},{id:'path',label:'Pencil · P',Icon:DrawOutlined}] as const).map((item,index)=><Box key={item.id} sx={{display:'flex',alignItems:'center'}}>{[2,3,5,6].includes(index)&&<Divider orientation="vertical" flexItem sx={{mx:.45,borderColor:'#515960'}}/>}<Tooltip arrow placement="top" title={<Box sx={{display:'flex',alignItems:'center',gap:1.5}}><span>{item.label.split(' · ')[0]}</span><Box component="span" sx={{fontSize:'.6875rem',fontWeight:600,color:'#aeb4ba'}}>{item.label.split(' · ')[1]}</Box></Box>} slotProps={{tooltip:{sx:{bgcolor:'#202124',color:'#f5f5f5',fontSize:'.75rem',fontWeight:500,lineHeight:1,borderRadius:'6px',px:1.1,py:.75,boxShadow:'0 4px 12px rgba(0,0,0,.22)'}},arrow:{sx:{color:'#202124'}}}}><span><IconButton aria-label={item.label.split(' ·')[0]+' tool'} aria-pressed={tool===item.id} disabled={busy||saving||(!!draft&&!isCanvas(draft)&&!['select','hand'].includes(item.id))} onClick={()=>{if(!draft)setDraft(blankCanvas());if(item.id==='frame'){setNodeId('');setRightMode('properties');}setTool(item.id);}} sx={{width:40,height:40,borderRadius:'8px',bgcolor:tool===item.id?'#4e7cae':'transparent',color:tool===item.id?'#fff':'#d9dfe4','&:hover':{bgcolor:tool===item.id?'#4e7cae':'#3b4249'},'&.Mui-disabled':{color:'#777f86'}}}><item.Icon size={21}/></IconButton></span></Tooltip></Box>)}
     <Divider orientation="vertical" flexItem sx={{mx:.45,borderColor:'#515960'}}/><Tooltip title="Insert image · PNG, JPEG, or WebP"><span><IconButton aria-label="Insert image" disabled={busy||saving||uploadingImage||!isCanvas(draft)} onClick={()=>{imageReplaceId.current=null;imageInput.current?.click();}} sx={{width:40,height:40,borderRadius:'8px',color:'#d9dfe4','&:hover':{bgcolor:'#3b4249'}}}><ImagePlusOutlined size={21}/></IconButton></span></Tooltip>
     <Tooltip title="Insert icon · free Lucide library"><span><IconButton aria-label="Insert icon" disabled={busy||saving||!isCanvas(draft)} onClick={()=>{iconReplaceId.current=null;setIconPickerOpen(true);}} sx={{width:40,height:40,borderRadius:'8px',color:'#d9dfe4','&:hover':{bgcolor:'#3b4249'}}}><ShapesOutlined size={21}/></IconButton></span></Tooltip>
    </Paper>
   </Box>
  </Box>
  <Dialog open={iconPickerOpen} onClose={()=>{setIconPickerOpen(false);iconReplaceId.current=null;}} fullWidth maxWidth="sm" aria-labelledby="icon-picker-title"><DialogTitle id="icon-picker-title" sx={{pb:1}}>Choose an icon</DialogTitle><DialogContent><TextField autoFocus fullWidth size="small" label="Search icons" value={iconQuery} onChange={event=>setIconQuery(event.target.value)} sx={{mt:1}}/><Typography variant="caption" color="text.secondary" sx={{display:'block',mt:1}}>Free Lucide icons · ISC license</Typography><Box sx={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(72px,1fr))',gap:1,mt:2,minHeight:80}}>{iconLoading?Array.from({length:12},(_,index)=><Skeleton key={index} variant="rounded" height={72}/>):iconResults.map(name=><Button key={name} aria-label={`Insert ${name} icon`} onClick={()=>insertCanvasIcon(name)} sx={{display:'flex',flexDirection:'column',gap:.75,minWidth:0,p:1,border:'1px solid #e1e6ea',borderRadius:1.5,textTransform:'none',color:'text.primary','&:hover':{bgcolor:'#f1f6f2'}}}><Box component="img" alt="" src={canvasIconUrl(name,'#202b38',2)} sx={{width:24,height:24}}/><Typography variant="caption" sx={{maxWidth:'100%',fontSize:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</Typography></Button>)}</Box>{!iconLoading&&!iconResults.length&&<Typography variant="body2" color="text.secondary" sx={{mt:2}}>No matching icons. Try a shorter term.</Typography>}</DialogContent><DialogActions><Button onClick={()=>{setIconPickerOpen(false);iconReplaceId.current=null;}}>Close</Button></DialogActions></Dialog>
  <Snackbar open={!!error} autoHideDuration={saveConflict ? null : 6000} onClose={(_,reason)=>{if(reason!=='clickaway'&&!saveConflict)setError('');}} anchorOrigin={{vertical:'bottom',horizontal:'center'}}><Alert severity="error" variant="filled" action={saveConflict ? <Button color="inherit" component="a" href={`/studio/projects/${project.id}`} target="_blank" rel="noopener noreferrer">Open latest</Button> : undefined} onClose={()=>{setError('');setSaveConflict(false);}} sx={{maxWidth:'min(560px, calc(100vw - 32px))'}}>{error}</Alert></Snackbar>
  <Snackbar open={!!providerNotice} autoHideDuration={6000} onClose={(_,reason)=>{if(reason!=='clickaway')setProviderNotice('');}} anchorOrigin={{vertical:'bottom',horizontal:'center'}}><Alert severity="success" variant="filled" onClose={()=>setProviderNotice('')} sx={{maxWidth:'min(560px, calc(100vw - 32px))'}}>{providerNotice}</Alert></Snackbar>
  <Dialog open={!!pendingVersion||!!discardAction} onClose={()=>{setPendingVersion(null);setDiscardAction(null);}} maxWidth="xs" fullWidth><DialogTitle>Discard unsaved changes?</DialogTitle><DialogContent><Typography variant="body2">Save your work first, or discard these local changes.</Typography></DialogContent><DialogActions><Button onClick={()=>{setPendingVersion(null);setDiscardAction(null);}}>Keep editing</Button><Button color="error" onClick={()=>{if(pendingVersion)selectVersion(pendingVersion);discardAction?.();setPendingVersion(null);setDiscardAction(null);}}>Discard changes</Button></DialogActions></Dialog>
 </Box></ThemeProvider>;
}
