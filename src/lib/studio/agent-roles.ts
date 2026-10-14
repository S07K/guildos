export const agentRoles = ['creative_director', 'ux_architect', 'copywriter', 'ui_designer', 'qa_critic'] as const;
export type AgentRole = typeof agentRoles[number];
export type AgentAnchor = 'page' | 'header' | 'hero' | 'features' | 'closing' | 'footer';
export const agentIdentity: Record<AgentRole, { name: string; persona: string; short: string; action: string; color: string; tint: string }> = {
 creative_director: { name: 'Creative Director', persona: 'Ari', short: 'Direction', action: 'Sets the visual north star', color: '#6a4f85', tint: '#f0eaf4' },
 ux_architect: { name: 'UX Architect', persona: 'Noor', short: 'Structure', action: 'Maps the journey and hierarchy', color: '#356d87', tint: '#e8f2f5' },
 copywriter: { name: 'Copywriter', persona: 'Pip', short: 'Voice', action: 'Finds the words and the action', color: '#9a6632', tint: '#f8efe1' },
 ui_designer: { name: 'UI Designer', persona: 'Mira', short: 'Design', action: 'Builds the visual draft', color: '#3e7154', tint: '#e8f2ea' },
 qa_critic: { name: 'QA Critic', persona: 'Vale', short: 'Review', action: 'Checks clarity and accessibility', color: '#9a5554', tint: '#f7ebea' },
};
