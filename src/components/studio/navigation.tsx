'use client';
import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { Skeleton, List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { LayoutDashboard as DashboardOutlined } from 'lucide-react';
import { Folder as FolderOutlined } from 'lucide-react';
import { BarChart3 } from 'lucide-react';
import { Kanban } from 'lucide-react';
import { Cable as CableOutlined } from 'lucide-react';
const items = [{ href: '/studio', label: 'Overview', Icon: DashboardOutlined }, { href: '/studio/projects', label: 'Projects', Icon: FolderOutlined }, { href: '/studio/tasks', label: 'Tasks', Icon: Kanban }, { href: '/studio/analytics', label: 'Usage & costs', Icon: BarChart3 }, { href: '/studio/settings', label: 'Connections', Icon: CableOutlined }];
function NavigationPending() {
 const { pending } = useLinkStatus();
 return pending ? <Skeleton variant="rounded" width={20} height={14} aria-label="Opening page" sx={{ml:1}}/> : null;
}
export function StudioNavigation() {
 const path = usePathname();
 return <List component="nav" aria-label="Studio navigation" disablePadding>{items.map(({ href, label, Icon }) => {
  const selected = href === '/studio' ? path === href : path.startsWith(href);
  return <ListItemButton component={Link} href={href} key={href} selected={selected} aria-current={selected ? 'page' : undefined} sx={{ borderRadius: 2, mb: .5, py: 1.2, '&.Mui-selected': { bgcolor: '#edf3ef', color: 'primary.main' }, '&.Mui-selected:hover': { bgcolor: '#e6eee9' } }}><ListItemIcon sx={{ minWidth: 34, color: 'inherit' }}><Icon size={18}/></ListItemIcon><ListItemText primary={label} slotProps={{ primary: { sx: { fontSize: 13, fontWeight: selected ? 600 : 500 } } }}/></ListItemButton>;
 })}</List>;
}
