import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fieldNotes } from '@/lib/marketing/field-notes';
import './article.css';

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return fieldNotes.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const note = fieldNotes.find(item => item.slug === slug);
  if (!note) return {};
  return { title: `${note.title} | GuildOS Blog`, description: note.description, alternates: { canonical: `/blogs/${note.slug}` }, openGraph: { title: note.title, description: note.description, type: 'article' } };
}
export default async function FieldNotePage({ params }: Props) {
  const { slug } = await params;
  const note = fieldNotes.find(item => item.slug === slug);
  if (!note) notFound();
  const related = fieldNotes.filter(item => item.slug !== note.slug);
  return <main className="article-page">
    <header className="article-header"><Link href="/" className="article-brand" aria-label="GuildOS home"><svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#315b46"/><g fill="#f4f8f4"><rect x="6" y="6" width="8" height="8" rx="2"/><rect x="18" y="6" width="8" height="10" rx="2"/><rect x="6" y="18" width="10" height="8" rx="2"/></g><rect x="20" y="20" width="6" height="6" rx="2" fill="#a8c981"/></svg>guildos</Link><Link href="/#blogs" className="article-back">All blogs</Link></header>
    <article><div className="article-hero"><div className="article-hero-inner"><p className="article-category">BLOG / {note.category.toUpperCase()}</p><h1>{note.title}</h1><p className="article-deck">{note.description}</p><div className="article-byline"><span className="article-byline-mark">✳</span><span>THE GUILDOS TEAM<br/><small>NOTES ON MAKING GOOD WORK</small></span></div></div></div>
      <div className="article-content"><p className="article-lead">{note.intro}</p>{note.sections.map(section => <section key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>)}<aside className="article-callout"><p>GOOD WORK STARTS WITH A SHARED IDEA</p><h2>Bring your next idea to the studio.</h2><Link href="/studio">Explore GuildOS</Link></aside></div>
    </article>
    <section className="article-related"><p className="article-category">KEEP EXPLORING</p><h2>More from the blog.</h2><div>{related.map(item => <Link key={item.slug} href={`/blogs/${item.slug}`}><span>{item.category}</span><strong>{item.title}</strong></Link>)}</div></section>
    <footer className="article-footer"><Link href="/" aria-label="GuildOS home"><svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#315b46"/><g fill="#f4f8f4"><rect x="6" y="6" width="8" height="8" rx="2"/><rect x="18" y="6" width="8" height="10" rx="2"/><rect x="6" y="18" width="10" height="8" rx="2"/></g><rect x="20" y="20" width="6" height="6" rx="2" fill="#a8c981"/></svg>guildos</Link><span>Thoughtfully built. Human-led.</span></footer>
  </main>;
}
