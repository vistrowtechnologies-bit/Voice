import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { CTABand, LIVE_DEMO_HREF, SectionEyebrow } from '../../components/MarketingBits'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { SEO_ORIGIN, seoForPath } from '../../lib/seoPages'
import { BLOG_PAGE_COUNT, BLOG_PAGE_SIZE, BLOG_POSTS_NEWEST, EDITORS_PICKS, VOICE_BLOG_POSTS, blogPagePath, type VoiceBlogPost } from '../../content/voiceBlog'
import arthaAvatar from '../../assets/artha-avatar.webp'
import { VoiceBlogVisual, voiceBlogIcon } from '../../components/VoiceBlogVisual'

const ALL_TOPICS = 'All topics'

function prettyDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

function PostCard({ post }: { post: VoiceBlogPost }) {
  return <Link to={`/resources/blog/${post.slug}`} className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-bg transition-all motion-safe:hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5">
    <VoiceBlogVisual post={post} />
    <div className="flex flex-1 flex-col p-5">
      <div className="flex items-start justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">{post.category}</span><span className="shrink-0 text-xs text-text-muted">{post.readTime}</span></div>
      <h3 className="mt-3 font-display text-lg font-bold leading-snug tracking-tight transition-colors group-hover:text-primary">{post.title}</h3>
      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-text-muted">{post.excerpt}</p>
      <div className="mt-auto flex items-center justify-between gap-4 pt-5 text-xs text-text-muted"><time dateTime={post.publishedAt}>{prettyDate(post.publishedAt)}</time><Icon name="north_east" className="text-[18px] text-primary" /></div>
    </div>
  </Link>
}

function Pagination({ page }: { page: number }) {
  if (BLOG_PAGE_COUNT <= 1) return null
  const pages = Array.from({ length: BLOG_PAGE_COUNT }, (_, index) => index + 1)
  const step = 'inline-flex h-10 items-center gap-1 rounded-full border border-border bg-bg px-4 text-sm font-semibold transition-colors hover:border-primary/50 hover:text-primary'
  return <nav aria-label="Blog pages" className="mt-10 flex flex-wrap items-center justify-center gap-2">
    {page > 1 && <Link to={blogPagePath(page - 1)} rel="prev" className={step}><Icon name="arrow_back" className="text-[16px]" /> Newer</Link>}
    {pages.map((n) => n === page
      ? <span key={n} aria-current="page" className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">{n}</span>
      : <Link key={n} to={blogPagePath(n)} aria-label={`Page ${n}`} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-bg text-sm font-semibold text-text-muted transition-colors hover:border-primary/50 hover:text-primary">{n}</Link>)}
    {page < BLOG_PAGE_COUNT && <Link to={blogPagePath(page + 1)} rel="next" className={step}>Older <Icon name="arrow_forward" className="text-[16px]" /></Link>}
  </nav>
}

export function Blog() {
  const { page: pageParam } = useParams()
  const page = pageParam ? Number(pageParam) : 1
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState(ALL_TOPICS)
  const searchRef = useRef<HTMLInputElement>(null)
  const posts = BLOG_POSTS_NEWEST
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
  const chooseTopic = (category: string) => {
    setActiveCategory(category)
    document.getElementById('voice-blog-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const categories = useMemo(() => [...new Set(VOICE_BLOG_POSTS.map((post) => post.category))], [])
  const filteredPosts = useMemo(() => {
    const term = query.trim().toLowerCase()
    return posts.filter((post) => {
      const categoryMatch = activeCategory === ALL_TOPICS || post.category === activeCategory
      const textMatch = !term || `${post.title} ${post.excerpt} ${post.category}`.toLowerCase().includes(term)
      return categoryMatch && textMatch
    })
  }, [activeCategory, query, posts])
  if (!Number.isInteger(page) || page < 1 || page > BLOG_PAGE_COUNT || pageParam === '1') return <Navigate to="/resources/blog" replace />
  const featured = posts[0]
  const picks = EDITORS_PICKS.map((slug) => posts.find((post) => post.slug === slug)).filter((post): post is VoiceBlogPost => Boolean(post) && post!.slug !== featured.slug).slice(0, 5)
  const hasFilters = query.trim().length > 0 || activeCategory !== ALL_TOPICS
  const pagePosts = posts.slice(1 + (page - 1) * BLOG_PAGE_SIZE, 1 + page * BLOG_PAGE_SIZE)
  const visiblePosts = hasFilters ? filteredPosts : pagePosts
  const seo = seoForPath(blogPagePath(page))

  return (
    <MarketingLayout>
      <Seo
        title={seo?.title ?? 'Voice AI Guides, Product Insights & Playbooks | Vistrow Voice'}
        description={seo?.description ?? ''}
        path={blogPagePath(page)}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: page > 1 ? `Vistrow Voice Blog, page ${page}` : 'Vistrow Voice Blog',
          itemListElement: (page > 1 ? pagePosts : [featured, ...pagePosts]).map((post, index) => ({
            '@type': 'ListItem', position: index + 1, url: `${SEO_ORIGIN}/resources/blog/${post.slug}`, name: post.title,
          })),
        }}
      />

      <section className="relative overflow-hidden border-b border-border bg-surface">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgb(168_85_247/0.1)_1px,transparent_1px),linear-gradient(90deg,rgb(168_85_247/0.1)_1px,transparent_1px)] [background-size:54px_54px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 top-8 h-96 w-96 rounded-full bg-primary/15 blur-[110px]" />
        <div className="relative mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-20">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-text-muted">
            <Link to="/" className="transition-colors hover:text-text">Home</Link><span aria-hidden="true">/</span><span className="text-text">Resources</span><span aria-hidden="true">/</span>{page > 1 ? <><Link to="/resources/blog" className="transition-colors hover:text-text">Blog</Link><span aria-hidden="true">/</span><span className="text-text">Page {page}</span></> : <span className="text-text">Blog</span>}
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

      {!hasFilters && page === 1 && <section className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-14">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
          <div>
            <SectionEyebrow>Featured guide</SectionEyebrow>
            <Link to={`/resources/blog/${featured.slug}`} className="group mt-4 block overflow-hidden rounded-2xl border border-border bg-surface shadow-xl shadow-primary/5 transition-transform duration-300 motion-safe:hover:-translate-y-1">
              <VoiceBlogVisual post={featured} featured />
              <div className="p-6 sm:p-8">
                <div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">{featured.category}</span><span className="text-xs text-text-muted">{featured.readTime}</span><span className="text-xs text-text-muted">·</span><time className="text-xs text-text-muted" dateTime={featured.publishedAt}>{prettyDate(featured.publishedAt)}</time></div>
                <h2 className="mt-4 font-display text-[clamp(1.6rem,3vw,2.4rem)] font-bold leading-[1.1] tracking-[-0.03em] transition-colors group-hover:text-primary">{featured.title}</h2>
                <p className="mt-3 line-clamp-3 text-base leading-relaxed text-text-muted">{featured.excerpt}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">Read the guide <Icon name="arrow_forward" className="text-[18px]" /></span>
              </div>
            </Link>
          </div>
          <aside aria-labelledby="editors-picks">
            <SectionEyebrow>Editor&apos;s picks</SectionEyebrow>
            <h2 id="editors-picks" className="sr-only">Editor&apos;s picks</h2>
            <ol className="mt-4 divide-y divide-border rounded-2xl border border-border bg-surface">
              {picks.map((post, index) => <li key={post.slug}><Link to={`/resources/blog/${post.slug}`} className="group flex gap-4 p-4">
                <span className="font-display text-2xl font-bold leading-none text-primary/40 transition-colors group-hover:text-primary">{String(index + 1).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">{post.category}</span><span className="mt-1 block font-display text-sm font-semibold leading-snug transition-colors group-hover:text-primary">{post.title}</span><span className="mt-1 block text-xs text-text-muted">{post.readTime}</span></span>
                <img src={post.image.replace('.jpg', '-640.jpg')} alt="" width={96} height={54} loading="lazy" decoding="async" className="hidden h-[54px] w-24 shrink-0 rounded-lg border border-border object-cover sm:block" />
              </Link></li>)}
            </ol>
          </aside>
        </div>
      </section>}

      <section id="voice-blog-results" className="scroll-mt-36 border-y border-border bg-surface/55 py-12 md:py-16">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 md:px-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div><SectionEyebrow>{hasFilters ? 'Filtered library' : page > 1 ? `Page ${page} of ${BLOG_PAGE_COUNT}` : 'Latest from the journal'}</SectionEyebrow><h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{hasFilters ? 'Guides for your question' : page > 1 ? 'More guides' : 'Latest guides'}</h2></div>
              <div className="flex items-center gap-4"><p aria-live="polite" className="text-sm text-text-muted">{visiblePosts.length} {visiblePosts.length === 1 ? 'article' : 'articles'}</p>{hasFilters && <button type="button" onClick={resetFilters} className="text-xs font-semibold text-primary hover:underline">Clear filters</button>}</div>
            </div>
            {visiblePosts.length ? <div className="mt-8 grid gap-5 sm:grid-cols-2">{visiblePosts.map((post) => <PostCard key={post.slug} post={post} />)}</div>
              : <div className="mt-8 rounded-2xl border border-dashed border-border bg-bg p-10 text-center"><Icon name="search_off" className="text-[32px] text-text-muted" /><h3 className="mt-3 font-display text-lg font-semibold">No guides found</h3><p className="mt-1 text-sm text-text-muted">Try another search or choose a different topic.</p><button type="button" onClick={resetFilters} className="mt-4 text-sm font-semibold text-primary hover:underline">Clear filters</button></div>}
            {!hasFilters && <Pagination page={page} />}
          </div>
          <aside aria-label="Blog sidebar" className="space-y-5 lg:sticky lg:top-[calc(var(--marketing-header-height,64px)+76px)] lg:self-start">
            <div className="rounded-2xl border border-border bg-bg p-5">
              <h2 className="font-display text-base font-semibold">Browse by topic</h2>
              <ul className="mt-3 space-y-1">
                {categories.map((category) => <li key={category}><button type="button" onClick={() => chooseTopic(category)} aria-pressed={activeCategory === category} className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${activeCategory === category ? 'bg-primary/10 font-semibold text-primary' : 'text-text-muted hover:bg-surface hover:text-text'}`}><span className="flex items-center gap-2"><Icon name={voiceBlogIcon(category)} className="text-[17px]" />{category}</span><span className="text-xs">{VOICE_BLOG_POSTS.filter((post) => post.category === category).length}</span></button></li>)}
              </ul>
            </div>
            <div className="overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-bg to-pink-500/10 p-5">
              <img src={arthaAvatar} alt="Artha, the Vistrow Voice AI agent" width={56} height={56} loading="lazy" className="h-14 w-14 rounded-full border-2 border-primary/40 object-cover" />
              <h2 className="mt-4 font-display text-lg font-bold leading-snug">Hear an AI agent answer a call</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">Talk to Artha in your browser, in Hindi, English or your own language. No sign-up.</p>
              <a href={LIVE_DEMO_HREF} className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90">Try the live demo <Icon name="arrow_forward" className="text-[16px]" /></a>
            </div>
          </aside>
        </div>
      </section>
      <CTABand title="Put better conversations to work." subtitle="Try Artha live in your browser or talk with our team about your call workflow." eyebrow="Take the next step" />
    </MarketingLayout>
  )
}
