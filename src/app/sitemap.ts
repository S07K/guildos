import type { MetadataRoute } from 'next';
import { fieldNotes } from '@/lib/marketing/field-notes';

const siteUrl = 'https://guildos.design';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...fieldNotes.map(note => ({ url: `${siteUrl}/blogs/${note.slug}`, changeFrequency: 'monthly' as const, priority: 0.7 })),
    {
      url: siteUrl,
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
