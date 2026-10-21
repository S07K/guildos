'use client';

import { Box, Skeleton, Stack } from '@mui/material';

export function ConversationSkeleton() {
 return <Stack role="status" aria-label="Loading project conversation" aria-busy="true" spacing={2}>{[0,1,2].map(item=><Stack key={item} direction="row" spacing={1.25} aria-hidden="true"><Skeleton variant="circular" width={32} height={32}/><Box sx={{flex:1}}><Skeleton width="40%" height={20}/><Skeleton variant="rounded" height={item===1?92:60}/></Box></Stack>)}</Stack>;
}
export function TaskBoardSkeleton({list=false}:{list?:boolean}) {
 return <Box role="status" aria-label="Loading tasks" aria-busy="true" sx={{p:list?2:0}}>
  <Stack direction="row" sx={{justifyContent:'space-between',mb:2}} aria-hidden="true"><Skeleton width={150} height={28}/><Skeleton width={list?40:240} height={36}/></Stack>
  <Box aria-hidden="true" sx={{display:'grid',gridTemplateColumns:list?'1fr':'repeat(5,minmax(230px,1fr))',gap:1.5,overflow:'hidden'}}>{Array.from({length:list?1:5},(_,column)=><Stack key={column} spacing={1.5} sx={{p:list?0:1.5,bgcolor:list?'transparent':'#f3f6f4',borderRadius:2}}>{!list&&<Skeleton width="55%" height={24}/>} {Array.from({length:3},(_,card)=><Box key={card} sx={{p:1.75,bgcolor:'background.paper',border:'1px solid',borderColor:'divider',borderRadius:2}}><Skeleton width="50%" height={22}/><Skeleton width="95%"/><Skeleton width="70%"/><Skeleton width="90%" height={18} sx={{mt:1}}/><Skeleton width="45%" height={18}/></Box>)}</Stack>)}</Box>
 </Box>;
}
export function ProjectEditorSkeleton() {
 return <Box role="status" aria-label="Loading project editor" aria-busy="true" className="design-workspace" sx={{height:'100%',minHeight:0,bgcolor:'background.default'}}>
  <Stack component="header" direction="row" aria-hidden="true" sx={{height:56,flexShrink:0,px:2,gap:2,alignItems:'center',borderBottom:'1px solid',borderColor:'divider',bgcolor:'background.paper'}}><Skeleton variant="rounded" width={32} height={32}/><Skeleton width={180} height={28}/><Box sx={{flex:1}}/><Skeleton width={72} height={32}/><Skeleton variant="circular" width={30} height={30}/></Stack>
  <Box aria-hidden="true" className="design-workspace-body" style={{gridTemplateColumns:'48px clamp(300px,25vw,360px) minmax(0,1fr)'}}>
   <Stack className="editor-rail" sx={{p:1,gap:1.5,bgcolor:'background.paper',borderRight:'1px solid',borderColor:'divider'}}>{[0,1,2,3].map(item=><Skeleton key={item} variant="rounded" width={30} height={30}/>)}</Stack>
   <Box className="layers-panel" sx={{bgcolor:'background.paper',borderRight:'1px solid',borderColor:'divider'}}><Box sx={{px:2,py:1.25,borderBottom:'1px solid',borderColor:'divider'}}><Skeleton width={80} height={24}/></Box><Stack sx={{p:2,gap:1.5}}>{[0,1,2,3,4,5].map(item=><Stack key={item} direction="row" spacing={1} sx={{pl:item%3?2:0}}><Skeleton variant="rounded" width={18} height={18}/><Skeleton width={item%2?'65%':'80%'} height={20}/></Stack>)}</Stack></Box>
   <Box className="design-canvas" sx={{position:'relative',overflow:'hidden',display:'grid',placeItems:'center',bgcolor:'#eef0f2',backgroundImage:'radial-gradient(#cbd1d6 1px, transparent 1px)',backgroundSize:'16px 16px'}}><Skeleton variant="rounded" width="min(60%, 375px)" height="65%" sx={{bgcolor:'#fff',border:'1px solid #e1e6ea'}}/><Stack direction="row" sx={{position:'absolute',bottom:24,p:1,gap:1,bgcolor:'#30363c',borderRadius:2}}>{[0,1,2,3,4,5].map(item=><Skeleton key={item} variant="rounded" width={32} height={32} sx={{bgcolor:'#59616a'}}/>)}</Stack></Box>
  </Box>
 </Box>;
}
export function ProjectCardsSkeleton() {
 return <Box aria-hidden="true" sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))',xl:'repeat(3,minmax(0,1fr))'},gap:2.5}}>{[0,1,2].map(item=><Box key={item} sx={{border:'1px solid',borderColor:'divider',borderRadius:2,overflow:'hidden',bgcolor:'background.paper'}}><Skeleton variant="rectangular" height={176}/><Box sx={{p:2}}><Skeleton width="75%" height={28}/><Skeleton width="95%"/><Skeleton width="60%"/><Stack direction="row" sx={{justifyContent:'space-between',mt:2}}><Skeleton width={100}/><Skeleton width={70}/></Stack></Box></Box>)}</Box>;
}
