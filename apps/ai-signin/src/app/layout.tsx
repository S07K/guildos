import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './style.css';

export const metadata: Metadata = {
  title: 'GuildOS AI Sign-In',
  description: 'Secure provider connection service for GuildOS.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
