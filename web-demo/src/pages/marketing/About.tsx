import { Link } from 'react-router-dom'
import { MarketingLayout, NavLink } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { SectionEyebrow } from '../../components/MarketingBits'
import {
  Bento,
  ProofStrip,
  Reveal,
  SectionHead,
  SplitHero,
  SplitRow,
  StickyCta,
  TrustBand,
  useStickyRefs,
  type ProofTile,
} from '../../components/showcase'
import { ABOUT_AGENT_CARDS, ABOUT_HERO, ABOUT_ONE_AGENT } from './premium-w5/visuals'

const VALUES = [
  { icon: 'translate', title: 'Bharat-first', body: 'We build for the languages and accents India actually speaks - not an afterthought translation.' },
  { icon: 'bolt', title: 'Real-time', body: 'Low-latency, natural back-and-forth. A conversation should feel like a conversation, never a delay.' },
  { icon: 'shield', title: 'Grounded & honest', body: 'Answers tied to your knowledge base, with a strict mode that says it will check rather than guess. Every call is logged.' },
  { icon: 'diversity_3', title: 'For every business', body: 'A single clinic and a multi-team sales floor use the same platform, with plans sized by agents and call capacity.' },
]

const STATS: ProofTile[] = [
  { value: '11', label: 'Languages', icon: 'translate', tone: 'primary' },
  { value: '24/7', label: 'Always answering', icon: 'schedule', tone: 'cyan' },
  { value: '3', label: 'Call channels', icon: 'call', tone: 'success' },
  { value: 'Every', label: 'Call logged with a transcript', icon: 'receipt_long', tone: 'amber' },
]

const LINK = 'font-semibold text-primary hover:underline'

// Premium template (showcase kit): split hero with the languages visual,
// stat tiles, the values as a bento around the agent cards, the story beside
// the one-agent visual, the violet trust band and the careers band.
export function About() {
  const { heroCtaRef, endRef } = useStickyRefs()

  return (
    <MarketingLayout>
      <Seo
        title="About - Vistrow Voice"
        description="Vistrow Voice puts a capable AI agent on every call - in your customers' own language, at any hour. Voice AI, built for Bharat."
        path="/about"
      />
      <SplitHero
        eyebrow="Company"
        title="Voice AI, built for Bharat."
        subhead={
          <>
            Every business should be reachable by phone - in its customers’ own language, at any hour.
            Vistrow Voice puts a capable AI agent on the phone and on your website, so fewer enquiries,
            bookings and follow-ups slip through.
          </>
        }
        visual={ABOUT_HERO}
        placement="about_hero"
        ctaRef={heroCtaRef}
      />

      <div className="pb-4">
        <ProofStrip tiles={STATS} />
      </div>

      <Bento
        visual={ABOUT_AGENT_CARDS}
        items={VALUES}
        head={<SectionHead eyebrow="What we value" title="How we build." />}
      />

      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
        <SplitRow figure={ABOUT_ONE_AGENT} flip className="">
          <Reveal>
            <SectionHead eyebrow="Who we are" title="A Vistrow product, made in India" />
          </Reveal>
          <div className="mt-6 space-y-4 text-base leading-relaxed text-text-muted">
            <p>
              Vistrow Voice is built by Vistrow Technologies Pvt. Ltd. It is an AI voice agent platform for Indian
              businesses: agents that answer inbound calls and website visitors, call new leads back, qualify them and
              book appointments in more than 130 languages, including Hindi, English and 9 more Indian languages. The{' '}
              <Link to="/product" className={LINK}>product overview</Link>{' '}
              shows the building blocks, and the{' '}
              <Link to="/languages" className={LINK}>languages page</Link>{' '}
              explains how one agent follows a caller who switches language.
            </p>
            <p>
              We started from a simple observation: most Indian businesses already get their customers on the phone,
              but calls arrive at all hours and in many languages, and a missed call is often a lost customer. Keypad
              menus and English-only bots do not fit how people here actually speak, which is why we put mixed speech
              such as Hinglish at the centre of the product. Our{' '}
              <Link to="/vs-ivr" className={LINK}>comparison of voice AI and traditional IVR</Link>{' '}
              explains where each approach fits.
            </p>
            <p>
              We try to be specific about limits. The{' '}
              <Link to="/security" className={LINK}>security page</Link>{' '}
              lists what is in place and what is not done yet, the{' '}
              <Link to="/changelog" className={LINK}>changelog</Link>{' '}
              records what has shipped, and our{' '}
              <Link to="/privacy" className={LINK}>privacy policy</Link>{' '}
              and{' '}
              <Link to="/terms" className={LINK}>terms of service</Link>{' '}
              set out how call data is handled. Sample conversations on the site are labelled as samples, and the demo
              businesses are fictional.
            </p>
          </div>
        </SplitRow>
      </section>

      <TrustBand placement="about_trust_band" />

      {/* Points at the real Careers page - this used to be a generic CTA band
          claiming "we're hiring" with nowhere to actually apply. */}
      <div ref={endRef} />
      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <div className="relative overflow-hidden rounded-[2rem] border border-primary/25 bg-gradient-to-br from-primary/[0.14] via-surface to-surface-high p-10 text-center sm:p-16">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/25 blur-[100px]" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-cyan/20 blur-[100px]" />
          <div className="relative">
            <SectionEyebrow>Careers</SectionEyebrow>
          </div>
          <h2 className="relative mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Want to build with us?
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lg text-text-muted">
            We’re a small team working on real-time voice AI for Indian languages.
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <NavLink
              to="/careers"
              className="rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white shadow-[0_14px_36px_-14px_rgba(147,51,234,0.8)] transition-transform hover:-translate-y-0.5"
            >
              See careers
            </NavLink>
            <NavLink
              to="/contact"
              className="rounded-full border border-border bg-surface/70 px-6 py-3 text-sm font-bold text-text transition-colors hover:border-primary"
            >
              Talk to us
            </NavLink>
          </div>
        </div>
      </section>
      <StickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </MarketingLayout>
  )
}
