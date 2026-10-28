export const SESSION_MAX_AGE_SECONDS = Number(process.env.NEXT_PUBLIC_SESSION_MAX_AGE_SECONDS || 86400);
if (!Number.isSafeInteger(SESSION_MAX_AGE_SECONDS) || SESSION_MAX_AGE_SECONDS <= 0 || SESSION_MAX_AGE_SECONDS > 2147483) {
  throw new Error('NEXT_PUBLIC_SESSION_MAX_AGE_SECONDS must be a positive integer no greater than 2147483.');
}
export const SESSION_EXPIRY_COOKIE = 'guildos_session_issued_at';
export const authCookieOptions = {
  maxAge: SESSION_MAX_AGE_SECONDS,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};
/** Redirects are application-relative and restricted to the authenticated studio. */
export function safeNextUrl(value?: string | null): string {
  if (!value || /[\\\u0000-\u0020]/.test(value)) return '/studio';
  try {
    const url = new URL(value, 'https://guildos.invalid');
    if (url.origin !== 'https://guildos.invalid' || !(url.pathname === '/studio' || url.pathname.startsWith('/studio/'))) return '/studio';
    return url.pathname + url.search + url.hash;
  } catch { return '/studio'; }
}
export const isAuthCookie = (name: string) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name);
