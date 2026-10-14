import type { Metadata } from 'next';
import Link from 'next/link';
import { authConfig } from '@/lib/studio/supabase';
import { StudioProviders } from '@/components/studio/providers';
import { SignInForm } from '@/components/studio/forms';
import { AgentMark } from '@/components/studio/agent-identity';
import { agentRoles } from '@/lib/studio/agent-roles';
import '../studio/studio.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in | GuildOS', robots: { index: false, follow: false }, alternates: { canonical: '/signin' } };
export default function SignIn() {
 return <StudioProviders><main className="studio-auth"><div className="auth-story"><Link href="/" className="studio-brand">guildos<span> / studio</span></Link><div><p className="studio-eyebrow">YOUR CREATIVE GUILD</p><h1>Your idea has<br /><em>a whole team.</em></h1><p>Five specialist agents share one canvas. You set the direction, review their decisions, and keep control of every draft.</p><div className="auth-guild-marks" aria-label="Five design specialists">{agentRoles.map(role=><AgentMark key={role} role={role} size={42}/>)}</div></div><span className="auth-caption">Human direction. A guild behind you.</span></div><div className="auth-form"><p className="studio-eyebrow">WELCOME TO YOUR STUDIO</p><h2>Bring your ideas in.</h2><p>Sign in or create an account with a code sent to your email.</p>{authConfig() ? <SignInForm /> : <p role="status">Studio access is being configured. Please try again soon.</p>}<Link href="/" className="studio-text-link">Back to GuildOS</Link></div></main></StudioProviders>;
}
