export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ service: 'guildos-ai-signin', ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
