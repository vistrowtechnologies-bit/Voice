import { useEffect } from 'react'
import { baseStructuredData, SEO_ORIGIN, seoForPath } from '../lib/seoPages'

// This is a Vite SPA with no server-side rendering, so there's no
// react-helmet-style provider that flushes tags before the crawler sees
// them - we just mutate <head> directly. Every tag is upserted by a stable
// id/rel/property attribute (not appended fresh each render), so navigating
// between marketing pages updates the existing tags in place instead of
// piling up duplicates.
interface SeoProps {
  title: string
  description: string
  /** Path only, e.g. "/product/agents" - always resolved against the canonical marketing origin. */
  path: string
  /** Absolute image URL for social previews. Defaults to the site's OG banner. */
  image?: string
  /** Accessible description of the social image. */
  imageAlt?: string
  /** Set for thin/placeholder pages (e.g. "Coming soon") so they aren't indexed. */
  noindex?: boolean
  /** Extra JSON-LD objects specific to this page (FAQPage, Product, etc). */
  jsonLd?: object | object[]
}

const DEFAULT_IMAGE = `${SEO_ORIGIN}/og/home.png`
const DEFAULT_IMAGE_ALT = 'Vistrow Voice multilingual AI voice agent orb for phone and web conversations'
const SLACK_APP_ID = 'A0BPQRALFUN'

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

export function Seo({ title, description, path, image, imageAlt, noindex, jsonLd }: SeoProps) {
  const registered = seoForPath(path)
  const resolvedTitle = registered?.title ?? title
  const resolvedDescription = registered?.description ?? description
  const resolvedImage = registered?.image ?? image ?? DEFAULT_IMAGE
  const resolvedImageAlt = registered?.imageAlt ?? imageAlt ?? DEFAULT_IMAGE_ALT
  const resolvedNoindex = registered?.noindex ?? noindex

  useEffect(() => {
    const url = `${SEO_ORIGIN}${path}`
    document.title = resolvedTitle

    upsertMeta('name', 'description', resolvedDescription)
    upsertMeta('name', 'robots', resolvedNoindex ? 'noindex, follow' : 'index, follow')
    upsertLink('canonical', url)

    upsertMeta('property', 'og:type', 'website')
    upsertMeta('property', 'og:locale', 'en_US')
    upsertMeta('property', 'og:locale:alternate', 'en_IN')
    upsertMeta('property', 'og:site_name', 'Vistrow Voice')
    upsertMeta('property', 'og:title', resolvedTitle)
    upsertMeta('property', 'og:description', resolvedDescription)
    upsertMeta('property', 'og:url', url)
    upsertMeta('property', 'og:image', resolvedImage)
    upsertMeta('property', 'og:image:secure_url', resolvedImage)
    upsertMeta('property', 'og:image:type', 'image/png')
    upsertMeta('property', 'og:image:width', '1200')
    upsertMeta('property', 'og:image:height', '630')
    upsertMeta('property', 'og:image:alt', resolvedImageAlt)

    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', resolvedTitle)
    upsertMeta('name', 'twitter:description', resolvedDescription)
    upsertMeta('name', 'twitter:image', resolvedImage)
    upsertMeta('name', 'twitter:image:alt', resolvedImageAlt)
    upsertMeta('name', 'slack-app-id', SLACK_APP_ID)
  }, [path, resolvedDescription, resolvedImage, resolvedImageAlt, resolvedNoindex, resolvedTitle])

  const suppliedStructuredData = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : []
  const structuredData = [...(registered ? baseStructuredData(registered) : []), ...suppliedStructuredData]

  // Rendered via JSX (not injected into <head> imperatively like the tags
  // above) so prerender.mjs's renderToString pass captures it - a crawler
  // that doesn't run JS still sees the structured data. Valid anywhere in
  // the document, not just <head>.
  return structuredData.length ? (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
  ) : null
}
