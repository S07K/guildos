'use client';
import { createContext, useContext, useState } from 'react';
import Link from 'next/link';
import { Avatar, Box, Divider, IconButton, Menu, MenuItem, Typography } from '@mui/material';
import { MoreVertical as MoreVertOutlined } from 'lucide-react';
import { LogOut as LogoutOutlined, LayoutDashboard as DashboardOutlined, Settings as SettingsOutlined, Folder, BarChart3 } from 'lucide-react';
import { signOut } from '@/app/studio/actions';

type Account = { email: string; name: string; avatarUrl?: string };
export const AccountContext = createContext<Account>({ email: '', name: '' });
export const AccountProvider = AccountContext.Provider;

function displayName(account: Account) {
 if (account.name) return account.name;
 const local = account.email.split('@')[0].replace(/\d+/g, ' ').replace(/[._+-]+/g, ' ').trim();
 return local ? local.replace(/\b\p{L}/gu, letter => letter.toUpperCase()) : 'GuildOS member';
}

export function AccountMenu({ variant = 'compact' }: { variant?: 'compact' | 'sidebar' }) {
 const account = useContext(AccountContext);
 const [anchor, setAnchor] = useState<HTMLElement | null>(null);
 const name = displayName(account);
 const avatar = <Avatar src={account.avatarUrl} alt={name} sx={{ width: 32, height: 32, bgcolor: '#e8eef0', color: '#3d6753', fontSize: 14, flexShrink: 0 }}>{name.slice(0, 1).toUpperCase()}</Avatar>;
 const menuButton = <IconButton aria-label="Account menu" aria-haspopup="menu" aria-expanded={!!anchor} onClick={event => setAnchor(event.currentTarget)} sx={variant === 'sidebar' ? { width: 30, height: 30, border: '1px solid #dce2e9', color: '#40515a', flexShrink: 0 } : { p: .5 }}>{variant === 'sidebar' ? <MoreVertOutlined size={18} /> : avatar}</IconButton>;
 return <>
  {variant === 'sidebar' ? <Box className="sidebar-account-row" sx={{ display: 'flex', alignItems: 'center', gap: .75, minWidth: 0, pb: .5 }}>
   {avatar}<Box className="sidebar-account-details" sx={{ minWidth: 0, flex: 1 }}><Typography variant="body2" noWrap title={name} sx={{ fontWeight: 650, fontSize: 13, lineHeight: 1.3 }}>{name}</Typography><Typography variant="caption" color="text.secondary" noWrap title={account.email} sx={{ display: 'block', fontSize: 11, lineHeight: 1.25 }}>{account.email}</Typography></Box>{menuButton}
  </Box> : menuButton}
  <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { minWidth: 230, mt: .5, border: 'none', '& .MuiMenuItem-root': { fontSize: 14, minHeight: 44 }, '& .MuiMenuItem-root svg': { width: 17, height: 17 }, '& .MuiTypography-body2': { fontSize: 16 }, '& .MuiTypography-caption': { fontSize: 13 } } } }}>
   <Box sx={{ px: 2, py: 1, maxWidth: 300 }}><Typography variant="body2" sx={{ fontWeight: 650 }}>{name}</Typography><Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{account.email}</Typography></Box><Divider />
   {variant === 'compact' && <>
    <MenuItem component={Link} href="/studio" onClick={() => setAnchor(null)}><DashboardOutlined size={18} style={{marginRight: 12}}/>Dashboard</MenuItem>
    <MenuItem component={Link} href="/studio/projects" onClick={() => setAnchor(null)}><Folder size={18} style={{marginRight: 12}}/>Projects</MenuItem>
    <MenuItem component={Link} href="/studio/analytics" onClick={() => setAnchor(null)}><BarChart3 size={18} style={{marginRight: 12}}/>Usage &amp; costs</MenuItem>
    <MenuItem component={Link} href="/studio/settings" onClick={() => setAnchor(null)}><SettingsOutlined size={18} style={{marginRight: 12}}/>Connections</MenuItem><Divider />
   </>}
   <Box component="form" noValidate action={signOut}><MenuItem component="button" type="submit" sx={{ width: '100%' }}><LogoutOutlined size={18}  style={{marginRight: 12.0}}/>Sign out</MenuItem></Box>
  </Menu>
 </>;
}
