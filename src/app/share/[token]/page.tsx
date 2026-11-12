import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GuildOSLogo } from '@/components/guildos-logo';
import { SharedScreen } from '@/components/shared-screen';
import { composeHtmlScreen, HTML_DEVICE_FRAME } from '@/lib/studio/html-screen';
import { compileScreenCss } from '@/lib/studio/html-screen-css';
import { loadSharedBoard, shareImageUrls } from '@/lib/studio/share-links';
import { adminClient } from '@/lib/studio/supabase';

export const dynamic = 'force-dynamic';
// Share links are private by default: never indexed, never sent as a referrer.
export const metadata: Metadata = { title: 'Shared design · GuildOS', robots: { index: false, follow: false }, referrer: 'no-referrer' };

/** A read-only view of one shared screen or a whole board. Revoking the link makes it 404 at once. */
export default async function SharedPage({ params }: { params: Promise<{ token: string }> }) {
 const { token } = await params;
 const board = await loadSharedBoard(adminClient(), token);
 if (!board) notFound();
 const screens = await Promise.all(board.screens.map(async screen => ({
  ...screen, frame: HTML_DEVICE_FRAME[screen.device],
  html: shareImageUrls(composeHtmlScreen(screen.document, await compileScreenCss(screen.document), { exportOnly: true }), board.project.id, token),
 })));
 return <main style={{ minHeight: '100vh', background: '#f4f6f5', color: '#1f2a33', padding: '32px 16px 64px' }}>
  <header style={{ maxWidth: 1440, margin: '0 auto 32px', display: 'flex', alignItems: 'center', gap: 12 }}>
   <a href="/" aria-label="GuildOS home" style={{ display: 'inline-flex', flex: 'none' }}><GuildOSLogo/></a>
   <div style={{ minWidth: 0, flex: '1 1 160px' }}>
    <h1 style={{ font: '650 18px/1.25 system-ui, sans-serif', letterSpacing: '-.2px', margin: 0, overflowWrap: 'anywhere' }}>{board.scope === 'screen' ? screens[0].name : board.project.name}</h1>
    <p style={{ font: '400 13px/1.4 system-ui, sans-serif', color: '#5b6770', margin: '2px 0 0' }}>{board.scope === 'screen' ? board.project.name : `${screens.length} screen${screens.length === 1 ? '' : 's'}`} · view only</p>
   </div>
  </header>
  <div style={{ maxWidth: 1440, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 40, alignItems: 'flex-start', justifyContent: 'center' }}>
   {screens.map(screen => <div key={screen.id} style={{ flex: `0 1 ${screen.frame.width}px`, minWidth: 0 }}>
    <SharedScreen name={screen.name} html={screen.html} width={screen.frame.width} minHeight={screen.frame.height} caption={board.scope === 'board'}/>
   </div>)}
  </div>
 </main>;
}
