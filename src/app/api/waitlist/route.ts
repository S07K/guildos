import { handleWaitlist } from '@/lib/waitlist-handler.mjs';
export const runtime = 'nodejs';
export async function POST(request: Request) { return handleWaitlist(request); }
