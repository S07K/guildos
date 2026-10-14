'use client';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import { createTheme, ThemeProvider } from '@mui/material/styles';
const theme = createTheme({
 palette: { primary: { main: '#386650' }, secondary: { main: '#61738b' }, background: { default: '#f6f7f9', paper: '#ffffff' }, text: { primary: '#202b38', secondary: '#687587' }, divider: '#e5e9ef', success: { main: '#2e7d56' } },
 typography: { fontFamily: 'var(--font-sans), sans-serif', fontSize: 14, h4: { fontSize: '1.8rem', fontWeight: 650, letterSpacing: '-.035em' }, h5: { fontSize: '1.35rem', fontWeight: 650, letterSpacing: '-.025em' }, h6: { fontSize: '1rem', fontWeight: 600 }, body2: { fontSize: '.875rem', letterSpacing: 0 }, button: { textTransform: 'none', fontWeight: 600 }, caption: { fontSize: '.75rem' } },
 shape: { borderRadius: 10 },
 components: {
  MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 8, minHeight: 38, paddingInline: 16 }, sizeSmall: { minHeight: 32, fontSize: 12 } } },
  MuiIconButton: { styleOverrides: { root: { borderRadius: 7 } } },
  MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
  MuiOutlinedInput: { styleOverrides: { root: { backgroundColor: '#fff', fontSize: 14, borderRadius: 8 }, notchedOutline: { borderColor: '#dce2e9' } } },
  MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none' } } },
  MuiCard: { defaultProps: { variant: 'outlined' }, styleOverrides: { root: { borderColor: '#e5e9ef', borderRadius: 12 } } },
  MuiDialog: { styleOverrides: { paper: { borderRadius: 16 } } },
  MuiTabs: { styleOverrides: { root: { minHeight: 44 }, indicator: { height: 2 } } },
  MuiTab: { styleOverrides: { root: { minHeight: 44, textTransform: 'none', fontSize: 13, fontWeight: 600, minWidth: 70 } } },
  MuiChip: { defaultProps: { size: 'small' }, styleOverrides: { root: { borderRadius: 6, fontSize: 11, fontWeight: 500 } } },
  MuiTooltip: { defaultProps: { arrow: true } },
 }
});
export function StudioProviders({ children }: { children: React.ReactNode }) {
 return <AppRouterCacheProvider><ThemeProvider theme={theme}>{children}</ThemeProvider></AppRouterCacheProvider>;
}
