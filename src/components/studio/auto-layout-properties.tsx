'use client';
import { Box, Button, ButtonGroup, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { CanvasDocument, CanvasNode } from '@/lib/studio/canvas';
import { snapToGrid } from '@/lib/studio/design-system';
import { defaultLayout, type AutoLayout, type RelativeSize } from '@/lib/studio/canvas-layout';

export function AutoLayoutProperties({node,document:doc,onPatch,onAdd}:{node:CanvasNode;document:CanvasDocument;onPatch:(patch:Partial<CanvasNode>)=>void;onAdd:(type:'container'|'text',direction?:'row'|'column')=>void}) {
 const descendants=new Set([node.id]);
 for(let pass=0;pass<doc.nodes.length;pass++)for(const item of doc.nodes)if(item.parentId&&descendants.has(item.parentId))descendants.add(item.id);
 const layout=node.layout||defaultLayout;
 const update=(patch:Partial<AutoLayout>)=>onPatch({layout:{...layout,...patch}});
 return <Stack spacing={1.5} sx={{py:2}}>
  <Typography variant="subtitle2">Auto layout</Typography><Typography variant="caption" color="text.secondary">Reorder siblings in Layers. Text expands automatically.</Typography>
  <TextField select size="small" label="Parent container" value={node.parentId||''} onChange={event=>onPatch({parentId:event.target.value||undefined})}><MenuItem value="">Canvas</MenuItem>{doc.nodes.filter(item=>item.layout&&!descendants.has(item.id)).map(item=><MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField>
  {node.positionMode!=='absolute'&&<Box sx={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:1}}>{(['width','height'] as const).map(axis=><TextField key={axis} select size="small" label={axis==='width'?'Width sizing':'Height sizing'} value={node.sizing?.[axis]||'hug-contents'} onChange={event=>onPatch({sizing:{width:node.sizing?.width||'fill-container',height:node.sizing?.height||'hug-contents',[axis]:event.target.value as RelativeSize}})}><MenuItem value="hug-contents">Hug contents</MenuItem>{!(axis==='height'&&node.type==='text')&&<MenuItem value="fixed">Component size</MenuItem>}{!(axis==='height'&&node.type==='text')&&<MenuItem value="fill-container">Fill container</MenuItem>}</TextField>)}</Box>}
  {node.layout&&<>
   <Box><Typography variant="caption" color="text.secondary">Flow direction</Typography><ButtonGroup fullWidth size="small" sx={{mt:.5}}>{([{value:'column',label:'Vertical'},{value:'row',label:'Horizontal'}] as const).map(item=><Button key={item.value} aria-pressed={layout.direction===item.value} variant={layout.direction===item.value?'contained':'outlined'} onClick={()=>update({direction:item.value})}>{item.label}</Button>)}</ButtonGroup></Box>
   <Box><Typography variant="caption" color="text.secondary">Distribution</Typography><ButtonGroup fullWidth size="small" sx={{mt:.5}}>{([{value:'start',label:'Start'},{value:'center',label:'Center'},{value:'space-between',label:'Between'}] as const).map(item=><Button key={item.value} aria-pressed={layout.justifyContent===item.value} variant={layout.justifyContent===item.value?'contained':'outlined'} onClick={()=>update({justifyContent:item.value})}>{item.label}</Button>)}</ButtonGroup></Box>
   <Box sx={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:1}}>{(['gap','padding'] as const).map(key=><TextField key={key} size="small" type="number" label={key==='gap'?'Gap':'Padding'} slotProps={{htmlInput:{step:8,min:0,max:496}}} value={layout[key]} onChange={event=>update({[key]:snapToGrid(Number(event.target.value))})}/>)}</Box>
   <TextField select size="small" label="Align items" value={layout.alignItems} onChange={event=>update({alignItems:event.target.value as AutoLayout['alignItems']})}>{['start','center','end','stretch'].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
   <TextField select size="small" label="Justify content" value={layout.justifyContent} onChange={event=>update({justifyContent:event.target.value as AutoLayout['justifyContent']})}>{['start','center','end','space-between'].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
   <Stack direction="row" spacing={.5}><Button size="small" onClick={()=>onAdd('container','row')}>Add row</Button><Button size="small" onClick={()=>onAdd('container','column')}>Add column</Button><Button size="small" onClick={()=>onAdd('text')}>Add text</Button></Stack>
  </>}
 </Stack>;
}
