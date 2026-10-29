import { agentIdentity, agentRoles, type AgentRole } from './agent-roles.ts';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export type ConversationSegment = { text: string; kind: 'text' | 'layer' | 'agent'; role?: AgentRole };

/** Preserve all message text while identifying known multi-word layers and mentions. */
export function conversationSegments(text: string, layerNames: string[]): ConversationSegment[] {
 const layers = [...new Set(layerNames.filter(Boolean))].sort ( (a, b) => b.length - a.length );
 const names = agentRoles.map(role => agentIdentity[role].persona);
 const layerAlternatives = layers.map(escapeRegExp).join('|');
 const matcher = new RegExp(`(?<![\\p{L}\\p{N}_])(?:@(?:${names.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}_-])|#(?:${layerAlternatives ? `(?:${layerAlternatives})(?![\\p{L}\\p{N}_-])|` : ''}[\\p{L}\\p{N}_-]+))`, 'giu');
 const segments: ConversationSegment[] = [];
 let position = 0;
 for (const match of text.matchAll(matcher)) {
  if (match.index > position) segments.push({ text: text.slice(position, match.index), kind: 'text' });
  const token = match[0];
  const role = agentRoles.find(item => agentIdentity[item].persona.toLowerCase() === token.slice(1).toLowerCase());
  segments.push(token.startsWith('#') ? { text: token, kind: 'layer' } : { text: token, kind: 'agent', role });
  position = match.index + token.length;
 }
 if (position < text.length) segments.push({ text: text.slice(position), kind: 'text' });
 return segments;
}
