import { useEffect } from 'react'

// This is a Vite SPA with no server-side rendering, so there's no
// react-helmet-style provider that flushes tags before the crawler sees
// them — we just mutate <head> directly. Every tag is upserted by a stable
// id/rel/property attribute (not appended fresh each render), so navigating
// between marketing pages updates the existing tags in place instead of
// piling up duplicates.
interface SeoProps {
  title: string
  description: string
  /** Path only, e.g. "/product/agents" — always resolved against the canonical marketing origin. */
  path: string
  /** Absolute image URL for social previews. Defaults to the site's OG banner. */
  image?: string
  /** Set for thin/placeholder pages (e.g. "Coming soon") so they aren't indexed. */
  noindex?: boolean
  /** Extra JSON-LD objects specific to this page (FAQPage, Product, etc). */
  jsonLd?: object | object[]
}

const CANONICAL_ORIGIN = 'https://vistrowvoice.com'
const DEFAULT_IMAGE = `${CANONICAL_ORIGIN}/og-image.png`
const JSONLD_SCRIPT_ID = 'seo-page-jsonld'

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

export function Seo({ title, description, path, image = DEFAULT_IMAGE, noindex, jsonLd }: SeoProps) {
  useEffect(() => {
    const url = `${CANONICAL_ORIGIN}${path}`
    document.title = title

    upsertMeta('name', 'description', description)
    upsertMeta('name', 'robots', noindex ? 'noindex, follow' : 'index, follow')
    upsertLink('canonical', url)

    upsertMeta('property', 'og:type', 'website')
    upsertMeta('property', 'og:site_name', 'Vistrow Voice')
    upsertMeta('property', 'og:title', title)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', url)
    upsertMeta('property', 'og:image', image)

    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', title)
    upsertMeta('name', 'twitter:description', description)
    upsertMeta('name', 'twitter:image', image)

    const existingScript = document.getElementById(JSONLD_SCRIPT_ID)
    if (existingScript) existingScript.remove()
    if (jsonLd) {
      const script = document.createElement('script')
      script.id = JSONLD_SCRIPT_ID
      script.type = 'application/ld+json'
      script.textContent = JSON.stringify(jsonLd)
      document.head.appendChild(script)
    }

    // Page-specific JSON-LD shouldn't leak onto whatever page mounts next.
    return () => {
      document.getElementById(JSONLD_SCRIPT_ID)?.remove()
    }
  }, [title, description, path, image, noindex, jsonLd])

  return null
}
