import type { PageFigureData } from '../../lib/pageFigures'

// Non-component helpers shared by the showcase kit (kept out of the .tsx
// files so fast refresh only sees components there).

export const BOOK_DEMO_CLASS =
  'inline-flex items-center justify-center rounded-full border border-border bg-surface/70 px-6 py-3 text-sm font-bold text-text backdrop-blur transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
export const TALK_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white shadow-[0_14px_36px_-14px_rgba(147,51,234,0.8)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

// Owner rule: no vendor names on the site. One telephony mention in the
// shared copy is mapped out here until the source text changes.
export function withoutVendorNames(text: string): string {
  return text.replace(/\s*\(EnableX today\)/g, '')
}

export function srcSetFor(figure: PageFigureData): string | undefined {
  if (figure.width <= 800) return undefined
  return `${figure.src.replace(/\.webp$/, '-800.webp')} 800w, ${figure.src} ${figure.width}w`
}

export const stripStepNumber = (title: string) => title.replace(/^\d+\.\s*/, '')

export const isPortrait = (figure: PageFigureData) => figure.height > figure.width

/** Anchor id for a heading: "1. Who we are" -> "1-who-we-are". */
export const slugify = (text: string) =>
  text.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** Body text of a reading column: full-contrast 16px with a relaxed line. */
export const READING_PROSE = 'text-base leading-[1.75] text-text'
