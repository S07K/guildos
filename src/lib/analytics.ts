import { track } from '@vercel/analytics/server';

type Properties = Record<string, string | number | boolean | null>;

/**
 * Funnel events for Vercel Web Analytics. Never send personal data (emails,
 * names, briefs) here. Analytics must never break a user flow, so failures are swallowed.
 */
export async function trackEvent(name: 'landing_brief_opened' | 'signed_in' | 'project_created' | 'provider_connected', properties?: Properties) {
 if (!process.env.VERCEL) return;
 try { await track(name, properties); } catch { /* ignore */ }
}
