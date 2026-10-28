'use client';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Snackbar, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Code, Copy, Download, X } from 'lucide-react';
import Prism from 'prismjs';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-swift';
import type { CanvasDocument } from '@/lib/studio/canvas';
import { normalizeCanvasPositions } from '@/lib/studio/canvas-position';
import { compileNodeToCode, type CodeTarget } from '@/lib/exporters/codeCompiler';
import { downloadBlob, rasterizeNode, resolveCodeAssets, slugify } from '@/lib/exporters/browserExport';

const targets: {value:CodeTarget;label:string}[] = [{value:'react',label:'React'},{value:'react-native',label:'React Native'},{value:'swiftui',label:'SwiftUI'}];
export function ExportLayer({document:doc,selectedId,projectId,canvasRef}:{document:CanvasDocument;selectedId:string;projectId:string;canvasRef:RefObject<HTMLDivElement|null>}) {
  const [scale,setScale] = useState<1|2|3>(2), [target,setTarget] = useState<CodeTarget>('react');
  const [open,setOpen] = useState(false), [entire,setEntire] = useState(false), [previewEnabled,setPreviewEnabled] = useState(false);
  const [preview,setPreview] = useState(''), [pngBusy,setPngBusy] = useState(false), [code,setCode] = useState(''), [codeBusy,setCodeBusy] = useState(false);
  const [error,setError] = useState(''), [toast,setToast] = useState('');
  const lastScreen = useRef(''), previewRevision = useRef(0);
  const normalized = useMemo(()=>normalizeCanvasPositions(doc),[doc]);
  const selected = normalized.nodes.find(node=>node.id===selectedId && !node.hidden);
  let ancestor = selected;
  const seen = new Set<string>();
  while (ancestor?.parentId && !seen.has(ancestor.id)) {seen.add(ancestor.id);ancestor=normalized.nodes.find(node=>node.id===ancestor!.parentId);}
  const selectedScreen = ancestor && (ancestor.screen || ancestor.type==='frame') ? ancestor : undefined;
  useEffect(()=>{if(selectedScreen)lastScreen.current=selectedScreen.id;},[selectedScreen]);
  const screen = selectedScreen || normalized.nodes.find(node=>node.id===lastScreen.current&&!node.hidden) || normalized.nodes.find(node=>!node.parentId&&!node.hidden&&(node.screen||node.type==='frame'));
  const pngNode = selected || screen, codeNode = entire ? screen : selected || screen;
  useEffect(()=>{
    if (!open || !codeNode) {setCode('');return;}
    let cancelled = false;
    setCodeBusy(true);setCode('');setError('');
    // Keep unrelated screens/assets outside the extraction scope.
    const ids = new Set([codeNode.id]);
    for(let pass=0;pass<normalized.nodes.length;pass++) for(const node of normalized.nodes) if(node.parentId&&ids.has(node.parentId)&&!node.hidden) ids.add(node.id);
    resolveCodeAssets(normalized.nodes.filter(node=>ids.has(node.id)&&!node.hidden),projectId)
      .then(nodes=>compileNodeToCode(codeNode.id,nodes,target))
      .then(result=>{if(!cancelled)setCode(result);})
      .catch(reason=>{if(!cancelled)setError(reason instanceof Error?reason.message:'Code export failed.');})
      .finally(()=>{if(!cancelled)setCodeBusy(false);});
    return ()=>{cancelled=true;};
  },[open,codeNode,normalized,projectId,target]);
  useEffect(()=>{
    const revision = ++previewRevision.current;
    setPreview('');
    if(!previewEnabled||!pngNode||!canvasRef.current)return;
    let url = '';
    const timer = setTimeout(()=>{
      rasterizeNode(canvasRef.current!,pngNode.id,1).then(blob=>{
        if(previewRevision.current!==revision)return;
        url=URL.createObjectURL(blob);setPreview(url);
      }).catch(reason=>{if(previewRevision.current===revision)setError(reason instanceof Error?reason.message:'Preview failed.');});
    },350);
    return ()=>{clearTimeout(timer);++previewRevision.current;if(url)URL.revokeObjectURL(url);};
  },[previewEnabled,pngNode,normalized,canvasRef]);
  const highlighted = useMemo(()=>Prism.highlight(code,Prism.languages[target==='swiftui'?'swift':'tsx'],target==='swiftui'?'swift':'tsx'),[code,target]);
  if(!pngNode)return null;
  const exportPng = async () => {
    if(!canvasRef.current||pngBusy)return;
    setPngBusy(true);setError('');
    try {const blob=await rasterizeNode(canvasRef.current,pngNode.id,scale);downloadBlob(blob,`${slugify(pngNode.name||pngNode.id)}@${scale}x.png`);setToast('PNG exported.');}
    catch(reason){setError(reason instanceof Error?reason.message:'PNG export failed.');}
    finally {setPngBusy(false);}
  };
  const selector = (compact = false) => <ToggleButtonGroup size="small" exclusive value={target} onChange={(_,value:CodeTarget|null)=>{if(value)setTarget(value);}} aria-label="Code export target" sx={{display:'flex',width:compact?'100%':'auto','& button':{flex:compact?'1 0 auto':undefined,minHeight:38,fontSize:compact?11:12,px:compact?1:1.75,whiteSpace:'nowrap',textTransform:'none'}}}>{targets.map(item=><ToggleButton key={item.value} value={item.value}>{item.label}</ToggleButton>)}</ToggleButtonGroup>;
  return <Box component="section" aria-label="Export Layer" sx={{p:1.75,borderTop:'1px solid',borderColor:'divider'}}>
    <Typography variant="subtitle2" sx={{mb:.5}}>Export Layer</Typography>
    <Typography variant="caption" color="text.secondary" sx={{display:'block',mb:1.5,overflowWrap:'anywhere'}}>{pngNode.name}{!selected?' · Active screen':''}</Typography>
    <Stack direction="row" spacing={1}>
      <TextField select size="small" label="Scale" value={scale} onChange={event=>setScale(Number(event.target.value) as 1|2|3)} sx={{minWidth:72}}>{[1,2,3].map(value=><MenuItem key={value} value={value}>{value}x</MenuItem>)}</TextField>
      <Button fullWidth variant="outlined" startIcon={<Download size={15}/>} disabled={pngBusy} onClick={exportPng}>{pngBusy?'Exporting…':'Export PNG'}</Button>
    </Stack>
    <FormControlLabel control={<Switch size="small" checked={previewEnabled} onChange={event=>setPreviewEnabled(event.target.checked)}/>} label={<Typography variant="caption">Live thumbnail preview</Typography>} sx={{my:.5}}/>
    {previewEnabled&&<Box sx={{mb:1.5,p:1,bgcolor:'#edf1ef',borderRadius:1,textAlign:'center',minHeight:60}}>{preview?<Box component="img" crossOrigin="anonymous" src={preview} alt={`Export preview of ${pngNode.name}`} sx={{maxWidth:'100%',maxHeight:160,objectFit:'contain'}}/>:<Typography variant="caption" color="text.secondary">Preparing preview…</Typography>}</Box>}
    {selector(true)}
    <Button fullWidth variant="contained" startIcon={<Code size={15}/>} onClick={()=>{setEntire(!selected);setOpen(true);}} sx={{mt:1}}>Inspect / Export Code</Button>
    {error&&!open&&<Alert severity="error" sx={{mt:1}} onClose={()=>setError('')}>{error}</Alert>}
    <Dialog onKeyDown={event=>event.stopPropagation()} open={open} onClose={()=>setOpen(false)} fullWidth maxWidth="lg" aria-labelledby="export-code-title">
      <DialogTitle id="export-code-title" sx={{pr:8,position:'relative'}}>
        Code Inspector
        <Typography variant="body2" color="text.secondary" sx={{mt:.25,overflowWrap:'anywhere'}}>{codeNode?.name}</Typography>
        <IconButton aria-label="Close" onClick={()=>setOpen(false)} sx={{position:'absolute',right:16,top:16,color:'text.secondary'}}><X size={20}/></IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{display:'flex',flexWrap:'wrap',alignItems:'flex-end',gap:2.5,pt:.5,pb:1.5}}>
          <Stack spacing={.75}>
            <Typography variant="caption" color="text.secondary">Framework</Typography>
            {selector()}
          </Stack>
          <Stack spacing={.75} sx={{minWidth:0,maxWidth:'100%'}}>
            <Typography variant="caption" color="text.secondary">Export scope</Typography>
            <ToggleButtonGroup size="small" exclusive value={entire?'screen':'layer'} onChange={(_,value)=>{if(value)setEntire(value==='screen');}} aria-label="Export scope" sx={{'& button':{minHeight:38,fontSize:12,px:1.75,textTransform:'none'}}}>
              <ToggleButton value="layer" disabled={!selected}>Selected Layer Only</ToggleButton>
              <ToggleButton value="screen" disabled={!screen}>Entire Active Screen</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </Box>
        <Box sx={{maxWidth:760,mb:.5}}>
          <Typography variant="caption" color="text.secondary" sx={{display:'block',lineHeight:1.6}}>{target==='react'?'React with Tailwind CSS and lucide-react.':target==='react-native'?'React Native with lucide-react-native. Vector paths require react-native-svg.':'SwiftUI for iOS 15+ / macOS 12+. Unmapped icons use questionmark.circle.'}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{display:'block',lineHeight:1.6}}>Connect actions and state in your app.</Typography>
        </Box>
        {error&&<Alert severity="error" sx={{mt:1}}>{error}</Alert>}
        <Box component="pre" tabIndex={0} aria-label="Generated source code" aria-busy={codeBusy} sx={{m:0,mt:1.5,p:2,bgcolor:'#101a23',color:'#dce8ee',borderRadius:2,overflow:'auto',height:'min(55vh,600px)',fontSize:12,lineHeight:1.7,'& .token.comment':{color:'#8399a5'},'& .token.keyword,& .token.tag':{color:'#b9a3ff'},'& .token.string,& .token.attr-value':{color:'#9ddbb5'},'& .token.number,& .token.boolean':{color:'#f3bf80'},'& .token.function,& .token.class-name':{color:'#84d0ec'}}}>{codeBusy?'Preparing source…':<code dangerouslySetInnerHTML={{__html:highlighted}}/>}</Box>
      </DialogContent>
      <DialogActions sx={{px:3,pb:2,flexWrap:'wrap',gap:1}}>
        <Button disabled={!code||codeBusy} startIcon={<Copy size={16}/>} onClick={async()=>{try{await navigator.clipboard.writeText(code);setToast('Code copied to clipboard.');}catch{setError('Clipboard access failed. Download the file or select and copy the code.');}}}>Copy to Clipboard</Button>
        <Button disabled={!code||codeBusy} variant="contained" startIcon={<Download size={16}/>} onClick={()=>downloadBlob(new Blob([code],{type:'text/plain;charset=utf-8'}),`${slugify(codeNode?.name||'layer')}${target==='react-native'?'.native':''}.${target==='swiftui'?'swift':'tsx'}`)}>Download File</Button>
      </DialogActions>
    </Dialog>
    <Snackbar open={!!toast} autoHideDuration={3500} onClose={()=>setToast('')} message={toast}/>
  </Box>;
}
