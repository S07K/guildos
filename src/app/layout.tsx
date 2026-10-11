import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import './creative-art.css';
import './atmosphere.css';

const sans = localFont({ src: './fonts/instrument-sans-normal.woff2', variable: '--font-sans', weight: '400 600', display: 'swap' });
const editorial = localFont({
  src: [
    { path: './fonts/newsreader-normal.woff2', weight: '400 500', style: 'normal' },
    { path: './fonts/newsreader-italic.woff2', weight: '400 500', style: 'italic' },
  ],
  variable: '--font-editorial', display: 'swap',
});

const siteUrl = 'https://guildos.design';
const description = 'An automated design platform powered by specialized AI agents. Bring your own key (BYOK) and let the agents build.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'GuildOS | The Automated AI Design Agency',
  description,
  alternates: { canonical: '/' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
  openGraph: {
    title: 'GuildOS | The Automated AI Design Agency',
    description,
    url: siteUrl,
    siteName: 'GuildOS',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'GuildOS | The Automated AI Design Agency' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GuildOS | The Automated AI Design Agency',
    description,
    images: [{ url: '/og-image.png', alt: 'GuildOS | The Automated AI Design Agency' }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${sans.variable} ${editorial.variable}`}><body>{children}</body></html>;
}
