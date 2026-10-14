'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import BarChartOutlined from '@mui/icons-material/BarChartOutlined';
import CableOutlined from '@mui/icons-material/CableOutlined';
const items = [{ href: '/studio', label: 'Overview', Icon: DashboardOutlined }, { href: '/studio/projects', label: 'Projects', Icon: FolderOutlined }, { href: '/studio/analytics', label: 'Usage & costs', Icon: BarChartOutlined }, { href: '/studio/settings', label: 'Connections', Icon: CableOutlined }];
export function StudioNavigation() {
 const path = usePathname();
 return <List component="nav" aria-label="Studio navigation" disablePadding>{items.map(({ href, label, Icon }) => {
  const selected = href === '/studio' ? path === href : path.startsWith(href);
  return <ListItemButton component={Link} href={href} key={href} selected={selected} aria-current={selected ? 'page' : undefined} sx={{ borderRadius: 2, mb: .5, py: 1.2, '&.Mui-selected': { bgcolor: '#edf3ef', color: 'primary.main' }, '&.Mui-selected:hover': { bgcolor: '#e6eee9' } }}><ListItemIcon sx={{ minWidth: 34, color: 'inherit' }}><Icon fontSize="small"/></ListItemIcon><ListItemText primary={label} slotProps={{ primary: { sx: { fontSize: 13, fontWeight: selected ? 600 : 500 } } }}/></ListItemButton>;
 })}</List>;
}
