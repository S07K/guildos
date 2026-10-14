'use client';

import { BotAvatar, type BotAvatarState, type BotAvatarType } from 'bot-avatars';
import { Box, Stack, Typography } from '@mui/material';
import { agentIdentity, agentRoles, type AgentRole } from '@/lib/studio/agent-roles';

const avatarType: Record<AgentRole, BotAvatarType> = {
 creative_director: 'star',
 ux_architect: 'hexagon',
 copywriter: 'flower',
 ui_designer: 'square',
 qa_critic: 'droid',
};

const avatarColor: Record<AgentRole, string> = {
 creative_director: '#89779d',
 ux_architect: '#6e929d',
 copywriter: '#b18a58',
 ui_designer: '#6f987d',
 qa_critic: '#aa7775',
};

export function AgentMark({ role, size = 44, state = 'default' }: { role: AgentRole; size?: number; state?: BotAvatarState }) {
 return <Box component="span" className="agent-mark" sx={{ width: size, height: size, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
  <BotAvatar type={avatarType[role]} size={size} color={avatarColor[role]} brightness={1.08} saturation={1.2} face="mouth" state={state} seed={agentRoles.indexOf(role) / agentRoles.length} shading="fabric" speed={0.75} turn={0.55} />
 </Box>;
}

export function GuildLineup({ compact = false, onSelect }: { compact?: boolean; onSelect?: (role: AgentRole) => void }) {
 return <Box className={compact ? 'guild-lineup guild-lineup-compact' : 'guild-lineup'} aria-label="Your five design agents">
  {agentRoles.map((role, index) => { const agent = agentIdentity[role]; return <Box component={onSelect ? 'button' : 'div'} type={onSelect ? 'button' : undefined} onClick={onSelect ? () => onSelect(role) : undefined} className="guild-agent-card" key={role} sx={{ '--agent-color': agent.color, textAlign: 'left', cursor: onSelect ? 'pointer' : 'default', width: '100%' } as React.CSSProperties}>
   <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}><AgentMark role={role} size={compact ? 38 : 48}/><Box sx={{ minWidth: 0 }}><Typography className="guild-agent-step">{String(index + 1).padStart(2, '0')} · {agent.name}</Typography><Typography className="guild-agent-name">{agent.persona}</Typography></Box></Stack>
   {!compact && <Typography className="guild-agent-action">{agent.action}</Typography>}
  </Box>; })}
 </Box>;
}
