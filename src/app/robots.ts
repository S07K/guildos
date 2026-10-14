import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/studio', '/signin'],
    },
    sitemap: 'https://guildos.design/sitemap.xml',
  };
}
