import { safeNextUrl } from '@/lib/auth/config';
import type { Metadata } from 'next';
import Link from 'next/link';
import { authConfig } from '@/lib/studio/supabase';
import { StudioProviders } from '@/components/studio/providers';
import { SignInForm } from '@/components/studio/forms';
import { GuildOSMark } from '@/components/studio/brand';
import { AgentMark } from '@/components/studio/agent-identity';
import { agentRoles } from '@/lib/studio/agent-roles';
import '../studio/studio.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in | GuildOS', robots: { index: false, follow: false }, alternates: { canonical: '/signin' } };
export default async function SignIn({searchParams}:{searchParams:Promise<{next?:string;error?:string;reason?:string}>}) {
 const params=await searchParams;
 const config=authConfig();
 return <StudioProviders><main className="studio-auth"><div className="auth-story"><Link href="/" className="studio-brand flex items-center gap-2.5"><GuildOSMark/><strong className="font-bold tracking-tight text-xl text-slate-900">guildos</strong><span className="auth-studio-chip px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider rounded-full bg-slate-900/10 text-slate-800 border border-slate-900/15 backdrop-blur-sm">studio</span></Link><div><p className="studio-eyebrow">YOUR CREATIVE GUILD</p><h1>Your idea has<br /><em>a whole team.</em></h1><p>Five specialist agents share one canvas. You set the direction, review their decisions, and keep control of every draft.</p><div className="auth-guild-marks" aria-label="Five design specialists">{agentRoles.map(role=><AgentMark key={role} role={role} size={42}/>)}</div></div><span className="auth-caption">Human direction. A guild behind you.</span></div><div className="auth-form"><p className="studio-eyebrow">WELCOME TO YOUR STUDIO</p><h2>Bring your ideas in.</h2><p>Continue with Google or use a code sent to your email.</p>{config ? <SignInForm config={config} nextUrl={safeNextUrl(params.next)} initialError={params.error==='oauth'?'Google sign-in was cancelled or could not be completed. Please try again.':params.reason==='expired'?'Your session has expired. Sign in again to continue.':''} /> : <p role="status">Studio access is being configured. Please try again soon.</p>}</div></main></StudioProviders>;
}
