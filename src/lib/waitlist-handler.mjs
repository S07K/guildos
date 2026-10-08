import { normalizeEmail, saveEmail } from './waitlist.mjs';
import { checkRateLimit } from './waitlist-rate-limit.mjs';
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

export async function handleWaitlist(request, save = saveEmail, limit = checkRateLimit) {
  const origin = request.headers.get('origin');
  const expected = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  if (origin && origin !== new URL(expected).origin) return json({ error: 'Please submit from the GuildOS website.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Send a JSON request.' }, 415);
  try {
    const result = await limit(request);
    if (!result.allowed) return json({ error: 'Too many attempts. Please try again in 15 minutes.' }, 429, { 'Retry-After': String(result.retry_after) });
  } catch {
    console.error('Waitlist rate limiter unavailable');
    return json({ error: "We couldn't process your request. Please try again shortly." }, 503);
  }
  let body;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Enter a valid email address.' }, 400);
    const chunks = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); return json({ error: 'Request is too large.' }, 413); }
      chunks.push(value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { return json({ error: 'Enter a valid email address.' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Enter a valid email address.' }, 400);
  if (typeof body.website === 'string' && body.website) return json({ error: 'Unable to submit this request.' }, 400);
  const email = normalizeEmail(body.email);
  if (!email) return json({ error: 'Enter a valid email address.' }, 400);
  try {
    await save(email);
    // Identical response for duplicates: never disclose list membership.
    return json({ message: "You're on the list. We'll email you when early access opens." });
  } catch {
    // Never log addresses, credentials, or provider response bodies.
    console.error('Waitlist persistence failed');
    return json({ error: "We couldn't save your email. Please try again shortly." }, 503);
  }
}
