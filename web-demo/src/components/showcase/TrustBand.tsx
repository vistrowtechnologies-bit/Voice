import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../Icon'
import { Icon3D } from '../Icon3D'
import { Reveal } from '../Reveal'
import { TalkToArthaButton } from '../MarketingBits'
import { BookDemoLink } from './primitives'

export interface TrustFact {
  icon: string
  title: string
  body: string
}

// Trust facts that hold on every page. Sources: the inbound "Consent and
// recording" control, the security page, the languages FAQ and the "Is every
// call recorded and transcribed?" FAQ.
export const DEFAULT_TRUST: TrustFact[] = [
  { icon: 'verified_user', title: 'Consent and recording, your call', body: 'Require spoken consent, switch recording on or off and set how long records are kept.' },
  { icon: 'translate', title: '130+ languages', body: 'Hindi, Hinglish and 9 other Indian languages included. The agent follows the caller.' },
  { icon: 'devices', title: 'Phone and website', body: 'The same agent can answer your number and the call button on your site.' },
  { icon: 'receipt_long', title: 'Every call logged', body: 'A transcript for every call, plus the lead fields captured and the audio if recording is on.' },
]

/** Full-width violet band: trust facts plus a CTA, mid-page. */
export function TrustBand({
  eyebrow = 'Built to be trusted on a call',
  title = 'Hear it on a real call before you decide.',
  body = 'Artha answers in your language, works on your number and your website, and leaves a record of every call.',
  facts = DEFAULT_TRUST,
  placement = 'product_trust_band',
  link = { to: '/security', label: 'How call data is handled' },
}: {
  eyebrow?: string
  title?: ReactNode
  body?: ReactNode
  facts?: TrustFact[]
  placement?: string
  link?: { to: string; label: string } | null
}) {
  return (
    <section className="px-5 md:px-8">
      <div className="bento-hero relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-cyan/25 blur-[100px]" />
        <div className="relative grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-white/75">{eyebrow}</span>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white text-balance sm:text-4xl">{title}</h2>
            <p className="mt-3 max-w-md text-white/80">{body}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <TalkToArthaButton className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-[#4c1d95] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" />
              <BookDemoLink
                placement={placement}
                className="inline-flex items-center justify-center rounded-full border border-white/35 bg-white/10 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {facts.map((t, i) => (
              <Reveal key={t.title} delayMs={i * 70} className="h-full">
                <div className="h-full rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
                  <Icon3D name={t.icon} size={30} plate className="text-[22px] text-white" />
                  <h3 className="mt-3 font-display text-base font-semibold text-white">{t.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/80">{t.body}</p>
                </div>
              </Reveal>
            ))}
            {link && (
              <Link
                to={link.to}
                className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-white underline-offset-4 hover:underline sm:col-span-2 sm:min-h-0"
              >
                {link.label}
                <Icon name="arrow_forward" className="text-[16px]" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
