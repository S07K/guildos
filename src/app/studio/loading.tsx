'use client';
import { usePathname } from 'next/navigation';
import { Box, Skeleton, Stack } from '@mui/material';
import { ProjectCardsSkeleton, ProjectEditorSkeleton, TaskBoardSkeleton } from '@/components/studio/loading-states';

export default function StudioLoading() {
 const path=usePathname();
 if(/^\/studio\/projects\/[0-9a-f-]{36}$/i.test(path))return <ProjectEditorSkeleton/>;
 return <Box role="status" aria-label="Loading workspace" aria-busy="true" sx={{maxWidth:1400,mx:'auto'}}>
  <Skeleton width={160} height={24}/><Skeleton width="40%" height={56} sx={{mt:3}}/><Skeleton width="65%" height={24}/>
  {path==='/studio/tasks'?<Box sx={{mt:4}}><TaskBoardSkeleton/></Box>:<>
   {path!=='/studio/projects'&&<><Stack direction="row" spacing={2} sx={{mt:4,mb:3}}>{[0,1,2,3].map(item=><Skeleton key={item} variant="rounded" height={150} sx={{flex:1}}/>)}</Stack><Skeleton variant="rounded" height={260} sx={{mb:4}}/></>}
   <Stack direction="row" sx={{justifyContent:'space-between',my:3}}><Skeleton width={180} height={36}/><Skeleton width={260} height={36}/></Stack><ProjectCardsSkeleton/>
  </>}
 </Box>;
}
