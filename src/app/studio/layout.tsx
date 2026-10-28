import type { Metadata } from 'next';
import { studioSession } from '@/lib/studio/supabase';
import { cookies } from 'next/headers';
import { SESSION_EXPIRY_COOKIE } from '@/lib/auth/config';
import { sessionExpiresAt } from '@/lib/auth/session-window';
import { SessionExpiry } from '@/components/studio/session-expiry';
import { StudioProviders } from '@/components/studio/providers';
import { StudioShell } from '@/components/studio/shell';
import './studio.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your studio | GuildOS', robots: { index: false, follow: false }, alternates: { canonical: '/studio' } };
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
 const { user } = await studioSession();
 const profileName = user.user_metadata?.full_name || user.user_metadata?.name;
 const profilePhoto = user.user_metadata?.avatar_url || user.user_metadata?.picture;
 const expiresAt=sessionExpiresAt((await cookies()).get(SESSION_EXPIRY_COOKIE)?.value) || Date.now();
 return <StudioProviders><SessionExpiry expiresAt={expiresAt} serverNow={Date.now()}/><StudioShell email={user.email || ''} name={typeof profileName === 'string' ? profileName.trim().slice(0, 80) : ''} avatarUrl={typeof profilePhoto === 'string' && /^https:\/\//.test(profilePhoto) ? profilePhoto : undefined}>{children}</StudioShell></StudioProviders>;
}
