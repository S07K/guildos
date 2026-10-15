export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

export function publicBaseUrl(): URL {
  const value = requiredEnv('AI_SIGNIN_PUBLIC_URL');
  const url = new URL(value);
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('AI_SIGNIN_PUBLIC_URL must use HTTPS in production.');
  return url;
}
