'use client';
import { Box, Stack, Typography } from '@mui/material';
export function StudioPageHeader({ title, description, trail }: { title: string; description: string; trail: string }) {
 return <Box sx={{mb:4}}><Typography variant="caption" color="text.secondary">Workspace / {trail}</Typography><Stack spacing={1} sx={{mt:3}}><Typography variant="h4" component="h1">{title}</Typography><Typography variant="body2" color="text.secondary">{description}</Typography></Stack></Box>;
}
