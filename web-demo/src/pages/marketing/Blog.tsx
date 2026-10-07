import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { SEO_ORIGIN } from '../../lib/seoPages'
import { VOICE_BLOG_POSTS } from '../../content/voiceBlog'
import { VoiceBlogVisual } from '../../components/VoiceBlogVisual'

const ALL_TOPICS = 'All topics'

function prettyDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

export function Blog() {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState(ALL_TOPICS)
  const searchRef = useRef<HTMLInputElement>(null)
  const posts = useMemo(() => [...VOICE_BLOG_POSTS].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)), [])
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])
  const resetFilters = () => { setQuery(''); setActiveCategory(ALL_TOPICS); searchRef.current?.focus() }
  const categories = useMemo(() => [...new Set(VOICE_BLOG_POSTS.map((post) => post.category))], [])
  const filteredPosts = useMemo(() => {
    const term = query.trim().toLowerCase()
    return posts.filter((post) => {
      const categoryMatch = activeCategory === ALL_TOPICS || post.category === activeCategory
      const textMatch = !term || `${post.title} ${post.excerpt} ${post.category}`.toLowerCase().includes(term)
      return categoryMatch && textMatch
    })
  }, [activeCategory, query, posts])
  const featured = posts[0]
  const hasFilters = query.trim().length > 0 || activeCategory !== ALL_TOPICS
  const visiblePosts = hasFilters ? filteredPosts : filteredPosts.filter((post) => post.slug !== featured?.slug)

  return (
    <MarketingLayout>
      <Seo
        title="Voice AI Guides, Product Insights & Playbooks | Vistrow Voice"
        description="Practical guides to AI voice agents, multilingual customer conversations, latency, website voice widgets, and CRM integrations from the Vistrow Voice team."
        path="/resources/blog"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'Vistrow Voice Blog',
          itemListElement: VOICE_BLOG_POSTS.map((post, index) => ({
            '@type': 'ListItem', position: index + 1, url: `${SEO_ORIGIN}/resources/blog/${post.slug}`, name: post.title,
          })),
        }}
      />

      <section className="relative overflow-hidden border-b border-border bg-surface">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgb(168_85_247/0.1)_1px,transparent_1px),linear-gradient(90deg,rgb(168_85_247/0.1)_1px,transparent_1px)] [background-size:54px_54px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 top-8 h-96 w-96 rounded-full bg-primary/15 blur-[110px]" />
        <div className="relative mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-20">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-text-muted">
            <Link to="/" className="transition-colors hover:text-text">Home</Link><span aria-hidden="true">/</span><span className="text-text">Resources</span><span aria-hidden="true">/</span><span className="text-text">Blog</span>
          </nav>
          <div className="mt-9 grid items-end gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.75fr)] lg:gap-16">
            <div className="max-w-4xl">
              <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary"><Icon name="graphic_eq" className="text-[19px]" /></span><SectionEyebrow>Vistrow Voice Journal</SectionEyebrow></div>
              <h1 className="mt-6 font-display text-[clamp(2.7rem,6vw,5.2rem)] font-bold leading-[1] tracking-[-0.045em]">Better conversations start with <span className="bg-gradient-to-r from-primary to-pink-500 bg-clip-text text-transparent">better systems.</span></h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-muted sm:text-xl">Field notes on voice AI, multilingual customer experience, and the workflows that turn conversations into useful outcomes.</p>
            </div>
            <div className="rounded-2xl border border-border bg-bg/85 p-5 shadow-xl shadow-primary/5 backdrop-blur sm:p-6">
              <label htmlFor="voice-blog-search" className="font-display text-base font-semibold">What are you looking to solve?</label>
              <div className="mt-3 flex h-14 items-center gap-3 rounded-2xl border border-border bg-surface px-4 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
                <Icon name="search" className="text-[20px] text-text-muted" />
                <input ref={searchRef} id="voice-blog-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search voice AI, latency, CRM..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted" />
                {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-xs text-text-muted hover:text-text">Clear</button> : <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-1 text-[10px] text-text-muted sm:inline">⌘ / Ctrl K</kbd>}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-5"><div><p className="font-display text-2xl font-bold">{VOICE_BLOG_POSTS.length}</p><p className="text-xs text-text-muted">Practical guides</p></div><div className="border-l border-border pl-4"><p className="font-display text-2xl font-bold">{categories.length}</p><p className="text-xs text-text-muted">Topics</p></div></div>
            </div>
          </div>
        </div>
      </section>

      <div className="sticky top-[var(--marketing-header-height,64px)] z-30 border-b border-border bg-bg">
        <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-5 py-3 [scrollbar-width:none] md:px-8 [&::-webkit-scrollbar]:hidden">
          <span className="mr-2 hidden shrink-0 text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted lg:inline">Browse</span>
          {[ALL_TOPICS, ...categories].map((category) => {
            const count = category === ALL_TOPICS ? VOICE_BLOG_POSTS.length : VOICE_BLOG_POSTS.filter((post) => post.category === category).length
            const active = activeCategory === category
            return <button key={category} type="button" onClick={() => setActiveCategory(category)} aria-pressed={active} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${active ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-text-muted hover:border-primary/50 hover:text-text'}`}>{category}<span className={`ml-2 ${active ? 'text-white/70' : 'text-text-muted'}`}>{count}</span></button>
          })}
        </div>
      </div>

      {!hasFilters && featured && <section className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
        <div className="mb-6 flex items-end justify-between gap-4"><div><SectionEyebrow>Featured guide</SectionEyebrow><h2 className="mt-2 font-display text-2xl font-bold sm:text-3xl">Start with the latest</h2></div><span className="hidden text-sm text-text-muted sm:block">From the Vistrow Voice team</span></div>
        <Link to={`/resources/blog/${featured.slug}`} className="group grid overflow-hidden rounded-2xl border border-border bg-surface shadow-xl shadow-primary/5 transition-transform duration-300 motion-safe:hover:-translate-y-1 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="flex min-h-[400px] flex-col p-7 sm:p-10 lg:p-12">
            <div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">{featured.category}</span><span className="text-xs text-text-muted">{featured.readTime}</span></div>
            <h3 className="mt-8 max-w-3xl font-display text-[clamp(2rem,4vw,3.5rem)] font-bold leading-[1.04] tracking-[-0.035em]">{featured.title}</h3>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-text-muted sm:text-lg">{featured.excerpt}</p>
            <div className="mt-auto flex flex-wrap items-end justify-between gap-5 pt-9"><div className="text-xs text-text-muted"><p className="font-semibold text-text">Vistrow Voice team</p><time className="mt-1 block" dateTime={featured.publishedAt}>{prettyDate(featured.publishedAt)}</time></div><span className="inline-flex items-center gap-2 text-sm font-semibold text-primary">Read the guide <Icon name="arrow_forward" className="text-[18px]" /></span></div>
          </div>
          <VoiceBlogVisual post={featured} featured />
        </Link>
      </section>}

      <section id="voice-blog-results" className="scroll-mt-36 border-y border-border bg-surface/55 py-12 md:py-16">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div><SectionEyebrow>{hasFilters ? 'Filtered library' : 'Latest from the journal'}</SectionEyebrow><h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{hasFilters ? 'Guides for your question' : 'Keep exploring'}</h2></div>
            <div className="flex items-center gap-4"><p aria-live="polite" className="text-sm text-text-muted">{visiblePosts.length} {visiblePosts.length === 1 ? 'article' : 'articles'}</p>{hasFilters && <button type="button" onClick={resetFilters} className="text-xs font-semibold text-primary hover:underline">Clear filters</button>}</div>
          </div>
          {visiblePosts.length ? <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visiblePosts.map((post) => <Link key={post.slug} to={`/resources/blog/${post.slug}`} className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-bg transition-all motion-safe:hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5">
              <VoiceBlogVisual post={post} />
              <div className="flex flex-1 flex-col p-6">
                <div className="flex items-start justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">{post.category}</span><span className="shrink-0 text-xs text-text-muted">{post.readTime}</span></div>
                <h3 className="mt-4 font-display text-xl font-bold leading-snug tracking-tight transition-colors group-hover:text-primary">{post.title}</h3>
                <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-text-muted">{post.excerpt}</p>
                <div className="mt-auto pt-6"><div className="flex items-center justify-between gap-4 border-t border-border pt-4 text-xs text-text-muted"><div><time dateTime={post.publishedAt}>{prettyDate(post.publishedAt)}</time><p className="mt-1">Vistrow Voice team</p></div><Icon name="north_east" className="text-[20px] text-primary" /></div></div>
              </div>
            </Link>)}
          </div> : <div className="mt-8 rounded-2xl border border-dashed border-border bg-bg p-10 text-center"><Icon name="search_off" className="text-[32px] text-text-muted" /><h3 className="mt-3 font-display text-lg font-semibold">No guides found</h3><p className="mt-1 text-sm text-text-muted">Try another search or choose a different topic.</p><button type="button" onClick={resetFilters} className="mt-4 text-sm font-semibold text-primary hover:underline">Clear filters</button></div>}
        </div>
      </section>
      <CTABand title="Put better conversations to work." subtitle="Try Artha live in your browser or talk with our team about your call workflow." eyebrow="Take the next step" />
    </MarketingLayout>
  )
}
