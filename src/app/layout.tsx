import type { Metadata } from 'next';
import './globals.css';
import './creative-art.css';
import './atmosphere.css';

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
  return <html lang="en"><body>{children}</body></html>;
}
