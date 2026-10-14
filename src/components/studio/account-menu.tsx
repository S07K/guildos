'use client';
import { createContext, useContext, useState } from 'react';
import Link from 'next/link';
import { Avatar, Box, Divider, IconButton, Menu, MenuItem, Typography } from '@mui/material';
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import { signOut } from '@/app/studio/actions';

type Account = { email: string; name: string; avatarUrl?: string };
const AccountContext = createContext<Account>({ email: '', name: '' });
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
 const menuButton = <IconButton aria-label="Account menu" aria-haspopup="menu" aria-expanded={!!anchor} onClick={event => setAnchor(event.currentTarget)} sx={variant === 'sidebar' ? { width: 30, height: 30, border: '1px solid #dce2e9', color: '#40515a', flexShrink: 0 } : { p: .5 }}>{variant === 'sidebar' ? <MoreVertOutlined fontSize="small" /> : avatar}</IconButton>;
 return <>
  {variant === 'sidebar' ? <Box className="sidebar-account-row" sx={{ display: 'flex', alignItems: 'center', gap: .75, minWidth: 0, pb: .5 }}>
   {avatar}<Box className="sidebar-account-details" sx={{ minWidth: 0, flex: 1 }}><Typography variant="body2" noWrap title={name} sx={{ fontWeight: 650, fontSize: 13, lineHeight: 1.3 }}>{name}</Typography><Typography variant="caption" color="text.secondary" noWrap title={account.email} sx={{ display: 'block', fontSize: 11, lineHeight: 1.25 }}>{account.email}</Typography></Box>{menuButton}
  </Box> : menuButton}
  <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { minWidth: 230, mt: .5 } } }}>
   <Box sx={{ px: 2, py: 1, maxWidth: 300 }}><Typography variant="body2" sx={{ fontWeight: 650 }}>{name}</Typography><Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{account.email}</Typography></Box><Divider />
   <MenuItem component={Link} href="/studio" onClick={() => setAnchor(null)}><DashboardOutlined fontSize="small" sx={{ mr: 1.5 }} />Dashboard</MenuItem>
   <MenuItem component={Link} href="/studio/settings" onClick={() => setAnchor(null)}><SettingsOutlined fontSize="small" sx={{ mr: 1.5 }} />Connections</MenuItem><Divider />
   <Box component="form" action={signOut}><MenuItem component="button" type="submit" sx={{ width: '100%' }}><LogoutOutlined fontSize="small" sx={{ mr: 1.5 }} />Sign out</MenuItem></Box>
  </Menu>
 </>;
}
