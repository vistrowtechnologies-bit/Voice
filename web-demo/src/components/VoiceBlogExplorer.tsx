import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { VOICE_BLOG_POSTS, type VoiceBlogPost } from '../content/voiceBlog'
import { SectionEyebrow } from './MarketingBits'

export function VoiceBlogExplorer({ post }: { post: VoiceBlogPost }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const categories = [...new Set(VOICE_BLOG_POSTS.map((item) => item.category))]
  const browsing = Boolean(query.trim()) || category !== 'All'
  const results = useMemo(() => VOICE_BLOG_POSTS
    .filter((item) => item.slug !== post.slug && (category === 'All' || item.category === category)
      && `${item.title} ${item.excerpt} ${item.category}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(b.category === post.category) - Number(a.category === post.category) || b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 3), [post, category, query])
  const content = <>
    <SectionEyebrow>Explore the journal</SectionEyebrow>
    <label htmlFor="article-search" className="mt-5 block text-xs font-semibold">Search articles</label>
    <input id="article-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Voice AI, languages, CRM…" className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
    <label htmlFor="article-category" className="mt-4 block text-xs font-semibold">Category</label>
    <select id="article-category" value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-3 text-sm outline-none focus:border-primary"><option value="All">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
    {!browsing && <nav aria-label="Article sections" className="mt-6 border-t border-border pt-5"><p className="text-xs font-semibold">In this article</p><ol className="mt-3 space-y-3">{post.sections.map((section, index) => <li key={section.heading}><a href={`#section-${index + 1}`} className="flex gap-3 text-sm leading-snug text-text-muted hover:text-primary"><span className="font-semibold text-primary">{String(index + 1).padStart(2, '0')}</span>{section.heading}</a></li>)}</ol></nav>}
    <div className="mt-6 border-t border-border pt-5"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold">{browsing ? 'Matching articles' : 'Suggested reading'}</p>{browsing && <button type="button" onClick={() => { setQuery(''); setCategory('All') }} className="text-xs text-primary hover:underline">Reset</button>}</div>
      {results.length ? <ul className="mt-3 divide-y divide-border">{results.map((item) => <li key={item.slug}><Link to={`/resources/blog/${item.slug}`} className="group block py-4"><span className="text-[10px] font-semibold uppercase tracking-wider text-primary">{item.category}</span><p className="mt-1 font-display text-sm font-semibold leading-snug group-hover:text-primary">{item.title}</p><p className="mt-2 text-xs text-text-muted">{item.readTime}</p></Link></li>)}</ul> : <p role="status" className="mt-4 text-sm text-text-muted">No articles match. Try another topic or reset your search.</p>}
    </div>
    <Link to="/resources/blog" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">Browse all guides →</Link>
  </>
  return <div className="rounded-2xl border border-border bg-surface p-5">{content}</div>
}
