'use client';
import { Alert, Button, Stack } from '@mui/material';
export default function StudioError({ reset }: { reset: () => void }) {
 return <Stack spacing={2} sx={{maxWidth:600}}><Alert severity="error">We couldn’t load this workspace. Please try again.</Alert><Stack direction="row" spacing={2}><Button variant="contained" onClick={reset}>Try again</Button><Button href="/signin">Return to sign in</Button></Stack></Stack>;
}
