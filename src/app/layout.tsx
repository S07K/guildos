import type { Metadata } from 'next';
import './globals.css';
import './creative-art.css';
export const metadata: Metadata = {
  title: 'GuildOS — Your next design team is a guild of AI agents',
  description: 'An AI design agency built around your vision. From brief to beautiful, with specialist agents and you in creative control. Join the early access waitlist.',
  openGraph: { title: 'GuildOS — Great design. Greater possibilities.', description: 'Your vision. A guild of specialists. One creative workspace.', type: 'website' },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
