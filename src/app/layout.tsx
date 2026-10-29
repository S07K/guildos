import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { siteUrl } from '@/lib/site';
import './globals.css';
import './creative-art.css';
import './atmosphere.css';
import './product-preview.css';
import './landing-story.css';

const sans = localFont({ src: './fonts/instrument-sans-normal.woff2', variable: '--font-sans', weight: '400 600', display: 'swap' });
const editorial = localFont({
  src: [
    { path: './fonts/newsreader-normal.woff2', weight: '400 500', style: 'normal' },
    { path: './fonts/newsreader-italic.woff2', weight: '400 500', style: 'italic' },
  ],
  variable: '--font-editorial', display: 'swap',
});

const description = 'Meet your creative team in one studio. GuildOS brings creative direction, UX, design, copy, and quality review together around your brief, with you in control.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'GuildOS | Your AI Creative Studio',
  description,
  keywords: ['AI design studio', 'AI design agents', 'creative workflow', 'brand design', 'UX design', 'design collaboration', 'GuildOS'],
  alternates: { canonical: '/' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
  openGraph: {
    title: 'GuildOS | Your AI Creative Studio',
    description,
    url: siteUrl,
    siteName: 'GuildOS',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'GuildOS, your AI creative studio' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GuildOS | Your AI Creative Studio',
    description,
    images: [{ url: '/og-image.png', alt: 'GuildOS, your AI creative studio' }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${sans.variable} ${editorial.variable}`}><body>{children}</body></html>;
}
