'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Box, Divider } from '@mui/material';
import { StudioNavigation } from './navigation';
import { GuildOSMark } from './brand';
import { AccountMenu, AccountProvider } from './account-menu';
export function StudioShell({ email, name, avatarUrl, children }: { email: string; name: string; avatarUrl?: string; children: React.ReactNode }) {
 const editor = /^\/studio\/projects\/[0-9a-f-]{36}$/i.test(usePathname());
 return <AccountProvider value={{email,name,avatarUrl}}>{editor ? <Box className="studio-shell editor-shell"><main id="studio-main" className="studio-main">{children}</main></Box> : <Box className="studio-shell"><a href="#studio-main" className="skip-link">Skip to workspace</a><Box component="aside" className="studio-sidebar"><Box sx={{px:1,mb:4}}><Link href="/studio" className="studio-brand"><GuildOSMark size={32}/><span>guildos</span></Link></Box><StudioNavigation/><Box className="sidebar-account" sx={{mt:'auto',pt:2}}><Divider sx={{mb:2}}/><AccountMenu variant="sidebar"/></Box></Box><main id="studio-main" className="studio-main" tabIndex={-1}>{children}</main></Box>}</AccountProvider>;
}
