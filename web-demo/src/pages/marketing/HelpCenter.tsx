import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { HelpArticleBody } from '../../components/HelpArticleBody'
import { HelpVideoPlayer } from '../../components/HelpVideo'
import { Icon } from '../../components/Icon'
import { Icon3D } from '../../components/Icon3D'
import { CTABand } from '../../components/MarketingBits'
import { MarketingLayout, NavLink } from '../../components/MarketingLayout'
import { Reveal } from '../../components/Reveal'
import { Seo } from '../../components/Seo'
import {
  HeroFacts,
  IconTile,
  ReadingFeedback,
  ReadingLayout,
  ReadingPrevNext,
  ReadingRelated,
  SectionHead,
  SplitHero,
  StickyCta,
  slugify,
  useStickyRefs,
  type ReadingLink,
} from '../../components/showcase'
import { HELP_TOPICS } from '../../content/helpArticles'
import { SEO_PAGES } from '../../lib/seoPages'
import type { HelpArticle, HelpTopic } from '../../lib/types'

// Public help centre at /help — the same articles as the in-app Help &
// Support page (generated from server/help_articles.py), published so
// "how do I…" searches and AI answer engines can find them. Prerendered to
// static HTML by scripts/prerender.mjs; every path here has an SEO_PAGES entry.

// Topic icons with a 3D version; the generated topic icon is the fallback.
const TOPIC_ICON: Record<string, string> = {
  voices: 'record_voice_over',
  inbound: 'call_received',
  integrations: 'hub',
  compliance: 'gavel',
  billing: 'payments',
  settings: 'tune',
}
const topicIcon = (t: HelpTopic) => TOPIC_ICON[t.slug] ?? t.icon

const ALL_ARTICLES = HELP_TOPICS.flatMap((topic) => topic.articles.map((article) => ({ topic, article })))
const VIDEO_COUNT = ALL_ARTICLES.filter((x) => x.article.video).length
const POPULAR = ['get-started', 'build-with-ai', 'add-widget', 'route-inbound-calls', 'run-a-campaign', 'connect-integrations']

const articlePath = (t: HelpTopic, a: HelpArticle) => `/help/${t.slug}/${a.slug}`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function seoFor(path: string) {
  const entry = SEO_PAGES.find((p) => p.path === path)
  return entry ? { title: entry.title, description: entry.description } : { title: 'Vistrow Voice Help Center', description: '' }
}

function headingsOf(body: string) {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('## '))
    .map((l) => ({ id: slugify(l.slice(3)), label: l.slice(3) }))
}

/** Client-side filter over the (small, static) article set. */
function useArticleSearch(q: string) {
  return useMemo(() => {
    const words = q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
    if (!words.length) return []
    return ALL_ARTICLES.map(({ topic, article: a }) => ({ ...a, topic }))
      .map((a) => ({ a, score: words.reduce((n, w) => n + (a.title.toLowerCase().includes(w) ? 5 : 0) + (a.summary.toLowerCase().includes(w) ? 3 : 0) + (a.body.toLowerCase().includes(w) ? 1 : 0), 0) }))
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, 6)
      .map((x) => x.a)
  }, [q])
}

function HelpSearch({ large = false, shortcut = false }: { large?: boolean; shortcut?: boolean }) {
  const [q, setQ] = useState('')
  const [keys, setKeys] = useState('⌘K')
  const input = useRef<HTMLInputElement>(null)
  const hits = useArticleSearch(q)
  const id = useId()
  useEffect(() => {
    if (!shortcut) return
    if (!/Mac|iPhone|iPad/.test(navigator.platform)) setKeys('Ctrl K')
    const onKey = (e: KeyboardEvent) => {
      const el = input.current
      // The same search renders in the desktop nav and the phone drawer; only the visible one takes focus.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k' && el?.offsetParent) {
        e.preventDefault()
        el.focus()
        el.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcut])
  return (
    <div role="search" className="w-full">
      <label
        className={`relative flex w-full items-center gap-3 rounded-full border border-border bg-surface text-left shadow-[0_20px_40px_-32px_rgba(76,29,149,0.6)] focus-within:border-primary ${
          large ? 'px-5 py-3.5' : 'min-h-[44px] px-4 py-2'
        }`}
      >
        <Icon name="search" className={`${large ? 'text-[22px]' : 'text-[20px]'} text-text-muted`} />
        <input
          ref={input}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={large ? 'Describe your issue' : 'Search help'}
          aria-label="Search the help center"
          aria-controls={id}
          aria-keyshortcuts={shortcut ? 'Meta+K Control+K' : undefined}
          className={`min-h-[28px] w-full min-w-0 bg-transparent outline-none placeholder:text-text-muted ${large ? 'text-base' : 'text-sm'}`}
        />
        {shortcut && (
          <kbd className="hidden shrink-0 rounded-md border border-border bg-bg px-1.5 py-0.5 font-sans text-[11px] font-semibold text-text-muted lg:inline">{keys}</kbd>
        )}
      </label>
      <div id={id} aria-live="polite">
        {hits.length > 0 && (
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface text-left">
            {hits.map((h) => (
              <li key={`${h.topic.slug}/${h.slug}`}>
                <Link to={articlePath(h.topic, h)} className="flex min-h-[44px] flex-col justify-center px-4 py-2.5 hover:bg-surface-high/60">
                  <span className="text-sm font-semibold text-text">{h.title}</span>
                  <span className="text-xs text-text-muted">
                    {h.topic.title} · {h.summary}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {q.trim().length > 2 && hits.length === 0 && (
          <p className="mt-2 px-2 text-sm text-text-muted">
            No articles match. Try other words, or <Link to="/contact" className="font-semibold text-primary hover:underline">ask our team</Link>.
          </p>
        )}
      </div>
    </div>
  )
}

/** Docs-style left navigation: every topic as a group with its guides; the current topic is open. */
function HelpNav({ topicSlug, articleSlug }: { topicSlug: string; articleSlug?: string }) {
  const item = (active: boolean) =>
    `flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm leading-snug ${
      active ? 'bg-primary/10 font-semibold text-primary' : 'text-text-muted hover:bg-surface-high hover:text-text'
    }`
  return (
    <nav aria-label="Help topics" className="flex flex-col gap-0.5">
      <Link to="/help" className={item(false)}>
        <Icon name="home" className="mr-2.5 text-[18px]" /> Help Center home
      </Link>
      {HELP_TOPICS.map((t) => {
        const current = t.slug === topicSlug
        return (
          <details key={`${t.slug}-${current}`} open={current} className="group">
            <summary
              className={`flex min-h-[44px] cursor-pointer list-none items-center gap-2.5 rounded-lg px-3 text-sm font-semibold hover:bg-surface-high [&::-webkit-details-marker]:hidden ${
                current ? 'text-text' : 'text-text-muted hover:text-text'
              }`}
            >
              <Icon3D name={topicIcon(t)} size={22} className="text-[18px] text-primary" />
              <span className="flex-1">{t.title}</span>
              <Icon name="expand_more" className="text-[18px] text-text-muted transition-transform group-open:rotate-180" />
            </summary>
            <ul className="mb-1 ml-[23px] border-l border-border pl-2">
              <li>
                <Link to={`/help/${t.slug}`} aria-current={current && !articleSlug ? 'page' : undefined} className={item(current && !articleSlug)}>
                  Overview
                </Link>
              </li>
              {t.articles.map((a) => {
                const active = current && a.slug === articleSlug
                return (
                  <li key={a.slug}>
                    <Link to={articlePath(t, a)} aria-current={active ? 'page' : undefined} className={item(active)}>
                      {a.title}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </details>
        )
      })}
    </nav>
  )
}

function HelpHome() {
  const seo = seoFor('/help')
  const { heroCtaRef, endRef } = useStickyRefs()
  const popular = POPULAR.map((slug) => ALL_ARTICLES.find((x) => x.article.slug === slug)).filter((x) => x !== undefined)
  return (
    <>
      <Seo title={seo.title} description={seo.description} path="/help" />
      <SplitHero
        eyebrow="Help Center"
        title="Vistrow Voice Help Center"
        subhead="Guides for setting up AI voice agents, phone numbers, website calls, campaigns, integrations and compliance."
        actions={<HelpSearch large />}
        ctaRef={heroCtaRef}
        trust={
          <HeroFacts
            facts={[
              { value: String(HELP_TOPICS.length), label: 'Topics' },
              { value: String(ALL_ARTICLES.length), label: 'Guides' },
              { value: String(VIDEO_COUNT), label: 'How-to videos' },
            ]}
          />
        }
        media={
          <div className="rounded-[2rem] border border-border bg-surface p-5 shadow-[0_40px_80px_-48px_rgba(76,29,149,0.7)] sm:p-7">
            <p className="text-xs font-bold uppercase tracking-widest text-cyan">Popular guides</p>
            <ul className="mt-3 flex flex-col">
              {popular.map(({ topic, article }) => (
                <li key={article.slug} className="border-t border-border first:border-t-0">
                  <Link to={articlePath(topic, article)} className="group flex min-h-[56px] items-center gap-4 py-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                      <Icon3D name={topicIcon(topic)} size={34} className="text-[22px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-text group-hover:text-primary">{article.title}</span>
                      <span className="block text-sm text-text-muted">{article.summary}</span>
                    </span>
                    {article.video && (
                      <span className="hidden shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-text-muted sm:flex">
                        <Icon name="play_arrow" className="text-[16px] text-primary" /> Video
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        }
      />

      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
        <Reveal>
          <SectionHead eyebrow="Browse help topics" title="A guide for every part of the dashboard." className="mb-10" />
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HELP_TOPICS.map((t, i) => (
            <Reveal key={t.slug} delayMs={(i % 3) * 70} className="h-full">
              <Link
                to={`/help/${t.slug}`}
                className={`vv-lift flex h-full flex-col rounded-3xl border p-6 ${
                  i === 0 ? 'border-primary/40 bg-gradient-to-br from-primary/[0.14] via-surface to-surface' : 'border-border bg-surface'
                }`}
              >
                <IconTile name={topicIcon(t)} strong={i === 0} shrink />
                <h3 className="mt-5 font-display text-lg font-semibold text-text">{t.title}</h3>
                <p className="mt-1 text-xs font-bold uppercase tracking-widest text-text-muted">{plural(t.articles.length, 'guide')}</p>
                <p className="mt-3 text-sm leading-relaxed text-text-muted">{t.articles.map((a) => a.title).join(' · ')}</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-4 md:px-8">
        <div className="grid gap-4 rounded-3xl border border-border bg-surface p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <h2 className="font-display text-xl font-bold">Already a customer?</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">
              Raise a request from Help &amp; Support in your dashboard, or ask the in-app assistant about your own agents and calls.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <NavLink
              to="/login"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-border bg-surface px-5 text-sm font-bold text-text transition-colors hover:border-primary hover:text-primary"
            >
              <Icon name="login" className="text-[18px]" /> Sign in
            </NavLink>
            <Link
              to="/contact"
              className="inline-flex min-h-[44px] items-center rounded-full border border-border bg-surface px-5 text-sm font-bold text-text transition-colors hover:border-primary hover:text-primary"
            >
              Contact sales
            </Link>
          </div>
        </div>
      </section>

      <div ref={endRef} />
      <CTABand />
      <StickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </>
  )
}

function TopicPage({ topicSlug }: { topicSlug: string }) {
  const index = HELP_TOPICS.findIndex((t) => t.slug === topicSlug)
  const topic = HELP_TOPICS[index]
  if (!topic) return <NotFound />
  const seo = seoFor(`/help/${topic.slug}`)
  const prev = HELP_TOPICS[index - 1]
  const next = HELP_TOPICS[index + 1]
  // The six topics after this one (wrapping), so single-guide topics still lead somewhere.
  const more = Array.from({ length: 6 }, (_, i) => HELP_TOPICS[(index + 1 + i) % HELP_TOPICS.length])
  return (
    <>
      <Seo title={seo.title} description={seo.description} path={`/help/${topic.slug}`} />
      <ReadingLayout
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Help Center', to: '/help' }, { label: topic.title }]}
        eyebrow="Help topic"
        title={topic.title}
        lede={`${plural(topic.articles.length, 'guide')} for the ${topic.title} part of the Vistrow Voice dashboard.`}
        search={<HelpSearch shortcut />}
        sidebar={<HelpNav topicSlug={topic.slug} />}
        sidebarLabel="Browse help"
        wide
        placement="help_topic"
        after={
          <>
            <ReadingPrevNext
              prev={prev && { label: prev.title, to: `/help/${prev.slug}`, kicker: 'Topic' }}
              next={next && { label: next.title, to: `/help/${next.slug}`, kicker: 'Topic' }}
            />
            <ReadingRelated
              eyebrow="Keep exploring"
              title="More topics"
              items={more.map((t) => ({ label: t.title, to: `/help/${t.slug}`, icon: topicIcon(t), body: t.articles.map((a) => a.title).join(' · ') }))}
            />
          </>
        }
      >
        <ul className="flex flex-col gap-4">
          {topic.articles.map((a) => (
            <li key={a.slug}>
              <Link to={articlePath(topic, a)} className="vv-lift group flex gap-4 rounded-3xl border border-border bg-surface p-5 sm:p-6">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <Icon3D name="article" size={34} className="text-[22px]" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-semibold text-text group-hover:text-primary">{a.title}</h2>
                  <p className="mt-1 text-base leading-relaxed text-text">{a.summary}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-primary">
                    <span className="inline-flex items-center gap-1">
                      Read the guide <Icon name="arrow_forward" className="text-[16px]" />
                    </span>
                    {a.video && (
                      <span className="inline-flex items-center gap-1 text-text-muted">
                        <Icon name="play_arrow" className="text-[16px]" /> Includes a video
                      </span>
                    )}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </ReadingLayout>
    </>
  )
}

function ArticlePage({ topicSlug, articleSlug }: { topicSlug: string; articleSlug: string }) {
  const topic = HELP_TOPICS.find((t) => t.slug === topicSlug)
  const article = topic?.articles.find((a) => a.slug === articleSlug)
  if (!topic || !article) return <NotFound />
  const path = articlePath(topic, article)
  const seo = seoFor(path)
  const at = ALL_ARTICLES.findIndex((x) => x.article === article)
  const link = (x?: (typeof ALL_ARTICLES)[number]): ReadingLink | undefined =>
    x && { label: x.article.title, to: articlePath(x.topic, x.article), kicker: x.topic === topic ? undefined : x.topic.title }
  // Same-topic guides first, then the opening guide of the next topics.
  const related = [
    ...topic.articles.filter((a) => a !== article).map((a) => ({ topic, article: a })),
    ...Array.from({ length: 4 }, (_, i) => HELP_TOPICS[(HELP_TOPICS.indexOf(topic) + 1 + i) % HELP_TOPICS.length]).map((t) => ({ topic: t, article: t.articles[0] })),
  ].slice(0, 4)
  const minutes = Math.max(1, Math.round(article.body.split(/\s+/).length / 200))
  return (
    <>
      <Seo title={seo.title} description={seo.description} path={path} />
      <ReadingLayout
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Help Center', to: '/help' }, { label: topic.title, to: `/help/${topic.slug}` }, { label: article.title }]}
        eyebrow={topic.title}
        title={article.title}
        lede={article.summary}
        meta={
          <>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="schedule" className="text-[16px]" /> {minutes} min read
            </span>
            {article.video && (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="play_arrow" className="text-[16px]" /> Includes a video
              </span>
            )}
          </>
        }
        search={<HelpSearch shortcut />}
        sidebar={<HelpNav topicSlug={topic.slug} articleSlug={article.slug} />}
        sidebarLabel="Browse help"
        toc={headingsOf(article.body)}
        mobileLabel="On this page"
        wide
        placement="help_article"
        after={
          <>
            <ReadingFeedback />
            <ReadingPrevNext prev={link(ALL_ARTICLES[at - 1])} next={link(ALL_ARTICLES[at + 1])} />
            <ReadingRelated
              eyebrow="Keep reading"
              title="Related articles"
              items={related.map((x) => ({ label: x.article.title, to: articlePath(x.topic, x.article), kicker: x.topic.title, body: x.article.summary, icon: topicIcon(x.topic) }))}
            />
          </>
        }
      >
        <article>
          {article.video && (
            <div className="mb-8">
              <HelpVideoPlayer slug={article.video} />
            </div>
          )}
          <HelpArticleBody body={article.body} variant="reading" />
        </article>
      </ReadingLayout>
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
