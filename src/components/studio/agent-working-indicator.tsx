'use client';

import { Box, Stack, Typography } from '@mui/material';
import { keyframes } from '@emotion/react';
import { agentIdentity, type AgentRole } from '@/lib/studio/agent-roles';
import { AgentMark } from './agent-identity';

const typing=keyframes`0%,60%,100%{opacity:.35;transform:translateY(0)}30%{opacity:1;transform:translateY(-2px)}`;

export function AgentWorkingIndicator({roles}:{roles:AgentRole[]}) {
 if(!roles.length)return null;
 const names=roles.map(role=>agentIdentity[role].persona);
 const label=`${new Intl.ListFormat(undefined,{style:'long',type:'conjunction'}).format(names)} ${roles.length===1?'is':'are'} working`;
 return <Stack direction="row" role="status" aria-live="polite" aria-label={label} spacing={.75} sx={{alignItems:'center',mb:1,minHeight:28,minWidth:0}}>
  <Box aria-hidden="true" sx={{display:'flex',alignItems:'center',flexShrink:0}}>{roles.map((role,index)=><Box key={role} sx={{ml:index?-.75:0,lineHeight:0}}><AgentMark role={role} size={24}/></Box>)}</Box>
  <Typography variant="caption" color="text.secondary" noWrap sx={{minWidth:0}}>{label}</Typography>
  <Stack direction="row" spacing={.4} aria-hidden="true" sx={{alignItems:'center',flexShrink:0}}>{[0,1,2].map(index=><Box key={index} component="span" sx={{width:4,height:4,borderRadius:'50%',bgcolor:'primary.main',animation:`${typing} 1.2s ease-in-out infinite`,animationDelay:`${index*150}ms`,'@media (prefers-reduced-motion: reduce)':{animation:'none',opacity:.7}}}/>)}</Stack>
 </Stack>;
}
