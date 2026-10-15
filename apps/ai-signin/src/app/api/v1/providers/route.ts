import { openaiProvider } from '@/providers/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ providers: [{ id: openaiProvider.id, name: openaiProvider.displayName, configured: openaiProvider.configured(), capabilities: ['identity', ...(process.env.OPENAI_CHATGPT_PLAN_USAGE === 'enabled' ? ['chatgpt-plan-usage'] : [])] }] }, { headers: { 'Cache-Control': 'no-store' } });
}
