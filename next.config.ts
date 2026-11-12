import type { NextConfig } from 'next';
const config: NextConfig = {
  agentRules: false,
  // HTML screens compile Tailwind at request time from its stylesheet.
  outputFileTracingIncludes: { '/api/studio/screen': ['./node_modules/tailwindcss/index.css'] },
  // Artwork is served as pre-sized static assets; keep the unused optimizer closed.
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
};
export default config;
