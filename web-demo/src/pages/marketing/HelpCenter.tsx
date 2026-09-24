import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { HelpArticleBody } from '../../components/HelpArticleBody'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { HELP_TOPICS } from '../../content/helpArticles'
import { SEO_PAGES } from '../../lib/seoPages'

// Public help centre at /help — the same articles as the in-app Help &
// Support page (generated from server/help_articles.py), published so
// "how do I…" searches and AI answer engines can find them. Prerendered to
// static HTML by scripts/prerender.mjs; every path here has an SEO_PAGES entry.

const APP_URL = 'https://app.vistrowvoice.com'

function seoFor(path: string) {
  const entry = SEO_PAGES.find((p) => p.path === path)
  return entry ? { title: entry.title, description: entry.description } : { title: 'Vistrow Voice Help Center', description: '' }
}

function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-text-muted">
      {items.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <Icon name="chevron_right" className="text-[16px]" />}
          {c.to ? <Link to={c.to} className="hover:text-primary">{c.label}</Link> : <span className="text-text">{c.label}</span>}
        </span>
      ))}
    </nav>
  )
}

/** Client-side filter over the (small, static) article set. */
function useArticleSearch(q: string) {
  return useMemo(() => {
    const words = q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
    if (!words.length) return []
    return HELP_TOPICS.flatMap((t) => t.articles.map((a) => ({ ...a, topic: t })))
      .map((a) => ({ a, score: words.reduce((n, w) => n + (a.title.toLowerCase().includes(w) ? 5 : 0) + (a.summary.toLowerCase().includes(w) ? 3 : 0) + (a.body.toLowerCase().includes(w) ? 1 : 0), 0) }))
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, 6)
      .map((x) => x.a)
  }, [q])
}

function CtaCard() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold">Need a hand?</h2>
      <p className="text-sm text-text-muted">Customers can raise a request from Help &amp; Support in their dashboard. New to Vistrow Voice? Talk to us.</p>
      <a href={`${APP_URL}/dashboard/support`} className="flex w-fit items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-bg hover:opacity-90">
        <Icon name="login" className="text-[17px]" /> Open your dashboard
      </a>
      <Link to="/contact" className="text-sm font-semibold text-primary hover:underline">Contact sales</Link>
    </div>
  )
}

function HelpHome() {
  const [q, setQ] = useState('')
  const hits = useArticleSearch(q)
  const seo = seoFor('/help')
  return (
    <>
      <Seo title={seo.title} description={seo.description} path="/help" />
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-14 sm:px-6">
        <div className="flex flex-col items-center gap-5 text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Vistrow Voice Help Center</h1>
          <p className="max-w-2xl text-text-muted">Guides for setting up AI voice agents, phone numbers, website calls, campaigns, integrations and compliance.</p>
          <label className="relative flex w-full max-w-2xl items-center gap-3 rounded-full border border-border bg-surface px-5 py-3.5 text-left">
            <Icon name="search" className="text-[22px] text-text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Describe your issue" aria-label="Search the help center" className="w-full bg-transparent outline-none placeholder:text-text-muted" />
          </label>
          {hits.length > 0 && (
            <ul className="w-full max-w-2xl divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface text-left">
              {hits.map((h) => (
                <li key={h.slug}>
                  <Link to={`/help/${h.topic.slug}/${h.slug}`} className="flex flex-col px-5 py-3 hover:bg-surface-high/60">
                    <span className="text-sm font-semibold">{h.title}</span>
                    <span className="text-xs text-text-muted">{h.topic.title} · {h.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Browse help topics</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {HELP_TOPICS.map((t) => (
              <Link key={t.slug} to={`/help/${t.slug}`} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5 hover:border-primary/50">
                <Icon name={t.icon} className="text-[24px] text-primary" />
                <span className="font-semibold">{t.title}</span>
                <span className="text-xs text-text-muted">{t.articles.map((a) => a.title).join(' · ')}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

function TopicPage({ topicSlug }: { topicSlug: string }) {
  const topic = HELP_TOPICS.find((t) => t.slug === topicSlug)
  if (!topic) return <NotFound />
  const seo = seoFor(`/help/${topic.slug}`)
  return (
    <>
      <Seo title={seo.title} description={seo.description} path={`/help/${topic.slug}`} />
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12 sm:px-6">
        <Crumbs items={[{ label: 'Help Center', to: '/help' }, { label: topic.title }]} />
        <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight"><Icon name={topic.icon} className="text-[30px] text-primary" /> {topic.title}</h1>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {topic.articles.map((a) => (
              <li key={a.slug}>
                <Link to={`/help/${topic.slug}/${a.slug}`} className="flex items-start gap-3 px-6 py-4 hover:bg-surface-high/60">
                  <Icon name="article" className="mt-0.5 text-[20px] text-primary" />
                  <span>
                    <span className="block font-semibold">{a.title}</span>
                    <span className="block text-sm text-text-muted">{a.summary}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <CtaCard />
        </div>
      </section>
    </>
  )
}

function ArticlePage({ topicSlug, articleSlug }: { topicSlug: string; articleSlug: string }) {
  const topic = HELP_TOPICS.find((t) => t.slug === topicSlug)
  const article = topic?.articles.find((a) => a.slug === articleSlug)
  if (!topic || !article) return <NotFound />
  const path = `/help/${topic.slug}/${article.slug}`
  const seo = seoFor(path)
  return (
    <>
      <Seo title={seo.title} description={seo.description} path={path} />
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-12 sm:px-6">
        <Crumbs items={[{ label: 'Help Center', to: '/help' }, { label: topic.title, to: `/help/${topic.slug}` }, { label: article.title }]} />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <article className="rounded-2xl border border-border bg-surface px-6 py-8 sm:px-10 sm:py-10">
            <h1 className="text-3xl font-semibold tracking-tight">{article.title}</h1>
            <p className="mb-6 mt-2 text-text-muted">{article.summary}</p>
            <HelpArticleBody body={article.body} />
          </article>
          <aside className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <h2 className="px-1 text-base font-semibold">{topic.title}</h2>
              <ul>
                {topic.articles.map((a) => (
                  <li key={a.slug}>
                    <Link to={`/help/${topic.slug}/${a.slug}`} aria-current={a.slug === article.slug ? 'page' : undefined} className={`flex items-start gap-2.5 rounded-lg px-2 py-2 text-sm ${a.slug === article.slug ? 'bg-primary/10 font-semibold text-primary' : 'hover:bg-surface-high'}`}>
                      <Icon name="article" className="mt-0.5 text-[18px] text-primary" />
                      {a.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <CtaCard />
          </aside>
        </div>
      </section>
    </>
  )
}

function NotFound() {
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">That help page doesn't exist</h1>
      <Link to="/help" className="font-semibold text-primary hover:underline">Back to the Help Center</Link>
    </section>
  )
}

export function HelpCenter() {
  const { topic, article } = useParams()
  return (
    <MarketingLayout>
      {article && topic ? <ArticlePage topicSlug={topic} articleSlug={article} /> : topic ? <TopicPage topicSlug={topic} /> : <HelpHome />}
    </MarketingLayout>
  )
}
