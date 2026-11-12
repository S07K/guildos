'use client';
import { useEffect, useState } from 'react';
import { agentIdentity, type AgentRole } from '@/lib/studio/agent-roles';
import { AgentMark } from './agent-identity';

const reducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * An agent's pointer on the canvas. It glides to each new position (cubic ease-in-out,
 * like a collaborator's cursor) and jumps instantly when the user prefers reduced motion.
 */
export function AgentCursor({ role, x, y, message, glideMs = 450 }: { role: AgentRole; x: number; y: number; message?: string; glideMs?: number }) {
 const [still, setStill] = useState(true);
 useEffect(() => setStill(reducedMotion()), []);
 const agent = agentIdentity[role];
 return <div data-export-ignore="true" data-agent-cursor={role} aria-label={`${agent.persona} ${message ? message.toLowerCase() : 'is working on the canvas'}`}
  style={{ position: 'absolute', left: 0, top: 0, zIndex: 10, pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 6, transform: `translate(${x - 7}px,${y - 8}px)`, transition: still ? 'none' : `transform ${glideMs}ms cubic-bezier(0.65,0,0.35,1)`, filter: 'drop-shadow(0 2px 5px #17211e30)' }}>
  <svg width="18" height="22" viewBox="0 0 18 22" aria-hidden="true" style={{ flex: 'none' }}><path d="M2 1.5 16 12l-6.1.9 3.2 6.1-2.5 1.3-3.2-6.2-4.4 4.1Z" fill={agent.color} stroke="white" strokeWidth="1.5" strokeLinejoin="round"/></svg>
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px 3px 4px', borderRadius: 999, background: 'white', border: `1px solid ${agent.color}55`, color: '#263238', font: '600 11px/1.2 system-ui,sans-serif', whiteSpace: 'nowrap' }}>
   <AgentMark role={role} size={20}/>{agent.persona}{message && <span style={{ fontWeight: 500, color: '#5b6770' }}>· {message}</span>}
  </span>
 </div>;
}
