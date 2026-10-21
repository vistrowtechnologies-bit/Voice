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

function paragraphWithLinks(paragraph: string) {
  return paragraph.split(/(\[[^\]]+\]\(\/[^)\s]+\))/g).map((part, index) => {
    const link = /^\[([^\]]+)\]\((\/[^)\s]+)\)$/.exec(part)
    return link
      ? <Link key={index} to={link[2]} className="font-semibold text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{link[1]}</Link>
      : part
  })
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
    author: { '@type': 'Organization', name: 'Vistrow Voice', url: SEO_ORIGIN, logo: { '@type': 'ImageObject', url: `${SEO_ORIGIN}/apple-touch-icon.png` } },
    publisher: { '@type': 'Organization', name: 'Vistrow Voice', logo: { '@type': 'ImageObject', url: `${SEO_ORIGIN}/apple-touch-icon.png` } },
    mainEntityOfPage: canonical,
    articleSection: post.category,
    wordCount: [post.shortAnswer ?? '', ...post.sections.flatMap((section) => [...section.paragraphs, ...(section.points ?? [])]), ...(post.faqs ?? []).flatMap((faq) => [faq.q, faq.a])].join(' ').replace(/\[([^\]]+)\]\(\/[^)]+\)/g, '$1').trim().split(/\s+/).length,
  }
  // FAQ answers are plain text in structured data (links reduced to their words).
  const faqSchema = post.faqs?.length ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: post.faqs.map((faq) => ({ '@type': 'Question', name: faq.q, acceptedAnswer: { '@type': 'Answer', text: faq.a.replace(/\[([^\]]+)\]\(\/[^)]+\)/g, '$1') } })),
  } : null

  return (
    <MarketingLayout>
      <Seo title={post.seoTitle ?? `${post.title} | Vistrow Voice`} description={post.metaDescription ?? post.excerpt} path={`/resources/blog/${post.slug}`} jsonLd={faqSchema ? [articleSchema, faqSchema] : articleSchema} />
      <article>
        <div className="mx-auto grid max-w-7xl gap-10 px-5 pb-10 pt-8 md:px-8 md:pb-14 md:pt-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-16">
          <div className="min-w-0">
            <header>
              <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-text-muted"><Link to="/" className="hover:text-text">Home</Link><span aria-hidden="true">/</span><Link to="/resources/blog" className="hover:text-text">Blog</Link><span aria-hidden="true">/</span><span className="line-clamp-1 text-text">{post.title}</span></nav>
              <div className="mt-6 flex flex-wrap items-center gap-3"><span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">{post.category}</span><time dateTime={post.publishedAt} className="text-sm text-text-muted">{prettyDate(post.publishedAt)}</time><span aria-hidden="true" className="text-border">·</span><span className="text-sm text-text-muted">{post.readTime}</span></div>
              <h1 className="mt-4 font-display text-[clamp(1.9rem,3.4vw,2.9rem)] font-bold leading-[1.12] tracking-[-0.03em]">{post.title}</h1>
              <p className="mt-4 text-lg leading-relaxed text-text-muted">{post.excerpt}</p>
              <div className="mt-5 flex items-center gap-3"><img src="/media/vistrow-mark-96.webp" alt="Vistrow Voice logo" width={36} height={36} className="h-9 w-9 rounded-lg" /><div><p className="text-sm font-semibold">Vistrow Voice team</p><p className="text-xs text-text-muted">Product, speech, and customer experience</p></div></div>
            </header>
            <figure className="mb-8 mt-7 overflow-hidden rounded-3xl border border-border bg-surface"><img src={post.image} srcSet={`${post.image.replace('.jpg', '-640.jpg')} 640w, ${post.image} 1200w`} sizes="(min-width:1024px) 800px, 100vw" alt={post.imageAlt} width={1200} height={675} decoding="async" className="aspect-[16/9] w-full object-cover" /><figcaption className="px-5 py-3 text-xs text-text-muted">AI-generated editorial illustration; not a customer photograph.</figcaption></figure>
            {post.shortAnswer && <section aria-labelledby="short-answer" className="mb-8 rounded-3xl border-l-4 border-primary bg-surface p-6 sm:p-7"><h2 id="short-answer" className="text-xs font-bold uppercase tracking-[0.15em] text-primary">The short answer</h2><p className="mt-3 text-base leading-[1.8] text-text sm:text-lg">{paragraphWithLinks(post.shortAnswer)}</p></section>}
            <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-surface to-surface-high p-6 sm:p-8"><SectionEyebrow>In this guide</SectionEyebrow><ol className="mt-4 grid gap-2 sm:grid-cols-2">{post.sections.map((section, index) => <li key={section.heading}><a href={`#section-${index + 1}`} className="group flex items-start gap-3 rounded-xl px-3 py-2 text-sm text-text-muted transition-colors hover:bg-bg/70 hover:text-text"><span className="font-display font-bold text-primary">{String(index + 1).padStart(2, '0')}</span><span>{section.heading}</span></a></li>)}</ol></div>
            <div className="mt-10 space-y-10 sm:mt-12 sm:space-y-12">{post.sections.map((section, index) => <section key={section.heading} id={`section-${index + 1}`} className="scroll-mt-28"><h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{section.heading}</h2><div className="mt-4 space-y-4 text-base leading-[1.85] text-text-muted">{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraphWithLinks(paragraph)}</p>)}</div>{section.points && <ul className="mt-5 space-y-3">{section.points.map((point) => <li key={point} className="flex gap-3 rounded-2xl border border-border bg-surface p-4 text-sm leading-relaxed text-text-muted sm:text-base"><Icon name="check_circle" className="mt-0.5 shrink-0 text-[19px] text-primary" /><span>{paragraphWithLinks(point)}</span></li>)}</ul>}</section>)}</div>
            {post.faqs && post.faqs.length > 0 && <section id="faq" className="mt-12 scroll-mt-28"><h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Frequently asked questions</h2><div className="mt-5 space-y-3">{post.faqs.map((faq) => <div key={faq.q} className="rounded-2xl border border-border bg-surface p-5"><h3 className="font-semibold text-text">{faq.q}</h3><p className="mt-2 text-sm leading-relaxed text-text-muted sm:text-base">{paragraphWithLinks(faq.a)}</p></div>)}</div></section>}
            {post.sources.length > 0 && <section className="mt-12 rounded-2xl border border-border bg-surface p-6"><h2 className="font-display text-xl font-bold">Sources and references</h2><p className="mt-2 text-sm text-text-muted">Published sources behind the facts and figures. The examples and checklists above are our own guidance.</p><ul className="mt-4 space-y-2">{post.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline underline-offset-4">{source.title}</a></li>)}</ul></section>}
            <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6"><div className="flex items-center gap-2 text-sm text-text-muted"><Icon name="article" className="text-[18px] text-primary" />{post.category}</div><Link to="/resources/blog" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">All articles <Icon name="arrow_forward" className="text-[17px]" /></Link></div>
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start"><VoiceBlogExplorer key={post.slug} post={post} /></aside>
        </div>
      </article>
      <CTABand title="Turn your next call into a better experience." subtitle="Hear how Artha handles a conversation, or talk through your use case with our team." eyebrow="See Vistrow Voice in action" />
    </MarketingLayout>
  )
}
