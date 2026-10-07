import { Link, Navigate, useParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { SEO_ORIGIN } from '../../lib/seoPages'
import { VOICE_BLOG_POSTS } from '../../content/voiceBlog'
import { VoiceBlogExplorer } from '../../components/VoiceBlogExplorer'

function prettyDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

export function BlogPost() {
  const { slug = '' } = useParams()
  const post = VOICE_BLOG_POSTS.find((candidate) => candidate.slug === slug)

  if (!post) return <Navigate to="/404" replace />

  const canonical = `${SEO_ORIGIN}/resources/blog/${post.slug}`
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    image: { '@type': 'ImageObject', url: `${SEO_ORIGIN}${post.image}`, width: 1200, height: 675, caption: post.imageAlt },
    author: { '@type': 'Organization', name: 'Vistrow Voice', url: SEO_ORIGIN },
    publisher: { '@type': 'Organization', name: 'Vistrow Voice', logo: { '@type': 'ImageObject', url: `${SEO_ORIGIN}/apple-touch-icon.png` } },
    mainEntityOfPage: canonical,
    articleSection: post.category,
    wordCount: post.sections.flatMap((section) => [...section.paragraphs, ...(section.points ?? [])]).join(' ').split(/\s+/).length,
  }

  return (
    <MarketingLayout>
      <Seo title={`${post.title} | Vistrow Voice`} description={post.excerpt} path={`/resources/blog/${post.slug}`} jsonLd={articleSchema} />
      <article>
        <header className="relative overflow-hidden border-b border-border bg-surface">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-28 h-96 w-96 rounded-full bg-primary/15 blur-[100px]" />
          <div className="relative mx-auto max-w-5xl px-5 py-12 md:px-8 md:py-16">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-text-muted"><Link to="/" className="hover:text-text">Home</Link><span aria-hidden="true">/</span><Link to="/resources/blog" className="hover:text-text">Blog</Link><span aria-hidden="true">/</span><span className="line-clamp-1 text-text">{post.title}</span></nav>
            <div className="mt-10"><Link to="/resources/blog" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-primary"><Icon name="arrow_back" className="text-[17px]" /> Vistrow Voice Journal</Link></div>
            <div className="mt-5 flex flex-wrap items-center gap-3"><span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">{post.category}</span><time dateTime={post.publishedAt} className="text-sm text-text-muted">{prettyDate(post.publishedAt)}</time><span aria-hidden="true" className="text-border">·</span><span className="text-sm text-text-muted">{post.readTime}</span></div>
            <h1 className="mt-6 max-w-4xl font-display text-[clamp(2.4rem,5vw,4.8rem)] font-bold leading-[1.03] tracking-[-0.045em]">{post.title}</h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-text-muted sm:text-xl">{post.excerpt}</p>
            <div className="mt-8 flex items-center gap-3 border-t border-border pt-5"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-fuchsia-500 text-white"><Icon name="graphic_eq" className="text-[20px]" /></span><div><p className="text-sm font-semibold">Vistrow Voice team</p><p className="text-xs text-text-muted">Product, speech, and customer experience</p></div></div>
          </div>
        </header>

        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-10 md:px-8 md:py-14 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-16">
          <div className="min-w-0">
            <figure className="mb-8 overflow-hidden rounded-3xl border border-border bg-surface"><img src={post.image} srcSet={`${post.image.replace('.jpg', '-640.jpg')} 640w, ${post.image} 1200w`} sizes="(min-width:1024px) 800px, 100vw" alt={post.imageAlt} width={1200} height={675} decoding="async" className="aspect-[16/9] w-full object-cover" /><figcaption className="px-5 py-3 text-xs text-text-muted">AI-generated editorial illustration; not a customer photograph.</figcaption></figure>
            <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-surface to-surface-high p-6 sm:p-8"><SectionEyebrow>In this guide</SectionEyebrow><ol className="mt-4 grid gap-2 sm:grid-cols-2">{post.sections.map((section, index) => <li key={section.heading}><a href={`#section-${index + 1}`} className="group flex items-start gap-3 rounded-xl px-3 py-2 text-sm text-text-muted transition-colors hover:bg-bg/70 hover:text-text"><span className="font-display font-bold text-primary">{String(index + 1).padStart(2, '0')}</span><span>{section.heading}</span></a></li>)}</ol></div>
            <div className="mt-10 space-y-10 sm:mt-12 sm:space-y-12">{post.sections.map((section, index) => <section key={section.heading} id={`section-${index + 1}`} className="scroll-mt-28"><h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{section.heading}</h2><div className="mt-4 space-y-4 text-base leading-[1.85] text-text-muted">{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>{section.points && <ul className="mt-5 space-y-3">{section.points.map((point) => <li key={point} className="flex gap-3 rounded-2xl border border-border bg-surface p-4 text-sm leading-relaxed text-text-muted sm:text-base"><Icon name="check_circle" className="mt-0.5 shrink-0 text-[19px] text-primary" /><span>{point}</span></li>)}</ul>}</section>)}</div>
            {post.sources.length > 0 && <section className="mt-12 rounded-2xl border border-border bg-surface p-6"><h2 className="font-display text-xl font-bold">Technical references</h2><p className="mt-2 text-sm text-text-muted">Documentation behind the technical details. The examples and checklists above are our implementation guidance.</p><ul className="mt-4 space-y-2">{post.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline underline-offset-4">{source.title}</a></li>)}</ul></section>}
            <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6"><div className="flex items-center gap-2 text-sm text-text-muted"><Icon name="article" className="text-[18px] text-primary" />{post.category}</div><Link to="/resources/blog" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">All articles <Icon name="arrow_forward" className="text-[17px]" /></Link></div>
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start"><VoiceBlogExplorer key={post.slug} post={post} /></aside>
        </div>
      </article>
      <CTABand title="Turn your next call into a better experience." subtitle="Hear how Artha handles a conversation, or talk through your use case with our team." eyebrow="See Vistrow Voice in action" />
    </MarketingLayout>
  )
}
