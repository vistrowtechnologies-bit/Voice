import { useLocation } from 'react-router-dom'
import { Icon3D } from '../../components/Icon3D'
import { SectionEyebrow, TalkToArthaButton } from '../../components/MarketingBits'
import { MarketingLayout, NavLink } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { BOOK_DEMO_CLASS, ShowcaseStyles, TALK_CLASS } from '../../components/showcase'

const POPULAR: { label: string; to: string; icon: string }[] = [
  { label: 'Product', to: '/product', icon: 'smart_toy' },
  { label: 'Languages', to: '/languages', icon: 'translate' },
  { label: 'Help Center', to: '/help', icon: 'support_agent' },
  { label: 'Docs', to: '/resources/docs', icon: 'menu_book' },
  { label: 'Blog', to: '/resources/blog', icon: 'article' },
  { label: 'Contact', to: '/contact', icon: 'mail' },
]

export function NotFound() {
  const { pathname } = useLocation()
  return (
    <MarketingLayout>
      <Seo
        title="Page Not Found | Vistrow Voice"
        description="The page you requested could not be found."
        path={pathname}
        noindex
      />
      <ShowcaseStyles />
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
        </div>
        <div className="mx-auto flex min-h-[55vh] max-w-3xl flex-col items-center justify-center px-5 py-20 text-center md:px-8">
          <SectionEyebrow>404</SectionEyebrow>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight text-balance sm:text-5xl lg:text-[52px]">
            This page has moved or doesn’t exist.
          </h1>
          <p className="mt-5 text-lg text-text-muted">Return home, or try Artha live while you’re here.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <TalkToArthaButton className={TALK_CLASS} />
            <NavLink to="/" className={BOOK_DEMO_CLASS}>
              Back to Vistrow Voice
            </NavLink>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-5 pb-20 md:px-8">
        <h2 className="text-center font-display text-2xl font-bold tracking-tight">Popular pages</h2>
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {POPULAR.map((p) => (
            <li key={p.to}>
              <NavLink to={p.to} className="vv-lift flex min-h-[64px] items-center gap-3 rounded-3xl border border-border bg-surface px-4 py-3 font-semibold text-text">
                <Icon3D name={p.icon} size={32} className="text-[22px] text-primary" />
                {p.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </section>
    </MarketingLayout>
  )
}
