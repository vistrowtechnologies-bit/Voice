import { Link, useLocation } from 'react-router-dom'
import { PAGE_GUIDES } from '../content/pageGuides'

// "Related guides" sentences for the current marketing page (content/pageGuides.ts).
export function PageGuides() {
  const { pathname } = useLocation()
  const sentences = PAGE_GUIDES[pathname.replace(/\/$/, '') || '/']
  if (!sentences?.length) return null
  return (
    <section aria-label="Related guides" className="mx-auto max-w-7xl space-y-3 px-5 py-12 md:px-8">
      <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Related guides</h2>
      {sentences.map((sentence) => (
        <p key={sentence} className="max-w-3xl text-base leading-relaxed text-text-muted">
          {sentence.split(/(\[[^\]]+\]\(\/[^)\s]+\))/g).map((part, index) => {
            const link = /^\[([^\]]+)\]\((\/[^)\s]+)\)$/.exec(part)
            return link ? (
              <Link key={index} to={link[2]} className="font-semibold text-primary underline-offset-4 hover:underline">
                {link[1]}
              </Link>
            ) : (
              part
            )
          })}
        </p>
      ))}
    </section>
  )
}
