import { Box } from '@mui/material';

export function GuildOSMark({ size = 28 }: { size?: number }) {
 return <Box component="span" className="guildos-mark" aria-hidden="true" sx={{ width: size, height: size }}><i/><i/><i/><b/></Box>;
}
