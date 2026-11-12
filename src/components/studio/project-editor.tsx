'use client';
import type { TrialStatus } from '@/lib/studio/trial';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardList, Trash2 } from 'lucide-react';
import { DeleteProjectDialog } from './delete-project-dialog';
import { snapToGrid } from '@/lib/studio/design-system';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Snackbar, Skeleton, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
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
import { ChevronRight as ChevronRightOutlined } from 'lucide-react';
import { renderDesign } from '@/lib/studio/design.mjs';
import { blankCanvas, CANVAS_WORKSPACE_MARGIN, CANVAS_WORKSPACE_SIZE, adjacentCanvasSiblingId, canvasIconUrl, containingFrame, isCanvas, renderCanvas, reorderCanvasSiblings, type CanvasDocument, type CanvasNode } from '@/lib/studio/canvas';
import { ExportLayer } from './export-layer';
import { AutoLayoutProperties } from './auto-layout-properties';
import { defaultLayout } from '@/lib/studio/canvas-layout';
import { CanvasSurface, type CanvasTool } from './canvas-surface';
import { measureCanvasNode } from './canvas-geometry';
import { normalizeCanvasPositions, positionMode, type NodeGeometry } from '@/lib/studio/canvas-position';
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
import { GuildPanel } from './guild-panel';
import { GuildOSMark } from './brand';
import type { AgentRole } from '@/lib/studio/agent-roles';
import { agentIdentity } from '@/lib/studio/agent-roles';
import { canvasQualityIssues } from '@/lib/studio/canvas-quality';
import { HTML_DEVICE_FRAME, isHtmlScreen, type HtmlScreenDocument } from '@/lib/studio/html-screen';
import type { ScreenSelection } from './html-screen-frame';
import { BoardView, type BoardDraft } from './board-view';
import { ScreenVersions } from './screen-versions';
import type { BoardScreen } from '@/lib/studio/screens';
import { ManualEditor } from './manual-editor';
import { captureBrowserZoom } from './pinch-zoom';
import { ScreenToolbar, useFloatingAnchor } from './screen-toolbar';
import type { ScopeMode } from './guild-panel';
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
    document: StudioDocument;
    feedback: string;
    created_at: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
};
type StudioDocument = Design | CanvasDocument | HtmlScreenDocument;
type Project = {
    id: string;
    name: string;
    brief: string;
    cta_url?: string | null;
};
type Layer = 'page' | 'header' | 'hero' | 'features' | 'closing' | 'footer';
type LivePipelinePreview = { kind:'canvas';taskId:string;updatedAt:string;status:'queued'|'running';document:CanvasDocument;targetScreenId:string;stage:number;role:AgentRole;nodeIds:string[] }
    | { kind:'html-screen';taskId:string;updatedAt:string;status:'queued'|'running';document:HtmlScreenDocument;phase:'plan'|'build'|'done';role:AgentRole;screenId:string|null;position:{x:number;y:number}|null };
const layers: {
    id: Layer;
    title: string;
    icon: string;
}[] = [
    { id: 'page', title: 'Page settings', icon: '▦' }, { id: 'header', title: 'Navigation', icon: '⌑' },
    { id: 'hero', title: 'Hero section', icon: '▤' }, { id: 'features', title: 'Benefits', icon: '▥' },
    { id: 'closing', title: 'Closing section', icon: '▤' }, { id: 'footer', title: 'Footer', icon: '▰' },
];
const isDesign=(value:unknown):value is Design=>!!value&&typeof value==='object'&&!isCanvas(value)&&!isHtmlScreen(value);
function newlyAddedScreenRoot(before:unknown,after:unknown):CanvasNode|undefined {
    if(!isCanvas(after))return undefined;
    const previous=new Set(isCanvas(before)?before.nodes.filter(node=>!node.parentId&&(node.screen||node.type==='frame')).map(node=>node.id):[]);
    return after.nodes.find(node=>!node.parentId&&(node.screen||node.type==='frame')&&!previous.has(node.id));
}
export function ProjectEditor({ project, initialVersions, initialScreens = [], initialVersionId, connections = { api:false, chatgpt:false, openrouter:false, groq:false }, trial = null }: {
    project: Project;
    trial?: TrialStatus | null;
    initialVersions: Version[];
    initialScreens?: BoardScreen[];
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
    const [draft, setDraft] = useState<StudioDocument | null>(active?.document || null);
    const [livePreview,setLivePreview]=useState<LivePipelinePreview|null>(null);
    const livePreviewRef=useRef<LivePipelinePreview|null>(null);
    const draftRef = useRef<StudioDocument | null>(draft);
    draftRef.current = draft;
    const [layer, setLayer] = useState<Layer>('hero');
    const [error, setError] = useState('');
    const [providerNotice, setProviderNotice] = useState('');
    const [mobile, setMobile] = useState(false);
    const [zoom, setZoom] = useState(65);
    const zoomRef = useRef(65);
    const committedZoomRef = useRef(65);
    const zoomAnchorRef = useRef<{fromZoom:number;scrollLeft:number;scrollTop:number;anchorX:number;anchorY:number;paddingLeft:number;paddingTop:number}|null>(null);
        const [leftPanel, setLeftPanel] = useState<'file'|'guild'|'brief'|'tasks'>('guild');
    const [rightMode, setRightMode] = useState<'properties'|'history'|null>(null);
    const [projectMenuAnchor, setProjectMenuAnchor] = useState<HTMLElement | null>(null);
    const [tool, setTool] = useState<CanvasTool>('select');
    const [selectedGeometry,setSelectedGeometry]=useState<NodeGeometry|null>(null);
    const imageInput = useRef<HTMLInputElement>(null);
    const imageReplaceId = useRef<string|null>(null);
    const iconReplaceId = useRef<string|null>(null);
    const [iconPickerOpen,setIconPickerOpen] = useState(false);
    const [iconQuery,setIconQuery] = useState('');
    const [iconResults,setIconResults] = useState<string[]>([]);
    const [iconLoading,setIconLoading] = useState(false);
    const [uploadingImage,setUploadingImage] = useState(false);
    const [showLayoutIssues,setShowLayoutIssues] = useState(false);
    const [collapsedLayerIds,setCollapsedLayerIds] = useState<Set<string>>(()=>new Set());
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
    const focusedPreviewRef=useRef('');
    const canvasCentered = useRef(false);
    const recordZoomAnchor = (anchorX:number,anchorY:number) => {const element=canvasRef.current;if(!element)return;const content=element.firstElementChild as HTMLElement|null;const style=content?getComputedStyle(content):null;const existing=zoomAnchorRef.current;if(existing){existing.anchorX=anchorX;existing.anchorY=anchorY;return;}zoomAnchorRef.current={fromZoom:committedZoomRef.current,scrollLeft:element.scrollLeft,scrollTop:element.scrollTop,anchorX,anchorY,paddingLeft:style?parseFloat(style.paddingLeft)||0:0,paddingTop:style?parseFloat(style.paddingTop)||0:0};};
    const drag = useRef<{
        x: number;
        y: number;
        left: number;
        top: number;
    } | null>(null);
    const [past, setPast] = useState<StudioDocument[]>([]);
    const [future, setFuture] = useState<StudioDocument[]>([]);
    const [saving, setSaving] = useState(false);
    const html = useMemo(() => { if (!draft)
        return ''; try {
        return isCanvas(draft) ? renderCanvas(draft,projectName,project.id) : isDesign(draft) ? renderDesign(draft, project.cta_url) : '';
    }
    catch {
        return active ? (isCanvas(active.document)?renderCanvas(active.document,projectName,project.id):isDesign(active.document)?renderDesign(active.document, project.cta_url):'') : '';
    } }, [draft, active, project.cta_url, projectName]);
    const previewHtml = useMemo(() => { const selector = { page: '', header: 'header', hero: '.hero', features: '.features', closing: '.closing', footer: 'footer' }[layer]; return selector && rightMode === 'properties' ? html.replace('</style>', selector + '{outline:2px solid #6f9b7e;outline-offset:-2px}</style>') : html; }, [html, layer, rightMode === 'properties']);
    const dirty = !!draft && (!active || JSON.stringify(draft) !== JSON.stringify(active.document));
    const visiblePipelinePreview=!dirty&&!saving?livePreview:null;
    // The live agent draft must render even before the project's first saved version exists.
    const canvasPreview=visiblePipelinePreview?.kind==='canvas'?visiblePipelinePreview:null;
    const canvasDocument=canvasPreview?.document||(!visiblePipelinePreview&&isCanvas(draft)?draft:null);
    // Board: once a project has a screen (or the agents are drawing its first), it is a board of screens,
    // each with its own versions. Until then an empty project keeps the freeform canvas tools.
    const [screens,setScreens]=useState<BoardScreen[]>(initialScreens);
    const boardDraft:BoardDraft|null=visiblePipelinePreview?.kind==='html-screen'?{screenId:visiblePipelinePreview.screenId,position:visiblePipelinePreview.position,document:visiblePipelinePreview.document,role:visiblePipelinePreview.role}:null;
    const [boardStarted,setBoardStarted]=useState(false);
    if(boardDraft&&!boardStarted)setBoardStarted(true);
    const boardMode=screens.length>0||boardStarted;
    const [screenSelection,setScreenSelection]=useState<ScreenSelection|null>(null);
    const [manualEditing,setManualEditing]=useState(false);
    // A screen is selected by clicking it; the floating toolbar, properties and chat context follow it.
    const [selectedScreenId,setSelectedScreenId]=useState<string|null>(null);
    const selectedScreen=screens.find(screen=>screen.id===selectedScreenId)??null;
    const canvasPress=useRef<{x:number;y:number}|null>(null);
    const deselectScreen=()=>{setSelectedScreenId(null);setScreenSelection(null);};
    const [screenSaving,setScreenSaving]=useState(false);
    const [scopeRequest,setScopeRequest]=useState<{mode:ScopeMode;at:number}|null>(null);
    const canvasSectionRef=useRef<HTMLElement>(null);
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
    const liveState = useRef({dirty,saving,selected,draft});
    liveState.current={dirty,saving,selected,draft};
    useEffect(()=>{
        const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
        const updatePreview=(preview:LivePipelinePreview|null)=>{livePreviewRef.current=preview;setLivePreview(preview);};
        async function poll(){
            try {
                if(!document.hidden){
                    const state=liveState.current;
                    if(state.dirty||state.saving)updatePreview(null);
                    else {
                        const since=livePreviewRef.current?.updatedAt;
                        const query=new URLSearchParams({projectId:project.id,...(since?{since,sinceStatus:livePreviewRef.current?.status||''}:{})});
                        const response=await fetch(`/api/studio/pipeline/live?${query}`,{cache:'no-store',signal:controller.signal});
                        if(response.ok){const data=await response.json();if(!data.unchanged)updatePreview(data.preview as LivePipelinePreview|null);}
                    }
                }
            }catch{/* Keep the last committed preview during a transient polling failure. */}
            finally{if(!controller.signal.aborted)timer=setTimeout(poll,1600);}
        }
        timer=setTimeout(poll,500);return()=>{controller.abort();clearTimeout(timer);};
    },[project.id]);
    useLayoutEffect(()=>{
        const preview=canvasPreview;
        if(!preview){focusedPreviewRef.current='';return;}
        const focusKey=`${preview.taskId}:${preview.targetScreenId}`;
        if(focusedPreviewRef.current===focusKey)return;
        const frame=requestAnimationFrame(()=>{
            const view=canvasRef.current;
            const nodes=view?.querySelectorAll<HTMLElement>('[data-node-id]');
            const target=nodes&&Array.from(nodes).find(element=>element.dataset.nodeId===preview.targetScreenId);
            if(!view||!target)return;
            const targetBounds=target.getBoundingClientRect(),viewBounds=view.getBoundingClientRect();
            view.scrollLeft+=targetBounds.left+targetBounds.width/2-(viewBounds.left+viewBounds.width/2);
            view.scrollTop+=targetBounds.top+Math.min(targetBounds.height,view.clientHeight*.75)/2-(viewBounds.top+viewBounds.height/2);
            focusedPreviewRef.current=focusKey;
        });
        return()=>cancelAnimationFrame(frame);
    },[canvasPreview?.taskId,canvasPreview?.targetScreenId,canvasPreview?.document]);
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
                            if(!state.dirty&&!state.saving&&(state.selected===headVersion.current||(!state.selected&&!headVersion.current))){
                                const newRoot=newlyAddedScreenRoot(state.draft,incoming.document);
                                headVersion.current=incoming.id;setSelected(incoming.id);setDraft(incoming.document);if(newRoot)setNodeId(newRoot.id);setPast([]);setFuture([]);setRemoteVersion(null);
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
        if (!isDesign(draft))
            return;
        setPast(items => [...items.slice(-29), draft]);
        setFuture([]);
        setDraft(current => isDesign(current) ? { ...current, [key]: value } : current);
    };
    const updateFeature = (index: number, key: keyof Feature, value: string) => {
        if (!isDesign(draft))
            return;
        setPast(items => [...items.slice(-29), draft]);
        setFuture([]);
        setDraft(current => isDesign(current) ? { ...current, features: current.features.map((feature, i) => i === index ? { ...feature, [key]: value } : feature) } : current);
    };
    const selectVersion = (item: Version) => { if(item.id===remoteVersion?.id){headVersion.current=item.id;setRemoteVersion(null);}const document=structuredClone(item.document);const newRoot=newlyAddedScreenRoot(draft,document);if(newRoot)setNodeId(newRoot.id);else if(!isCanvas(document)||!document.nodes.some(node=>node.id===nodeId))setNodeId('');setSelected(item.id);setDraft(document);setPast([]);setFuture([]);setError(''); };
    const undo = () => { const previous = past.at(-1); if (!previous || !draft)
        return; setFuture(items => [draft, ...items]); setPast(items => items.slice(0, -1)); setDraft(previous); };
    const redo = () => { const next = future[0]; if (!next || !draft)
        return; setPast(items => [...items, draft]); setFuture(items => items.slice(1)); setDraft(next); };
    /** Saves the draft, or a document edited elsewhere (the manual screen editor), as a new version. */
    async function persistManual(next: StudioDocument | null = draft, feedback = 'Manual canvas edits'): Promise<Version | null> {
        if (!next || (next === draft && !dirty) || saving || saveInFlight.current)
            return null;
        saveInFlight.current = true;
        setSaving(true);
        setSaveConflict(false);
        setError('');
        try {
            const payload = JSON.stringify({ projectId: project.id, expectedVersionId: headVersion.current, parentVersionId: active?.id || null, document: next, feedback });
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
            const newRoot=newlyAddedScreenRoot(draft,data.version.document);if(newRoot)setNodeId(newRoot.id);
            setDraft(current => next !== draft || JSON.stringify(current) === JSON.stringify(draft) ? data.version.document : current);
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
    const updateText = (key: keyof Omit<Design,'sectionOrder'>, label: string, multiline = false) => isDesign(draft) ? <TextField key={key} label={label} value={String(draft[key])} onChange={event => update(key, event.target.value)} multiline={multiline} minRows={multiline ? 3 : undefined} disabled={saving} slotProps={{ htmlInput: { maxLength: 2000 } }}/> : null;
    const screenToolbarAt = useFloatingAnchor(canvasSectionRef, `[data-screen-id="${selectedScreenId}"] [data-screen-frame]`, boardMode && !!selectedScreen?.document && !manualEditing);
    useEffect(()=>{
        if(!selectedScreenId)return;
        const onKey=(event:KeyboardEvent)=>{const target=event.target as HTMLElement|null;if(event.key!=='Escape'||manualEditing||(target&&(['INPUT','TEXTAREA','SELECT'].includes(target.tagName)||target.isContentEditable||target.closest('[role="dialog"],[role="menu"]'))))return;setSelectedScreenId(null);setScreenSelection(null);};
        window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
    },[selectedScreenId,manualEditing]);
    const [confirmRemoveScreen,setConfirmRemoveScreen]=useState<BoardScreen|null>(null);
    const replaceScreen=(next:Partial<BoardScreen>&{id:string})=>setScreens(items=>items.map(item=>item.id===next.id?{...item,...next}:item));
    /** Commits a new version of a screen (manual edits, restores) and updates the board. */
    async function saveScreen(screen:BoardScreen,document:HtmlScreenDocument,feedback:string):Promise<boolean>{
        if(screenSaving)return false;
        setScreenSaving(true);setError('');
        try{
            const response=await fetch('/api/studio/screens',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:project.id,screenId:screen.id,expectedVersionId:screen.headVersionId,requestId:crypto.randomUUID(),document,feedback})});
            const data=await response.json();
            if(!response.ok)throw new Error(data.error||'Could not save this screen.');
            replaceScreen({id:screen.id,name:data.screen.name,device:data.screen.device,headVersionId:data.version.id,updatedAt:data.screen.updated_at,document:data.version.document});
            return true;
        }catch(cause){setError(cause instanceof Error?cause.message:'Could not save this screen.');return false;}
        finally{setScreenSaving(false);}
    }
    async function patchScreen(screenId:string,change:Record<string,unknown>){
        const response=await fetch('/api/studio/screens',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:project.id,screenId,...change})});
        const data=await response.json();
        if(!response.ok)throw new Error(data.error||'The screen could not be updated.');
        return data.screen as {id:string;name:string;x:number;y:number};
    }
    const moveScreen=(screenId:string,x:number,y:number)=>{replaceScreen({id:screenId,x,y});void patchScreen(screenId,{x,y}).catch(cause=>setError(cause instanceof Error?cause.message:'The screen could not be moved.'));};
    async function removeScreen(screen:BoardScreen){
        try{await patchScreen(screen.id,{remove:true});setScreens(items=>items.filter(item=>item.id!==screen.id));deselectScreen();}
        catch(cause){setError(cause instanceof Error?cause.message:'The screen could not be removed.');}
    }
    /** Generate › Desktop/Tablet/Mobile version: agents rebuild the screen's sections for another device beside it. */
    async function requestDeviceVersion(screen:BoardScreen,device:'mobile'|'tablet'|'desktop'){
        const text=`Create a ${device} version of ${screen.name}.`;
        try{
            const response=await fetch('/api/studio/notes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:project.id,versionId:null,anchor:'page',mentionedRole:null,text,displayMessage:text,screenId:screen.id,deviceVersion:device,requestId:crypto.randomUUID()})});
            const data=await response.json();
            if(!response.ok)throw new Error(data.error||'Could not start the device version.');
            setLeftPanel('guild');setLeftOpen(true);window.dispatchEvent(new Event('guildos:tasks-updated'));
            setProviderNotice(`The agents are building a ${device} version of ${screen.name}.`);
        }catch(cause){setError(cause instanceof Error?cause.message:'Could not start the device version.');}
    }
    // New screens and agent edits arrive while you work: the board refreshes quietly.
    useEffect(()=>{
        if(!boardMode)return;
        const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
        async function poll(){
            try{if(!document.hidden&&!manualEditing){const response=await fetch(`/api/studio/screens?projectId=${project.id}`,{cache:'no-store',signal:controller.signal});if(response.ok){const data=await response.json();setScreens(current=>JSON.stringify(current.map(item=>[item.id,item.headVersionId,item.x,item.y,item.name]))===JSON.stringify((data.screens as BoardScreen[]).map(item=>[item.id,item.headVersionId,item.x,item.y,item.name]))?current:data.screens);}}}
            catch{/* Keep the current board during a transient failure. */}
            finally{if(!controller.signal.aborted)timer=setTimeout(poll,3000);}
        }
        timer=setTimeout(poll,3000);return()=>{controller.abort();clearTimeout(timer);};
    },[boardMode,manualEditing,project.id]);
    // Open on the board's first screen.
    const boardCentered=useRef(false);
    useEffect(()=>{
        if(!boardMode||boardCentered.current)return;
        const first=screens[0];
        const frame=requestAnimationFrame(()=>{const element=canvasRef.current;if(!element)return;const scale=zoom/100;const cx=(CANVAS_WORKSPACE_MARGIN+(first?.x??0)+(first?HTML_DEVICE_FRAME[first.device].width/2:200))*scale,cy=(CANVAS_WORKSPACE_MARGIN+(first?.y??0)+380)*scale;element.scrollLeft=cx-element.clientWidth/2;element.scrollTop=cy-element.clientHeight/2;boardCentered.current=true;});
        return()=>cancelAnimationFrame(frame);
    },[boardMode,screens,zoom]);
    const openComposer = (mode:ScopeMode) => {setLeftPanel('guild');setLeftOpen(true);setScopeRequest({mode,at:Date.now()});};
    const artboardWidth = isCanvas(draft) ? draft.width : mobile ? 390 : 1100;
    const artboardHeight = isCanvas(draft) ? draft.height : 1800;
    const workspaceWidth = canvasDocument || boardMode ? CANVAS_WORKSPACE_SIZE : artboardWidth;
    const workspaceHeight = canvasDocument || boardMode ? CANVAS_WORKSPACE_SIZE : artboardHeight;
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
                const image:CanvasNode={id:crypto.randomUUID(),type:'image',name:file.name.slice(0,100)||'Image',x:Math.round(Math.max(-19000,Math.min(19000,centerX-160))),y:Math.round(Math.max(-19000,Math.min(19000,centerY-110))),width:320,height:220,fill:'#ffffff',stroke:'#ffffff',strokeWidth:0,radius:8,opacity:1,text:'',fontSize:16,fontWeight:400,assetId:result.id,imageFit:'cover'};
                const parent=current.nodes.find(item=>item.id===nodeId&&item.layout)||current.nodes.find(item=>item.id===current.nodes.find(selected=>selected.id===nodeId)?.parentId&&item.layout)||containingFrame(image,current.nodes);if(parent)image.parentId=parent.id;if(parent?.flow||current.nodes.some(item=>positionMode(item)==='auto')){image.flow=true;image.sizing={width:'fill-container',height:'hug-contents'};}
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
            const parent=current.nodes.find(item=>item.id===nodeId&&item.layout)||current.nodes.find(item=>item.id===current.nodes.find(selected=>selected.id===nodeId)?.parentId&&item.layout)||containingFrame(node,current.nodes);if(parent)node.parentId=parent.id;if(parent?.flow||current.nodes.some(item=>positionMode(item)==='auto')){node.flow=true;node.sizing={width:'hug-contents',height:'hug-contents'};}
            setDraft({...current,nodes:[...current.nodes,node]});setNodeId(node.id);
        }
        iconReplaceId.current=null;setIconPickerOpen(false);setIconQuery('');setTool('select');setRightMode('properties');
    };
    const alignSelected = (position:'left'|'center'|'right'|'top'|'middle'|'bottom') => {
        if(!selectedNode||!isCanvas(draft))return;
        const frame=draft.nodes.find(node=>node.id===selectedNode.parentId&&node.type==='frame')||containingFrame(selectedNode,draft.nodes);
        const workspace=canvasRef.current?.querySelector<HTMLElement>('[data-testid="manual-canvas"]');
        const measured=frame&&workspace?measureCanvasNode(workspace,frame):frame;
        const bounds={x:0,y:0,width:measured?.width??draft.width,height:measured?.height??draft.height};
        const x=position==='left'?bounds.x:position==='center'?bounds.x+(bounds.width-selectedNode.width)/2:position==='right'?bounds.x+bounds.width-selectedNode.width:selectedNode.x;
        const y=position==='top'?bounds.y:position==='middle'?bounds.y+(bounds.height-selectedNode.height)/2:position==='bottom'?bounds.y+bounds.height-selectedNode.height:selectedNode.y;
        patchNode({x:Math.round(x),y:Math.round(y)});
    };
    const fitTextHeight = () => {
        if(selectedNode&&positionMode(selectedNode)==='auto'){patchNode({sizing:{width:selectedNode.sizing?.width||'fill-container',height:'hug-contents'}});return;}
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
    const patchNode = (patch:Partial<CanvasNode>) => {
        if(!isCanvas(draft)||!selectedNode)return;
        const current=normalizeCanvasPositions(draft);
        const original=current.nodes.find(node=>node.id===nodeId)!;
        const workspace=canvasRef.current?.querySelector<HTMLElement>('[data-testid="manual-canvas"]');
        const geometry=workspace?measureCanvasNode(workspace,original):original;
        if(['x','y','width','height'].some(key=>key in patch)||patch.positionMode==='absolute')patch={...geometry,...patch,positionMode:'absolute'};
        if(patch.radius!==undefined&&positionMode({...original,...patch})==='auto'&&original.designSystem)patch={...patch,radius:snapToGrid(patch.radius,1000)};
        if(patch.positionMode==='auto')patch={...patch,flow:true,sizing:original.sizing||{width:'fixed',height:original.type==='text'?'hug-contents':'fixed'}};
        commitCanvas();setDraft({...current,nodes:current.nodes.map(node=>node.id===nodeId?{...node,...patch}:node)});
    };
    const deleteCanvasNode = (id:string) => {if(!isCanvas(draft))return;const target=draft.nodes.find(node=>node.id===id);if(!target)return;const removed=new Set([id]);if(target.flow)for(let pass=0;pass<draft.nodes.length;pass++)for(const node of draft.nodes)if(node.parentId&&removed.has(node.parentId))removed.add(node.id);commitCanvas();setDraft({...draft,deletedIds:[...new Set([...(draft.deletedIds||[]),...removed])],nodes:draft.nodes.filter(node=>!removed.has(node.id)).map(node=>node.parentId&&removed.has(node.parentId)?{...node,parentId:undefined}:node)});if(removed.has(nodeId))setNodeId('');};
    const removeNode = () => {if(nodeId)deleteCanvasNode(nodeId);};
    const copyNode = () => {if(!isCanvas(draft)||!selectedNode)return;const ids=new Set([selectedNode.id]);if(selectedNode.flow)for(let pass=0;pass<draft.nodes.length;pass++)for(const item of draft.nodes)if(item.parentId&&ids.has(item.parentId))ids.add(item.id);copiedNode.current=structuredClone([selectedNode,...draft.nodes.filter(item=>item.id!==selectedNode.id&&ids.has(item.id))]);pasteCount.current=0;};
    const pasteNode = () => {if(!isCanvas(draft)||!copiedNode.current)return;commitCanvas();const source=copiedNode.current,offset=24*(++pasteCount.current),ids=new Map(source.map(item=>[item.id,crypto.randomUUID()]));const nodes=source.map(item=>({...structuredClone(item),id:ids.get(item.id)!,name:item.name+' copy',parentId:item.parentId?(ids.get(item.parentId)||item.parentId):undefined,x:item.x+(item.id===source[0].id?offset:0),y:item.y+(item.id===source[0].id?offset:0)}));setDraft({...draft,nodes:[...draft.nodes,...nodes]});setNodeId(nodes[0].id);setTool('select');setRightMode('properties');};
    const reorderCanvasNode = (sourceId:string,targetId:string,after=false) => {
        if(!isCanvas(draft))return;
        const nodes=reorderCanvasSiblings(draft.nodes,sourceId,targetId,after);
        if(!nodes)return;
        commitCanvas();setDraft({...draft,nodes});setFuture([]);
    };
    const designSectionOrder = !isDesign(draft) ? ['hero','features','closing'] as const : draft.sectionOrder || ['hero','features','closing'];
    const orderedDesignLayers = [...layers.filter(item=>item.id==='page'||item.id==='header'),...designSectionOrder.map(id=>layers.find(item=>item.id===id)!).filter(Boolean),...layers.filter(item=>item.id==='footer')];
    const orderedCanvasNodes = isCanvas(draft) ? (draft.nodes.some(node=>node.flow)?[...draft.nodes]:[...draft.nodes].reverse()) : [];
    const canvasChildren = new Map<string, CanvasNode[]>();
    const canvasChildIds = new Set<string>();
    for (const node of orderedCanvasNodes) {
        if (node.type === 'frame'&&!node.flow&&!node.positionMode) continue;
        const parent = isCanvas(draft) ? draft.nodes.find(item=>item.id===node.parentId)||containingFrame(node, draft.nodes) : undefined;
        if (parent) {
            canvasChildIds.add(node.id);
            canvasChildren.set(parent.id, [...(canvasChildren.get(parent.id) || []), node]);
        }
    }
    const topLevelCanvasNodes = orderedCanvasNodes.filter(node => !canvasChildIds.has(node.id));
    const renderCanvasLayerRow = (node: CanvasNode, nested = false) => <ListItemButton className="group" key={node.id} draggable onDragStart={event=>{draggedNodeId.current=node.id;setLayerDragPreview(event,node.name);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',node.id);}} onDragOver={event=>{event.preventDefault();setDragOverNodeId(node.id);}} onDragLeave={()=>setDragOverNodeId(current=>current===node.id?null:current)} onDrop={event=>{event.preventDefault();const source=draggedNodeId.current||event.dataTransfer.getData('text/plain');reorderCanvasNode(source,node.id,event.clientY>event.currentTarget.getBoundingClientRect().top+event.currentTarget.getBoundingClientRect().height/2);draggedNodeId.current=null;setDragOverNodeId(null);}} onDragEnd={()=>{draggedNodeId.current=null;setDragOverNodeId(null);}} selected={nodeId===node.id} onClick={()=>{setNodeId(node.id);setTool('select');setRightMode('properties');}} sx={{borderRadius:1,py:.75,pl:nested?3:1.5,cursor:'grab',borderTop:dragOverNodeId===node.id?'2px solid #557c63':'2px solid transparent','&.Mui-selected':{bgcolor:'#e9f1eb',color:'#386650'},'&:active':{cursor:'grabbing'}}}><ListItemIcon sx={{minWidth:24,color:'text.disabled'}}><DragIndicatorOutlined size={15}/></ListItemIcon><ListItemIcon sx={{minWidth:24,color:'inherit'}}>{node.type==='text'?<TextFieldsOutlined size={17}/>:node.type==='icon'?<ShapesOutlined size={16}/>:node.type==='image'?<ImagePlusOutlined size={16}/>:node.type==='ellipse'?<CircleOutlined size={15}/>:node.type==='container'?<LayersOutlined size={16}/>:node.type==='frame'?<CropFreeOutlined size={16}/>:<RectangleOutlined size={16}/>}</ListItemIcon>{editingNodeName===node.id?<TextField autoFocus variant="standard" size="small" value={nodeNameDraft} slotProps={{htmlInput:{'aria-label':'Layer name',maxLength:100}}} onClick={event=>event.stopPropagation()} onChange={event=>setNodeNameDraft(event.target.value)} onBlur={()=>{if(cancelNodeRename.current){cancelNodeRename.current=false;return;}renameNode(node.id,nodeNameDraft);}} onKeyDown={event=>{event.stopPropagation();if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}if(event.key==='Escape'){cancelNodeRename.current=true;setEditingNodeName(null);}}} sx={{flex:1,minWidth:0,'& .MuiInputBase-input':{fontSize:12,py:.25}}}/>:<ListItemText primary={<span onDoubleClick={event=>{event.stopPropagation();setNodeNameDraft(node.name);setEditingNodeName(node.id);}} title="Double-click to rename">{node.name}</span>} slotProps={{primary:{sx:{fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}}}/>}<IconButton className="opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity duration-150" size="small" aria-label={'Toggle visibility '+node.name} onClick={event=>{event.stopPropagation();if(!isCanvas(draft))return;commitCanvas();setDraft({...draft,nodes:draft.nodes.map(item=>item.id===node.id?{...item,hidden:!item.hidden}:item)});}}>{node.hidden?<VisibilityOffOutlined size={14}/>:<VisibilityOutlined size={14}/>}</IconButton><IconButton className="opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity duration-150" size="small" aria-label={'Delete layer '+node.name} onClick={event=>{event.stopPropagation();deleteCanvasNode(node.id);}}><Trash2 size={14}/></IconButton></ListItemButton>;
    const renderFlowLayerTree = (node:CanvasNode,nested=false):React.ReactNode => {
        const children=canvasChildren.get(node.id)||[];
        const collapsed=collapsedLayerIds.has(node.id);
        return <Box component="li" key={node.id} sx={{listStyle:'none'}}>
            <Box sx={{display:'flex',alignItems:'center'}}>
                {children.length?<IconButton size="small" aria-label={`${collapsed?'Expand':'Collapse'} ${node.name}`} aria-expanded={!collapsed} onClick={()=>setCollapsedLayerIds(current=>{const next=new Set(current);if(next.has(node.id))next.delete(node.id);else next.add(node.id);return next;})} sx={{width:25,height:32,flex:'none',color:'text.secondary'}}>{collapsed?<ChevronRightOutlined size={15}/>:<ExpandMoreOutlined size={15}/>}</IconButton>:<Box sx={{width:25,flex:'none'}}/>}
                <Box sx={{flex:1,minWidth:0}}>{renderCanvasLayerRow(node,nested)}</Box>
            </Box>
            {children.length>0&&!collapsed&&<Box sx={{ml:1.5,borderLeft:'1px solid #e2e8e3'}}><List disablePadding>{children.map(child=>child.flow?renderFlowLayerTree(child,true):renderCanvasLayerRow(child,true))}</List></Box>}
        </Box>;
    };
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
      const zoomBy=(factor:number,clientX:number,clientY:number)=>{const old=zoomRef.current,next=Math.max(10,Math.min(300,old*factor));if(next===old)return;const bounds=element.getBoundingClientRect();recordZoomAnchor(clientX-bounds.left,clientY-bounds.top);zoomRef.current=next;if(!frame)frame=requestAnimationFrame(()=>{frame=0;setZoom(zoomRef.current);});};
      // Scrolling the board zooms it; pinch (ctrl/⌘ + wheel, Safari gestures) is handled below for the whole page.
      const wheel=(event:WheelEvent)=>{if(event.ctrlKey||event.metaKey)return;event.preventDefault();zoomBy(Math.exp(-event.deltaY*.005),event.clientX,event.clientY);};
      element.addEventListener('wheel',wheel,{passive:false});
      // Pinch never zooms the page: over the board (including the floating tool dock) it zooms the board.
      const release=captureBrowserZoom((target,x,y)=>{if(target instanceof Element&&target.closest('[role="dialog"]'))return false;const bounds=element.getBoundingClientRect();return x>=bounds.left&&x<=bounds.right&&y>=bounds.top&&y<=bounds.bottom;},zoomBy);
      return()=>{element.removeEventListener('wheel',wheel);release();if(frame)cancelAnimationFrame(frame);};
    },[]);
    useLayoutEffect(()=>{const element=canvasRef.current;const anchor=zoomAnchorRef.current;if(element&&anchor&&zoom!==anchor.fromZoom){const ratio=zoom/anchor.fromZoom;element.scrollLeft=anchor.paddingLeft+(anchor.scrollLeft+anchor.anchorX-anchor.paddingLeft)*ratio-anchor.anchorX;element.scrollTop=anchor.paddingTop+(anchor.scrollTop+anchor.anchorY-anchor.paddingTop)*ratio-anchor.anchorY;zoomAnchorRef.current=null;}committedZoomRef.current=zoom;zoomRef.current=zoom;},[zoom]);
    useEffect(()=>{if(!isCanvas(draft)){canvasCentered.current=false;return;}if(canvasCentered.current)return;const frame=requestAnimationFrame(()=>{const element=canvasRef.current;if(!element)return;const origin=40000*zoom/100;element.scrollLeft=origin-element.clientWidth/2;element.scrollTop=origin-element.clientHeight/2;canvasCentered.current=true;});return()=>cancelAnimationFrame(frame);},[isCanvas(draft),zoom]);
    useEffect(() => {
        const shortcuts=(event:KeyboardEvent)=>{if((event.target as HTMLElement).isContentEditable||event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)return;if(isCanvas(draft)&&selectedNode&&positionMode(selectedNode)==='auto'&&!event.metaKey&&!event.ctrlKey&&(event.key==='ArrowUp'||event.key==='ArrowDown')){const siblingId=adjacentCanvasSiblingId(draft.nodes,selectedNode.id,event.key as 'ArrowUp'|'ArrowDown');if(siblingId){event.preventDefault();reorderCanvasNode(selectedNode.id,siblingId,event.key==='ArrowDown');}return;}if(isCanvas(draft)&&selectedNode&&positionMode(selectedNode)==='absolute'&&!event.metaKey&&!event.ctrlKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const step=event.shiftKey?10:1;patchNode({x:selectedNode.x+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),y:selectedNode.y+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)});return;}if(event.key==='Delete'||event.key==='Backspace'){if(isCanvas(draft)&&nodeId){event.preventDefault();removeNode();}}if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='c'){if(isCanvas(draft)&&nodeId){event.preventDefault();copyNode();}}if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='v'){if(isCanvas(draft)&&copiedNode.current){event.preventDefault();pasteNode();}}if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='d'){if(isCanvas(draft)&&selectedNode){event.preventDefault();copyNode();pasteNode();}}if(!event.metaKey&&!event.ctrlKey){const key=event.key.toLowerCase();const tools:Record<string,CanvasTool>={v:'select',h:'hand',f:'frame',r:'rectangle',o:'ellipse',t:'text',l:'line',p:'path'};if(tools[key])setTool(tools[key]);}};
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
     {boardMode?(selectedScreen?.document?<Stack spacing={1.5}>{screenSelection&&<Box sx={{pb:1.5,borderBottom:'1px solid',borderColor:'divider'}}><Typography sx={inspectorHeading}>Selected</Typography><Typography variant="body2" sx={{mt:.75}}><Box component="code" sx={{fontSize:12,bgcolor:'#eef3f0',px:.5,borderRadius:.5}}>{screenSelection.tag}</Box> in section <b>{screenSelection.sectionId}</b></Typography>{screenSelection.text&&<Typography variant="caption" color="text.secondary" sx={{display:'block',mt:.5,overflowWrap:'anywhere'}}>“{screenSelection.text}”</Typography>}</Box>}<Typography sx={inspectorHeading}>Screen</Typography><Typography variant="body2">{selectedScreen.document.name} · {selectedScreen.document.device} {HTML_DEVICE_FRAME[selectedScreen.document.device].width}px · {selectedScreen.document.sections.length} sections</Typography><Box sx={{display:'flex',gap:.75,flexWrap:'wrap'}}>{Object.entries(selectedScreen.document.tokens.colors).map(([name,color])=><Tooltip key={name} title={`${name} ${color}`}><Box aria-label={`${name} ${color}`} sx={{width:22,height:22,borderRadius:'50%',bgcolor:color,border:'1px solid #d8e0e5'}}/></Tooltip>)}</Box><Typography variant="caption" color="text.secondary">{[selectedScreen.document.tokens.fontDisplay,selectedScreen.document.tokens.fontSans||'Inter'].filter(Boolean).join(' / ')}</Typography></Stack>:<Typography variant="body2" color="text.secondary">Select a screen on the board to see its sections, colours and fonts.</Typography>):!draft?<Stack spacing={2}><Typography variant="h6">A blank beginning</Typography><Typography variant="body2" color="text.secondary">Create your own design with text and shapes, or generate a draft from your brief.</Typography><Button variant="outlined" onClick={startBlank}>Start manually</Button></Stack>:isCanvas(draft)?selectedNode?<Stack spacing={0}>
      <Box sx={{pb:2}}><Typography sx={inspectorHeading}>Layer</Typography><TextField label="Layer name" size="small" fullWidth value={selectedNode.name} onChange={event=>patchNode({name:event.target.value})} slotProps={{htmlInput:{maxLength:100}}} sx={{mt:1}}/></Box>
      <Divider/>
      <Box sx={{py:2}}><Typography sx={inspectorHeading}>Position and size</Typography><TextField select label="Position mode" size="small" value={positionMode(selectedNode)} onChange={event=>patchNode({positionMode:event.target.value as CanvasNode['positionMode']})} sx={{mt:1.25}}><MenuItem value="auto">Auto layout</MenuItem><MenuItem value="absolute">Absolute</MenuItem></TextField><Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:1,mt:1.25}}>{(['x','y','width','height'] as const).map(key=><TextField key={key} size="small" fullWidth label={{x:'X',y:'Y',width:'Width',height:'Height'}[key]} type="number" value={Math.round(selectedGeometry?.[key]??selectedNode[key])} onChange={event=>patchNode({[key]:key==='width'||key==='height'?Math.max(1,Number(event.target.value)):Number(event.target.value)})} slotProps={{htmlInput:{'aria-label':{x:'X position',y:'Y position',width:'Width',height:'Height'}[key]}}}/>)}</Box>{!['line','path'].includes(selectedNode.type)&&<TextField label="Border radius" size="small" type="number" fullWidth value={selectedNode.radius} onChange={event=>patchNode({radius:Math.max(0,Math.min(1000,Number(event.target.value)))})} sx={{mt:1.25}}/>}</Box>
      <Divider/>
      {selectedNode.flow?<AutoLayoutProperties node={selectedNode} document={draft} onPatch={patchNode} onAdd={(type,direction)=>{commitCanvas();const node:CanvasNode={id:crypto.randomUUID(),type,positionMode:'auto',name:type==='text'?'Text':direction==='row'?'Row':'Column',x:0,y:0,width:100,height:24,fill:type==='text'?'#202b38':'#ffffff',stroke:'#ffffff',strokeWidth:0,radius:type==='container'?8:0,opacity:1,text:type==='text'?'Your text':'',fontSize:16,fontWeight:400,flow:true,parentId:selectedNode.id,sizing:{width:'fill-container',height:'hug-contents'},...(type==='container'?{layout:{...defaultLayout,direction:direction||'column'}}:{})};setDraft({...draft,nodes:[...draft.nodes,node]});setNodeId(node.id);}}/>:<Box sx={{py:2}}><Typography sx={inspectorHeading}>Position</Typography><Typography variant="caption" color="text.secondary" sx={{display:'block',mt:1.25,mb:.5}}>Align within {selectedFrame?'frame':'canvas'}</Typography>
       <Box role="group" aria-label="Layer alignment" sx={{display:'grid',gridTemplateColumns:'repeat(6,minmax(0,1fr))',gap:.25,p:.25,borderRadius:1.5,bgcolor:'#f0f3f5'}}>{alignmentTools.map(({position,Icon},index)=><Tooltip key={position} title={`Align ${position}`}><IconButton size="small" aria-label={`Align ${position} within ${selectedFrame?'frame':'canvas'}`} onClick={()=>alignSelected(position)} sx={{minWidth:0,width:'100%',height:34,borderRadius:1,color:'#34424d',borderLeft:index===3?'1px solid #d1d9de':undefined,'&:hover':{bgcolor:'#dfe7eb'}}}><Icon size={17} strokeWidth={1.8}/></IconButton></Tooltip>)}</Box>
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
       {selectedNode.type!=='image'&&<><Box sx={{display:'grid',gridTemplateColumns:selectedNode.type==='icon'?'1fr':'repeat(2,minmax(0,1fr))',gap:1,mt:1.25}}>{(selectedNode.type==='icon'?([{label:'Icon color',key:'fill'}] as const):([{label:'Fill',key:'fill'},{label:'Stroke',key:'stroke'}] as const)).map(item=><Box key={item.key}><Typography variant="caption" color="text.secondary">{item.label}</Typography><Box sx={{display:'flex',alignItems:'center',gap:.75,mt:.25,p:.5,border:'1px solid #d8e0e5',borderRadius:1,minWidth:0}}><input type="color" aria-label={`${item.label} color`} value={selectedNode[item.key]} onChange={event=>patchNode({[item.key]:event.target.value})} style={{width:28,height:26,padding:0,border:0,background:'transparent',cursor:'pointer',flex:'none'}}/><Typography variant="caption" sx={{fontFamily:'monospace',fontSize:11,overflow:'hidden',textOverflow:'ellipsis'}}>{selectedNode[item.key].toUpperCase()}</Typography></Box></Box>)}</Box><Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:1,mt:1.25}}><TextField label={selectedNode.type==='icon'?'Line weight':'Stroke width'} size="small" type="number" value={selectedNode.strokeWidth} onChange={event=>patchNode({strokeWidth:selectedNode.type==='icon'?Math.max(.5,Math.min(4,Number(event.target.value))):Math.max(0,Math.min(100,Number(event.target.value)))})}/></Box></>}
       <Stack direction="row" sx={{mt:1.5,justifyContent:"space-between"}}><Typography variant="caption" color="text.secondary">Opacity</Typography><Typography variant="caption">{Math.round(selectedNode.opacity*100)}%</Typography></Stack><Slider size="small" value={selectedNode.opacity*100} aria-label="Layer opacity" onChange={(_,value)=>patchNode({opacity:Number(value)/100})} sx={{mt:.25}}/>
      </Box>
     </Stack>:<Stack spacing={2.5}>{tool==='frame'&&<><Typography variant="h6">Frame</Typography><TextField select label="Device preset" value={framePreset} onChange={event=>setFramePreset(event.target.value)}>{framePresets.map(item=><MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}</TextField></>}<Typography variant="body2" color="text.secondary">Pick a tool and draw on the workspace. Select a layer to edit its properties.</Typography></Stack>:isDesign(draft)?<><TextField select label="Selected section" value={layer} onChange={event=>setLayer(event.target.value as Layer)} sx={{mb:3}}>{layers.map(item=><MenuItem key={item.id} value={item.id}>{item.title}</MenuItem>)}</TextField><Stack spacing={2.5}>
      {layer==='page'&&<>{updateText('brand','Brand name')}<TextField select label="Typography" value={draft.style} onChange={event=>update('style',event.target.value)}>{['editorial','bold','minimal'].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField><TextField select label="Color palette" value={draft.palette} onChange={event=>update('palette',event.target.value)}>{['ocean','moss','clay','midnight'].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField></>}
      {layer==='header'&&updateText('brand','Brand name')}{layer==='hero'&&<>{updateText('eyebrow','Eyebrow')}{updateText('headline','Headline',true)}{updateText('description','Description',true)}{updateText('cta','Button label')}</>}{layer==='features'&&draft.features.map((feature,index)=><Accordion key={index} defaultExpanded={index===0} disableGutters><AccordionSummary expandIcon={<ExpandMoreOutlined/>}><Typography variant="body2">Benefit {index+1}</Typography></AccordionSummary><AccordionDetails><Stack spacing={2}><TextField label={'Benefit '+(index+1)+' title'} value={feature.title} onChange={event=>updateFeature(index,'title',event.target.value)}/><TextField label={'Benefit '+(index+1)+' description'} value={feature.description} multiline minRows={3} onChange={event=>updateFeature(index,'description',event.target.value)}/></Stack></AccordionDetails></Accordion>)}{layer==='closing'&&<>{updateText('closingTitle','Closing heading',true)}{updateText('closingDescription','Closing description',true)}{updateText('cta','Button label')}</>}{layer==='footer'&&updateText('brand','Brand name')}<Divider/><Typography variant="caption" color="text.secondary">Save changes to create a new version without using model tokens.</Typography>
     </Stack></>:null}
    </Box>;
   return <ThemeProvider theme={tooltipTheme}><Box className="design-workspace" sx={{bgcolor:'background.default',color:'text.primary'}}>
  <DeleteProjectDialog project={deleteProjectOpen?{id:project.id,name:projectName}:null} onClose={()=>setDeleteProjectOpen(false)} onDeleted={()=>{router.replace('/studio/projects');router.refresh();}}/>
  <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="Upload canvas image" onChange={event=>{const file=event.currentTarget.files?.[0];if(file)void uploadCanvasImage(file);}}/>
  <Stack component="header" direction="row" spacing={1.5} sx={{minHeight:58,px:2,bgcolor:'background.default',alignItems:'center',flexWrap:{xs:'wrap',sm:'nowrap'},py:{xs:1,sm:0}}}>
   <Link href="/studio" className="editor-logo" aria-label="Back to dashboard"><GuildOSMark/></Link><Stack direction="row" className="project-title-menu" sx={{alignItems:'center',gap:.5,minWidth:0,maxWidth:340,bgcolor:'#edf2ef',borderRadius:'10px',p:.5,pl:1,ml:'0 !important'}}>{editingProjectName?<TextField autoFocus size="small" value={projectNameDraft} slotProps={{htmlInput:{'aria-label':'Project name',maxLength:100}}} onChange={event=>setProjectNameDraft(event.target.value)} onBlur={()=>{if(cancelProjectRename.current){cancelProjectRename.current=false;return;}void renameProject();}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void renameProject();event.currentTarget.blur();}if(event.key==='Escape'){cancelProjectRename.current=true;setProjectNameDraft(projectName);setEditingProjectName(false);}}} sx={{minWidth:0,maxWidth:230,'& .MuiInputBase-input':{py:.45,px:.5,fontSize:'clamp(14px, 0.9vw, 17px)',fontWeight:650}}}/>:<><Typography component="h1" variant="body2" onDoubleClick={()=>{setProjectNameDraft(projectName);setEditingProjectName(true);}} sx={{fontWeight:650,fontSize:'clamp(14px, 0.9vw, 17px)',maxWidth:230,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:'text',px:.6,py:.5}} title="Double-click to rename">{projectName}</Typography><IconButton size="small" aria-label="Project actions" aria-haspopup="menu" aria-expanded={!!projectMenuAnchor} onClick={event=>setProjectMenuAnchor(event.currentTarget)} sx={{width:28,height:28,flex:'none',color:'#65746b'}}><ProjectMenuIcon size={15}/></IconButton></>}</Stack><Menu anchorEl={projectMenuAnchor} open={!!projectMenuAnchor} onClose={()=>setProjectMenuAnchor(null)} slotProps={{paper:{sx:{minWidth:230,mt:.5,'& .MuiMenuItem-root':{fontSize:14,lineHeight:1.4,minHeight:44,px:2},'& .MuiListItemText-primary':{fontSize:14,lineHeight:1.4},'& .MuiListItemIcon-root':{minWidth:34},'& svg':{width:17,height:17}}},list:{'aria-label':'Project actions'}}}>
    <MenuItem selected={rightMode==='history'} onClick={()=>{setRightMode(current=>current==='history'?null:'history');setProjectMenuAnchor(null);}}><ListItemIcon><HistoryOutlined size={17}/></ListItemIcon><ListItemText slotProps={{primary:{sx:{fontSize:14,lineHeight:1.4}}}}>{rightMode==='history'?'Hide':'Show'} version history</ListItemText></MenuItem>
    <Divider/>
    <MenuItem disabled={!past.length||saving} onClick={()=>{setProjectMenuAnchor(null);undo();}}><ListItemIcon><UndoOutlined size={17}/></ListItemIcon><ListItemText slotProps={{primary:{sx:{fontSize:14,lineHeight:1.4}}}}>Undo</ListItemText></MenuItem>
    <MenuItem disabled={!future.length||saving} onClick={()=>{setProjectMenuAnchor(null);redo();}}><ListItemIcon><RedoOutlined size={17}/></ListItemIcon><ListItemText slotProps={{primary:{sx:{fontSize:14,lineHeight:1.4}}}}>Redo</ListItemText></MenuItem>
    <MenuItem disabled={!dirty||saving} onClick={()=>{setProjectMenuAnchor(null);void persistManual();}}><ListItemIcon><SaveOutlined size={17}/></ListItemIcon><ListItemText slotProps={{primary:{sx:{fontSize:14,lineHeight:1.4}}}}>Save changes</ListItemText></MenuItem>
    <Divider/>
    <MenuItem disabled={saving} onClick={()=>{setProjectMenuAnchor(null);setDeleteProjectOpen(true);}} sx={{color:'error.main'}}><ListItemIcon sx={{color:'inherit'}}><Trash2 size={17}/></ListItemIcon><ListItemText>Delete project</ListItemText></MenuItem>
   </Menu>
   <Box sx={{flex:1,minWidth:8}}/><Stack direction="row" spacing={.25} sx={{alignItems:'center',display:{xs:'none',md:'flex'}}}>{isDesign(draft)&&<ToggleButtonGroup exclusive size="small" value={mobile?'mobile':'desktop'} onChange={(_,value)=>value&&setMobile(value==='mobile')} aria-label="Preview size"><ToggleButton value="desktop" aria-label="Desktop preview" sx={{p:.4}}><DesktopWindowsOutlined size={15}/></ToggleButton><ToggleButton value="mobile" aria-label="Mobile preview" sx={{p:.4}}><SmartphoneOutlined size={15}/></ToggleButton></ToggleButtonGroup>}</Stack>
   {dirty&&<Chip role="status" size="small" label={saving?'Saving…':'Unsaved'} variant="outlined" color="warning"/>}
   {visiblePipelinePreview&&<Chip role="status" size="small" label={`${visiblePipelinePreview.status==='running'?'Live':'Queued'} · ${agentIdentity[visiblePipelinePreview.role].persona} · ${visiblePipelinePreview.kind==='canvas'?`Stage ${visiblePipelinePreview.stage}/5`:visiblePipelinePreview.phase==='plan'?'Planning':`Sections ${visiblePipelinePreview.document.sections.filter(section=>section.status!=='planned').length}/${visiblePipelinePreview.document.sections.length}`}`} sx={{bgcolor:agentIdentity[visiblePipelinePreview.role].tint,color:agentIdentity[visiblePipelinePreview.role].color,fontWeight:650}}/>}
   {remoteVersion&&<Button size="small" onClick={()=>dirty?setPendingVersion(remoteVersion):selectVersion(remoteVersion)}>New version available</Button>}
   <AccountMenu/>
  </Stack>
  <Box className="design-workspace-body" style={{gridTemplateColumns:`${leftOpen?'48px clamp(300px,25vw,360px)':'48px 0px'} minmax(0,1fr) ${rightMode?'clamp(280px,22vw,340px)':'0px'}`}}>
   <Box component="nav" className="editor-rail" aria-label="Editor navigation" sx={{display:'flex',bgcolor:'background.paper',borderRight:'1px solid',borderColor:'divider'}}>
    {[{id:'guild',label:'Project conversation',Icon:ForumOutlined},{id:'file',label:'Layers',Icon:FolderOutlined},{id:'tasks',label:'Tasks',Icon:ClipboardList},{id:'brief',label:'Brief',Icon:ArticleOutlined}].map(item=><Tooltip key={item.id} title={item.label} placement="right"><IconButton aria-label={item.label} aria-pressed={leftOpen&&leftPanel===item.id} onClick={()=>{setLeftPanel(item.id as typeof leftPanel);setLeftOpen(true);}} sx={{width:36,height:36,borderRadius:'8px',color:leftOpen&&leftPanel===item.id?'#426a55':'text.secondary',bgcolor:leftOpen&&leftPanel===item.id?'#eaf1ec':'transparent','&:hover':{bgcolor:'#f1f5f2'}}}><item.Icon size={18}/></IconButton></Tooltip>)}
    <Box sx={{flex:1}}/>
   </Box>
   <Box component="aside" className="design-side-panel layers-panel" aria-label="Layers and versions" sx={{display:leftOpen?'block':'none',bgcolor:'background.paper',borderRight:'1px solid',borderColor:'divider',...(['guild','tasks'].includes(leftPanel)?{display:leftOpen?'flex':'none',flexDirection:'column',overflow:'hidden'}:{})}}>
    {leftPanel==='file'?<><Box sx={{px:2,py:1.25,borderBottom:'1px solid',borderColor:'divider',display:'flex',alignItems:'center',justifyContent:'space-between'}}><Typography variant="subtitle2">Layers</Typography>{isCanvas(draft)&&selectedNode&&<IconButton size="small" aria-label="Delete selected layer" onClick={()=>deleteCanvasNode(selectedNode.id)}><Trash2 size={15}/></IconButton>}<Tooltip title={leftOpen?'Collapse layers':'Expand layers'}><IconButton size="small" aria-label={leftOpen?'Collapse layers':'Expand layers'} onClick={()=>setLeftOpen(open=>!open)}><ViewSidebarOutlined size={17}/></IconButton></Tooltip></Box><Box sx={{p:1}}>{boardMode?<List disablePadding aria-label="Screens">{screens.map(screen=><Box key={screen.id}><ListItemButton selected={screen.id===selectedScreenId} onClick={()=>{if(screen.id!==selectedScreenId)setScreenSelection(null);setSelectedScreenId(screen.id);}} sx={{borderRadius:1,py:.6}}><ListItemText primary={screen.name} secondary={`${screen.device} · ${screen.document?.sections.length??0} sections`} slotProps={{primary:{sx:{fontSize:13,fontWeight:600}},secondary:{sx:{fontSize:11}}}}/></ListItemButton>
     {screen.id===selectedScreenId&&screen.document&&<List disablePadding aria-label={`${screen.name} sections`} sx={{pl:1.5}}>{screen.document.sections.map(section=><ListItemButton key={section.id} disabled sx={{borderRadius:1,py:.35,opacity:'1 !important'}}><ListItemText primary={section.id} secondary={section.status==='ready'?section.kind:section.status==='failed'?`Failed · ${section.error||section.kind}`:`Planned · ${section.kind}`} slotProps={{primary:{sx:{fontSize:12.5}},secondary:{sx:{fontSize:11,color:section.status==='failed'?'error.main':'text.secondary'}}}}/></ListItemButton>)}</List>}</Box>)}
     {!screens.length&&<Typography variant="body2" color="text.secondary" sx={{p:1.5}}>Describe a screen in the chat and the agents add it to the board.</Typography>}</List>:!draft?<Typography variant="body2" color="text.secondary" sx={{p:1.5}}>No layers yet. Start a blank canvas or generate a first draft.</Typography>:isCanvas(draft)?<List disablePadding>{topLevelCanvasNodes.map(node=>node.flow?renderFlowLayerTree(node):node.type==='frame'?<Box component="li" className="group" key={node.id} sx={{listStyle:'none',display:'flex',alignItems:'flex-start'}}><Accordion defaultExpanded disableGutters elevation={0} sx={{flex:1,minWidth:0,bgcolor:'transparent','&:before':{display:'none'},'&.Mui-expanded':{m:0}}}><AccordionSummary expandIcon={<ExpandMoreOutlined size={16}/>} draggable onDragStart={event=>{draggedNodeId.current=node.id;setLayerDragPreview(event,node.name);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',node.id);}} onDragOver={event=>{event.preventDefault();setDragOverNodeId(node.id);}} onDragLeave={()=>setDragOverNodeId(current=>current===node.id?null:current)} onDrop={event=>{event.preventDefault();const source=draggedNodeId.current||event.dataTransfer.getData('text/plain');reorderCanvasNode(source,node.id,event.clientY>event.currentTarget.getBoundingClientRect().top+event.currentTarget.getBoundingClientRect().height/2);draggedNodeId.current=null;setDragOverNodeId(null);}} onDragEnd={()=>{draggedNodeId.current=null;setDragOverNodeId(null);}} onClick={()=>{setNodeId(node.id);setTool('select');setRightMode('properties');}} sx={{minHeight:42,px:1.5,borderRadius:1,bgcolor:nodeId===node.id?'#e9f1eb':'transparent','&.Mui-expanded':{minHeight:42},'& .MuiAccordionSummary-content,& .MuiAccordionSummary-content.Mui-expanded':{my:.5},'& .MuiAccordionSummary-expandIconWrapper':{order:-1,mr:1}}}><ListItemIcon sx={{minWidth:24,color:'text.disabled'}}><DragIndicatorOutlined size={15}/></ListItemIcon><ListItemIcon sx={{minWidth:24,color:'inherit'}}><CropFreeOutlined size={16}/></ListItemIcon>{editingNodeName===node.id?<TextField autoFocus variant="standard" size="small" value={nodeNameDraft} slotProps={{htmlInput:{'aria-label':'Layer name',maxLength:100}}} onClick={event=>event.stopPropagation()} onChange={event=>setNodeNameDraft(event.target.value)} onBlur={()=>{if(cancelNodeRename.current){cancelNodeRename.current=false;return;}renameNode(node.id,nodeNameDraft);}} onKeyDown={event=>{event.stopPropagation();if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}if(event.key==='Escape'){cancelNodeRename.current=true;setEditingNodeName(null);}}} sx={{flex:1,minWidth:0,'& .MuiInputBase-input':{fontSize:12,py:.25}}}/>:<Typography onDoubleClick={event=>{event.stopPropagation();setNodeNameDraft(node.name);setEditingNodeName(node.id);}} title="Double-click to rename" sx={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:12}}>{node.name}</Typography>}</AccordionSummary><AccordionDetails sx={{p:0,pl:1}}><List disablePadding>{(canvasChildren.get(node.id)||[]).map(child=>child.flow?renderFlowLayerTree(child):renderCanvasLayerRow(child,true))}</List></AccordionDetails></Accordion><IconButton className="opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity duration-150" size="small" aria-label={'Toggle visibility '+node.name} onClick={event=>{event.stopPropagation();commitCanvas();setDraft({...draft,nodes:draft.nodes.map(item=>item.id===node.id?{...item,hidden:!item.hidden}:item)});}} sx={{mt:.6}}>{node.hidden?<VisibilityOffOutlined size={14}/>:<VisibilityOutlined size={14}/>}</IconButton></Box>:renderCanvasLayerRow(node))}</List>:<List disablePadding>{orderedDesignLayers.map(item=><ListItemButton key={item.id} draggable={['hero','features','closing'].includes(item.id)} onDragStart={event=>{if(!['hero','features','closing'].includes(item.id)){event.preventDefault();return;}draggedNodeId.current=item.id;setLayerDragPreview(event,item.title);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.id);}} onDragOver={event=>{if(['hero','features','closing'].includes(item.id)){event.preventDefault();setDragOverNodeId(item.id);}}} onDragLeave={()=>setDragOverNodeId(current=>current===item.id?null:current)} onDrop={event=>{event.preventDefault();const source=draggedNodeId.current||event.dataTransfer.getData('text/plain');reorderDesignSection(source,item.id);draggedNodeId.current=null;setDragOverNodeId(null);}} onDragEnd={()=>{draggedNodeId.current=null;setDragOverNodeId(null);}} selected={layer===item.id} onClick={()=>{setLayer(item.id);setRightMode('properties');}} sx={{borderRadius:1,py:1,cursor:['hero','features','closing'].includes(item.id)?'grab':'default',borderTop:dragOverNodeId===item.id?'2px solid #557c63':'2px solid transparent','&.Mui-selected':{bgcolor:'#e9f1eb',color:'#386650'}}}><ListItemIcon sx={{minWidth:30,color:'inherit'}}>{['hero','features','closing'].includes(item.id)?<DragIndicatorOutlined size={15}/>:<LayersOutlined size={17}/>}</ListItemIcon><ListItemText primary={item.title} slotProps={{primary:{sx:{fontSize:12}}}}/></ListItemButton>)}</List>}</Box></>:<>
    {leftPanel==='guild'?<GuildPanel projectId={project.id} versionId={active?.id||null} scopeRequest={scopeRequest} screenTarget={boardMode&&selectedScreen?{screenId:selectedScreen.id,...(screenSelection?{sectionId:screenSelection.sectionId,path:screenSelection.path,preview:screenSelection.preview}:{}),label:screenSelection?`${screenSelection.sectionId}${screenSelection.text?` · “${screenSelection.text.slice(0,40)}”`:''}`:selectedScreen.name}:null} onClearScreenTarget={deselectScreen} selectedContext={selectedNode?{id:selectedNode.id,name:selectedNode.name}:null} layers={isCanvas(draft)?draft.nodes.filter(node=>!node.hidden).map(node=>({id:node.id,name:node.name})):layers.map(item=>({id:item.id,name:item.title}))} initialMention={guildMention} onInitialMentionUsed={()=>setGuildMention(null)} trial={trial}/>:null}
    {leftPanel==='tasks'?<TaskBoard projectId={project.id} view="list"/>:null}
    {leftPanel==='brief'?<Stack spacing={2} sx={{p:2.5}}><Typography variant="h6">Original brief</Typography><Typography variant="body2" color="text.secondary" sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.8}}>{project.brief}</Typography></Stack>:null}
    </>}
   </Box>
   <Box component="aside" className="design-properties-panel" aria-label={rightMode==='history'?'Version history':'Selected element properties'} sx={{display:rightMode?'block':'none',bgcolor:'background.paper',borderLeft:'1px solid',borderColor:'divider',minWidth:0,minHeight:0,overflowY:'auto'}}>{rightMode==='history'?boardMode?(selectedScreen?<ScreenVersions projectId={project.id} screenId={selectedScreen.id} screenName={selectedScreen.name} headVersionId={selectedScreen.headVersionId} busy={screenSaving} onClose={()=>setRightMode(null)} onRestore={version=>void saveScreen(selectedScreen,version.document,'Restored a previous version')}/>:<Typography variant="body2" color="text.secondary" sx={{p:2}}>Select a screen to see its versions.</Typography>):<><Stack direction="row" sx={{px:2,py:1.5,alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid',borderColor:'divider'}}><Typography variant="subtitle2">Version history</Typography><IconButton size="small" aria-label="Close version history" onClick={()=>setRightMode(null)}><CloseOutlined size={17}/></IconButton></Stack><Typography variant="caption" color="text.secondary" sx={{display:'block',px:2,py:1.5}}>Select a version to restore it.</Typography><List sx={{px:1}}>{versions.map((item,index)=><ListItemButton key={item.id} selected={selected===item.id} disabled={saving} onClick={()=>dirty?setPendingVersion(item):selectVersion(item)} sx={{borderRadius:1,mb:.5}}><ListItemIcon sx={{minWidth:28,color:selected===item.id?'primary.main':'text.secondary'}}><HistoryOutlined size={17}/></ListItemIcon><ListItemText primary={'Version '+(versions.length-index)} secondary={<>{new Date(item.created_at).toISOString().slice(0,16).replace('T',' ')} · {item.model==='manual-edit'?'Manual design':item.feedback||'Guild revision'}</>} slotProps={{primary:{sx:{fontSize:12,fontWeight:600}},secondary:{sx:{fontSize:11}}}}/></ListItemButton>)}{!versions.length&&<Typography variant="body2" color="text.secondary" sx={{p:2}}>No versions yet.</Typography>}</List></>:rightMode==='properties'?<><Stack direction="row" sx={{px:1.75,py:1.25,alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid',borderColor:'divider'}}><Typography variant="subtitle2" sx={{fontWeight:700}}>Properties</Typography><Tooltip title="Close properties"><IconButton size="small" aria-label="Close properties" onClick={()=>setRightMode(null)}><CloseOutlined size={17}/></IconButton></Tooltip></Stack>{designProperties}{isCanvas(draft)&&<ExportLayer document={draft} selectedId={nodeId} projectId={project.id} canvasRef={canvasRef}/>}</>:null}</Box>
   <Box ref={canvasSectionRef} component="section" className="design-canvas" aria-label="Design canvas" sx={{position:'relative'}}>
    {screenToolbarAt&&selectedScreen?.document&&<Box sx={{position:'absolute',left:screenToolbarAt.left,top:screenToolbarAt.top,transform:'translate(-50%,-100%)',zIndex:6}}><ScreenToolbar projectId={project.id} document={selectedScreen.document} busy={!!visiblePipelinePreview||saving||screenSaving}
     onGlobalEdit={()=>{setScreenSelection(null);openComposer('global');}}
     onSectionEdit={()=>screenSelection?openComposer('section'):setError('Select an element on the screen first, then choose Section Edit.')}
     onAddSection={()=>screenSelection?openComposer('add'):setError('Select an element in the section to add after, then choose Add New Section.')}
     onManualEdit={()=>setManualEditing(true)} onHistory={()=>setRightMode('history')}
     onDeviceVersion={device=>void requestDeviceVersion(selectedScreen,device)} onRemove={()=>setConfirmRemoveScreen(selectedScreen)}
     onNotice={(message,isError)=>isError?setError(message):setProviderNotice(message)}/></Box>}
    <Box ref={canvasRef} className="canvas-scroll" onMouseDown={event=>{canvasPress.current={x:event.clientX,y:event.clientY};}} onClick={event=>{const press=canvasPress.current;canvasPress.current=null;if(!press||Math.hypot(event.clientX-press.x,event.clientY-press.y)>4)return;if(!(event.target instanceof Element&&event.target.closest('[data-screen-id]')))deselectScreen();}} sx={{cursor:panMode?'grab':'default',touchAction:'none',userSelect:'none',WebkitUserSelect:'none'}} onPointerDownCapture={event=>{pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.current.size===2){const[a,b]=[...pointers.current.values()],bounds=event.currentTarget.getBoundingClientRect();pinch.current={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:zoomRef.current};recordZoomAnchor((a.x+b.x)/2-bounds.left,(a.y+b.y)/2-bounds.top);}}} onPointerMoveCapture={event=>{if(!pointers.current.has(event.pointerId))return;pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pinch.current&&pointers.current.size===2){const[a,b]=[...pointers.current.values()],bounds=event.currentTarget.getBoundingClientRect(),next=Math.max(10,Math.min(300,pinch.current.zoom*Math.hypot(a.x-b.x,a.y-b.y)/pinch.current.distance));recordZoomAnchor((a.x+b.x)/2-bounds.left,(a.y+b.y)/2-bounds.top);zoomRef.current=next;setZoom(next);event.stopPropagation();}}} onPointerUpCapture={event=>{pointers.current.delete(event.pointerId);pinch.current=null;}} onPointerCancelCapture={()=>{pointers.current.clear();pinch.current=null;}} onPointerDown={event=>{const target=event.target as Element;const blankCanvasDrag=isCanvas(draft)&&tool==='select'&&!target.closest('[data-node-id]');if(!panMode&&!blankCanvasDrag&&event.button!==1)return;if(event.button!==0&&event.button!==1)return;event.preventDefault();const el=event.currentTarget;drag.current={x:event.clientX,y:event.clientY,left:el.scrollLeft,top:el.scrollTop};el.setPointerCapture(event.pointerId);}} onPointerMove={event=>{if(!drag.current)return;event.currentTarget.scrollLeft=drag.current.left-(event.clientX-drag.current.x);event.currentTarget.scrollTop=drag.current.top-(event.clientY-drag.current.y);}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
     <Box className="canvas-content"><Box sx={{width:workspaceWidth*zoom/100,height:workspaceHeight*zoom/100,position:'relative',flex:'none'}}><Box className="design-artboard" sx={{width:workspaceWidth,height:workspaceHeight,transform:`scale(${zoom/100})`,...(canvasDocument||boardMode?{background:'transparent',boxShadow:'none'}:{})}}>
     {boardMode?<BoardView projectId={project.id} screens={screens} draft={boardDraft} zoom={zoom} selectedScreenId={selectedScreenId} selection={screenSelection} onSelect={(screenId,selection)=>{if(screenId!==selectedScreenId)setScreenSelection(null);setSelectedScreenId(screenId);setScreenSelection(selection);if(selection)setRightMode('properties');}} onMove={moveScreen}/>:canvasDocument?<CanvasSurface document={canvasDocument} projectId={project.id} tool={tool} framePreset={framePresetSize} selected={nodeId} agentCursor={canvasPreview?.status==='running'?{role:canvasPreview.role,nodeIds:canvasPreview.nodeIds}:undefined} onSelect={id=>{setNodeId(id);setRightMode(id||canvasDocument.nodes.some(node=>!node.hidden&&(node.screen||node.type==='frame'))?'properties':null);}} onChange={setDraft} onCommit={commitCanvas} onToolChange={setTool} onGeometryChange={setSelectedGeometry} disabled={!!visiblePipelinePreview||saving||uploadingImage}/>:draft?<iframe title="Generated landing page" srcDoc={previewHtml} sandbox="" referrerPolicy="no-referrer" style={{height:artboardHeight,pointerEvents:'none'}}/>:null}
     </Box></Box></Box>
    </Box>
    <Paper className="editor-tool-dock" elevation={8} role="toolbar" aria-label="Design tools" sx={{position:'absolute',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:5,p:.75,borderRadius:1.5,bgcolor:'#24282e',border:'1px solid #3a424a',boxShadow:'0 10px 34px #121b2755',display:'flex',alignItems:'center',gap:.35,maxWidth:'calc(100% - 24px)',overflowX:'auto'}}>
     {([{id:'select',label:'Select · V',Icon:NearMeOutlined},{id:'hand',label:'Hand · H',Icon:PanToolOutlined},{id:'frame',label:'Frame · F',Icon:CropFreeOutlined},{id:'rectangle',label:'Rectangle · R',Icon:RectangleOutlined},{id:'ellipse',label:'Ellipse · O',Icon:CircleOutlined},{id:'text',label:'Text · T',Icon:TextFieldsOutlined},{id:'line',label:'Line · L',Icon:HorizontalRuleOutlined},{id:'path',label:'Pencil · P',Icon:DrawOutlined}] as const).map((item,index)=><Box key={item.id} sx={{display:'flex',alignItems:'center'}}>{[2,3,5,6].includes(index)&&<Divider orientation="vertical" flexItem sx={{mx:.45,borderColor:'#515960'}}/>}<Tooltip arrow placement="top" title={<Box sx={{display:'flex',alignItems:'center',gap:1.5}}><span>{item.label.split(' · ')[0]}</span><Box component="span" sx={{fontSize:'.6875rem',fontWeight:600,color:'#aeb4ba'}}>{item.label.split(' · ')[1]}</Box></Box>} slotProps={{tooltip:{sx:{bgcolor:'#202124',color:'#f5f5f5',fontSize:'.75rem',fontWeight:500,lineHeight:1,borderRadius:'6px',px:1.1,py:.75,boxShadow:'0 4px 12px rgba(0,0,0,.22)'}},arrow:{sx:{color:'#202124'}}}}><span><IconButton aria-label={item.label.split(' ·')[0]+' tool'} aria-pressed={tool===item.id} disabled={!!visiblePipelinePreview||saving||(!!draft&&!isCanvas(draft)&&!['select','hand'].includes(item.id))} onClick={()=>{if(!draft)setDraft(blankCanvas());if(item.id==='frame'){setNodeId('');setRightMode('properties');}setTool(item.id);}} sx={{width:40,height:40,borderRadius:'8px',bgcolor:tool===item.id?'#4e7cae':'transparent',color:tool===item.id?'#fff':'#d9dfe4','&:hover':{bgcolor:tool===item.id?'#4e7cae':'#3b4249'},'&.Mui-disabled':{color:'#777f86'}}}><item.Icon size={21}/></IconButton></span></Tooltip></Box>)}
     <Divider orientation="vertical" flexItem sx={{mx:.45,borderColor:'#515960'}}/><Tooltip title="Insert image · PNG, JPEG, or WebP"><span><IconButton aria-label="Insert image" disabled={saving||uploadingImage||!isCanvas(draft)} onClick={()=>{imageReplaceId.current=null;imageInput.current?.click();}} sx={{width:40,height:40,borderRadius:'8px',color:'#d9dfe4','&:hover':{bgcolor:'#3b4249'}}}><ImagePlusOutlined size={21}/></IconButton></span></Tooltip>
     <Tooltip title="Insert icon · free Lucide library"><span><IconButton aria-label="Insert icon" disabled={saving||!isCanvas(draft)} onClick={()=>{iconReplaceId.current=null;setIconPickerOpen(true);}} sx={{width:40,height:40,borderRadius:'8px',color:'#d9dfe4','&:hover':{bgcolor:'#3b4249'}}}><ShapesOutlined size={21}/></IconButton></span></Tooltip>
    </Paper>
   </Box>
  </Box>
  <Dialog open={iconPickerOpen} onClose={()=>{setIconPickerOpen(false);iconReplaceId.current=null;}} fullWidth maxWidth="sm" aria-labelledby="icon-picker-title"><DialogTitle id="icon-picker-title" sx={{pb:1}}>Choose an icon</DialogTitle><DialogContent><TextField autoFocus fullWidth size="small" label="Search icons" value={iconQuery} onChange={event=>setIconQuery(event.target.value)} sx={{mt:1}}/><Typography variant="caption" color="text.secondary" sx={{display:'block',mt:1}}>Free Lucide icons · ISC license</Typography><Box sx={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(72px,1fr))',gap:1,mt:2,minHeight:80}}>{iconLoading?Array.from({length:12},(_,index)=><Skeleton key={index} variant="rounded" height={72}/>):iconResults.map(name=><Button key={name} aria-label={`Insert ${name} icon`} onClick={()=>insertCanvasIcon(name)} sx={{display:'flex',flexDirection:'column',gap:.75,minWidth:0,p:1,border:'1px solid #e1e6ea',borderRadius:1.5,textTransform:'none',color:'text.primary','&:hover':{bgcolor:'#f1f6f2'}}}><Box component="img" alt="" src={canvasIconUrl(name,'#202b38',2)} sx={{width:24,height:24}}/><Typography variant="caption" sx={{maxWidth:'100%',fontSize:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</Typography></Button>)}</Box>{!iconLoading&&!iconResults.length&&<Typography variant="body2" color="text.secondary" sx={{mt:2}}>No matching icons. Try a shorter term.</Typography>}</DialogContent><DialogActions><Button onClick={()=>{setIconPickerOpen(false);iconReplaceId.current=null;}}>Close</Button></DialogActions></Dialog>
  <Snackbar open={!!error} autoHideDuration={saveConflict ? null : 6000} onClose={(_,reason)=>{if(reason!=='clickaway'&&!saveConflict)setError('');}} anchorOrigin={{vertical:'bottom',horizontal:'center'}}><Alert severity="error" variant="filled" action={saveConflict ? <Button color="inherit" component="a" href={`/studio/projects/${project.id}`} target="_blank" rel="noopener noreferrer">Open latest</Button> : undefined} onClose={()=>{setError('');setSaveConflict(false);}} sx={{maxWidth:'min(560px, calc(100vw - 32px))'}}>{error}</Alert></Snackbar>
  <Snackbar open={!!providerNotice} autoHideDuration={6000} onClose={(_,reason)=>{if(reason!=='clickaway')setProviderNotice('');}} anchorOrigin={{vertical:'bottom',horizontal:'center'}}><Alert severity="success" variant="filled" onClose={()=>setProviderNotice('')} sx={{maxWidth:'min(560px, calc(100vw - 32px))'}}>{providerNotice}</Alert></Snackbar>
  {manualEditing&&selectedScreen?.document&&<ManualEditor projectId={project.id} document={selectedScreen.document} saving={screenSaving} onClose={()=>setManualEditing(false)} onSave={next=>saveScreen(selectedScreen,next,'Manual edits')}/>}
  <Dialog open={!!confirmRemoveScreen} onClose={()=>setConfirmRemoveScreen(null)} maxWidth="xs" fullWidth><DialogTitle>Remove {confirmRemoveScreen?.name}?</DialogTitle><DialogContent><Typography variant="body2">The screen leaves the board. Its versions stay in your project history.</Typography></DialogContent><DialogActions><Button onClick={()=>setConfirmRemoveScreen(null)}>Cancel</Button><Button color="error" onClick={()=>{const target=confirmRemoveScreen;setConfirmRemoveScreen(null);if(target)void removeScreen(target);}}>Remove screen</Button></DialogActions></Dialog>
  <Dialog open={!!pendingVersion||!!discardAction} onClose={()=>{setPendingVersion(null);setDiscardAction(null);}} maxWidth="xs" fullWidth><DialogTitle>Discard unsaved changes?</DialogTitle><DialogContent><Typography variant="body2">Save your work first, or discard these local changes.</Typography></DialogContent><DialogActions><Button onClick={()=>{setPendingVersion(null);setDiscardAction(null);}}>Keep editing</Button><Button color="error" onClick={()=>{if(pendingVersion)selectVersion(pendingVersion);discardAction?.();setPendingVersion(null);setDiscardAction(null);}}>Discard changes</Button></DialogActions></Dialog>
 </Box></ThemeProvider>;
}
