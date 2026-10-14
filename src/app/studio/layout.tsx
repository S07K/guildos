import type { Metadata } from 'next';
import { studioSession } from '@/lib/studio/supabase';
import { signOut } from './actions';
import { StudioProviders } from '@/components/studio/providers';
import { StudioShell } from '@/components/studio/shell';
import './studio.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your studio | GuildOS', robots: { index: false, follow: false }, alternates: { canonical: '/studio' } };
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
 const { user } = await studioSession();
 const profileName = user.user_metadata?.full_name || user.user_metadata?.name;
 const profilePhoto = user.user_metadata?.avatar_url || user.user_metadata?.picture;
 return <StudioProviders><StudioShell email={user.email || ''} name={typeof profileName === 'string' ? profileName.trim().slice(0, 80) : ''} avatarUrl={typeof profilePhoto === 'string' && /^https:\/\//.test(profilePhoto) ? profilePhoto : undefined}>{children}</StudioShell></StudioProviders>;
}
