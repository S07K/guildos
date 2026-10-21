'use client';

import Link, { useLinkStatus } from 'next/link';
import { ArrowUpRight, FileText, Layers, Trash2 } from 'lucide-react';
import { Box, Card, CardActionArea, CardContent, Chip, IconButton, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import type { Project } from './dashboard';

function ProjectOpening() {
 const {pending}=useLinkStatus();
 return pending?<Box role="status" aria-label="Opening project" sx={{position:'absolute',inset:0,zIndex:1,bgcolor:'#ffffffb8'}}><Skeleton variant="rectangular" width="100%" height="100%"/></Box>:null;
}
export function ProjectCard({project,onDelete}:{project:Project;onDelete:()=>void}) {
 const latest=project.latest_design;
 const canvas=latest?.kind==='canvas';
 return <Card className="project-tile" sx={{display:'flex',flexDirection:'column',height:'100%',transition:'box-shadow .15s,border-color .15s','&:hover':{borderColor:'#a6bcae',boxShadow:'0 8px 24px #2433430d'},'&:focus-within':{borderColor:'primary.main'}}}>
  <CardActionArea component={Link} href={`/studio/projects/${project.id}`} aria-label={`Open project: ${project.name}`} sx={{flex:1,display:'flex',flexDirection:'column',alignItems:'stretch',justifyContent:'flex-start'}}>
   <Box sx={{position:'relative',height:176,overflow:'hidden',px:2.5,pt:2.5,bgcolor:latest?'#eaf0eb':'#f0f2f5',backgroundImage:'radial-gradient(#68847426 .8px, transparent .8px)',backgroundSize:'12px 12px'}}>
    <Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between'}}><Chip icon={canvas?<Layers size={13}/>:<FileText size={13}/>} label={canvas?'Canvas workspace':latest?'Landing page':'Project brief'} sx={{bgcolor:'#ffffffdb',fontSize:10,height:24,px:.5}}/><Typography variant="caption" sx={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:'#64796b'}}>GUILDOS</Typography></Stack>
    <Box sx={{mt:2,mx:2,p:2,bgcolor:'background.paper',border:'1px solid #dce5df',borderRadius:'10px 10px 0 0',minHeight:110,boxShadow:'0 6px 16px #2433430a'}}>
     <Typography variant="overline" sx={{fontSize:9,letterSpacing:1.2,color:'primary.main',lineHeight:1.5}}>{latest?.brand||project.name}</Typography>
     <Typography sx={{mt:.5,fontSize:19,fontWeight:650,lineHeight:1.25,letterSpacing:-.5,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',overflowWrap:'anywhere'}}>{latest?.headline||(canvas?'Ideas taking shape.':'A new direction starts here.')}</Typography>
     <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:1,fontSize:10}}>{latest?.cta||(canvas?'Design, review, refine':'Your brief. Your specialist guild.')}</Typography>
    </Box><ProjectOpening/>
   </Box>
   <CardContent sx={{p:2.25,width:'100%',boxSizing:'border-box'}}>
    <Stack direction="row" sx={{gap:1,alignItems:'flex-start',justifyContent:'space-between'}}><Typography component="h2" variant="h6" sx={{minWidth:0,overflowWrap:'anywhere',lineHeight:1.4}}>{project.name}</Typography><Chip label={latest?'Draft ready':'Brief ready'} color={latest?'primary':'default'} variant="outlined" sx={{flexShrink:0,mt:.25}}/></Stack>
    <Typography variant="body2" color="text.secondary" sx={{mt:1,lineHeight:1.6,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',minHeight:'3.2em',overflowWrap:'anywhere'}}>{project.brief||(latest?'Continue refining your design with the guild.':'Bring your direction to the project conversation.')}</Typography>
   </CardContent>
  </CardActionArea>
  <Stack direction="row" sx={{px:2,py:1.25,borderTop:'1px solid',borderColor:'divider',alignItems:'center',justifyContent:'space-between',gap:1}}><Typography variant="caption" color="text.secondary" sx={{fontSize:11}}>Created {new Date(project.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}</Typography><Stack direction="row" sx={{alignItems:'center',gap:1}}><Typography component={Link} href={`/studio/projects/${project.id}`} variant="caption" sx={{display:'flex',alignItems:'center',gap:.5,color:'primary.main',fontWeight:650,textDecoration:'none'}}>Open project <ArrowUpRight size={14}/></Typography><Tooltip title="Delete project"><IconButton size="small" aria-label={`Delete ${project.name}`} onClick={onDelete} sx={{color:'text.secondary','&:hover':{color:'error.main',bgcolor:'#fff1f0'}}}><Trash2 size={15}/></IconButton></Tooltip></Stack></Stack>
 </Card>;
}
