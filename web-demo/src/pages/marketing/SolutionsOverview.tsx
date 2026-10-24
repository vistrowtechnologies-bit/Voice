import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Icon3D } from '../../components/Icon3D'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { SOLUTIONS } from '../../lib/marketingContent'
import { pageFigures } from '../../lib/pageFigures'
import {
  FigureCard,
  Reveal,
  SectionHead,
  Shot,
  SplitHero,
  StickyCta,
  TrustBand,
  useStickyRefs,
} from '../../components/showcase'

// Every entry links to the industry page plus one closely related page. Claims
// mirror the solution pages in lib/marketingContent.ts; no prices here.
const STARTING_POINTS = [
  {
    to: '/solutions/real-estate',
    label: 'Real estate',
    first: 'Answer project enquiries and call new leads back',
    body: 'Most developers and brokers start with the calls they miss: evening and weekend enquiries, and leads from ads that nobody calls back for hours. The agent asks about budget, location, configuration and timeline, and books a site visit inside the hours you set.',
    related: { to: '/ai-telecaller', label: 'how an AI telecaller follows up leads' },
  },
  {
    to: '/solutions/healthcare',
    label: 'Healthcare and clinics',
    first: 'Take appointment requests at the front desk',
    body: 'Clinics usually begin with appointment calls and routine questions about timings, doctors and fees. The agent books from your bookable hours, and anything that sounds urgent is passed to a person instead of being answered by the agent.',
    related: { to: '/ai-receptionist', label: 'what an AI receptionist handles' },
  },
  {
    to: '/solutions/ecommerce',
    label: 'E-commerce and D2C',
    first: 'Answer order, return and product questions',
    body: 'Stores start with the repetitive calls: where an order is, how a return works, whether a size fits. Policies go in the knowledge base, and order status needs a connection to your order system through a custom function.',
    related: { to: '/product/knowledge-base', label: 'how the knowledge base keeps answers grounded' },
  },
  {
    to: '/solutions/finance',
    label: 'Finance and collections',
    first: 'Send EMI and payment reminders',
    body: 'Lenders and NBFCs tend to begin with courteous reminder calls inside a fixed calling window, with promise-to-pay dates and disputes recorded for the team. Sensitive account changes stay with people.',
    related: { to: '/product/outbound', label: 'outbound campaigns and calling rules' },
  },
  {
    to: '/solutions/support',
    label: 'Support and helpdesk',
    first: 'Resolve first-line questions and hand over the rest',
    body: 'Support teams start with the questions that repeat every day. The agent answers from approved content and, on phone calls, transfers to a colleague when the caller needs a person.',
    related: { to: '/ai-call-center', label: 'how an AI call center splits the work' },
  },
]

const FAQ = [
  {
    q: 'Which industries does Vistrow Voice support?',
    a: 'Real Estate, Healthcare & Clinics, E-commerce & D2C, Finance & Collections, and Support & Helpdesk each have a page with sample call flows and a live demo agent. The same platform also suits other businesses that take enquiries or bookings by phone.',
  },
  {
    q: 'Is the agent pre-built for my industry, or do I configure it?',
    a: 'Each solution page shows the pains and features a typical setup covers - you configure the actual agent, prompt, and knowledge base to match your business.',
  },
  {
    q: 'Can one account run agents for more than one industry use case?',
    a: 'Yes - build as many agents as you need on one account, each with its own persona, prompt, and knowledge base.',
  },
]

// Answer-engine-friendly (AEO/GEO): FAQPage structured data lets Google,
// Bing, and LLM-based answer engines quote these Q&As directly instead of
// having to scrape the accordion markup.
const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
}

const CARD_SIZES = '(min-width: 1024px) 400px, (min-width: 640px) 50vw, calc(100vw - 40px)'

export function SolutionsOverview() {
  const { heroCtaRef, endRef } = useStickyRefs()
  const platformVisual = pageFigures('/solutions', 'One platform underneath')[0]

  return (
    <MarketingLayout>
      <Seo
        title="Solutions by Industry - Vistrow Voice"
        description="Voice AI tuned to how your business takes calls - Real Estate, Healthcare, E-commerce, Finance & Collections, and Support & Helpdesk."
        path="/solutions"
        jsonLd={FAQ_JSONLD}
      />
      <SplitHero
        eyebrow="Solutions"
        title="Voice AI for your industry."
        subhead={
          <>
            One platform, tuned to how your business actually takes calls - from real-estate enquiries to collections
            reminders.
          </>
        }
        visual={pageFigures('/solutions', 'showcase-hero')[0]}
        chips={[
          { label: 'Artha · Live', live: true },
          { label: 'One agent per job', icon: 'support_agent' },
        ]}
        placement="solutions_hero"
        ctaRef={heroCtaRef}
      />

      {/* Industry cards, each led by the scene its page opens with. The first
          card spans two columns so the rows fill exactly (2+1, then 3). */}
      <section className="mx-auto max-w-7xl px-5 py-10 md:px-8 lg:py-14">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SOLUTIONS.map((s, i) => {
            const scene = pageFigures(s.to, 'showcase-hero')[0]
            const lead = i === 0
            return (
              <Reveal key={s.to} delayMs={(i % 3) * 60} className={`h-full ${lead ? 'sm:col-span-2' : ''}`}>
                <Link
                  to={s.to}
                  className={`vv-lift group flex h-full flex-col overflow-hidden rounded-3xl border ${
                    lead ? 'border-primary/40 bg-gradient-to-br from-primary/[0.12] via-surface to-surface lg:grid lg:grid-cols-2' : 'border-border bg-surface'
                  }`}
                >
                  {scene && (
                    <div className={`overflow-hidden bg-panel ${lead ? 'lg:order-2 lg:h-full' : ''}`}>
                      <Shot
                        figure={scene}
                        sizes={lead ? '(min-width: 1024px) 420px, (min-width: 640px) 90vw, calc(100vw - 40px)' : CARD_SIZES}
                        className={`aspect-[16/10] object-cover transition-transform duration-500 group-hover:scale-[1.03] ${lead ? 'lg:h-full lg:aspect-auto' : ''}`}
                      />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col justify-between p-7">
                    <div>
                      <span
                        className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                          lead ? 'bg-gradient-to-br from-primary to-magenta text-white' : 'bg-primary/12 text-primary'
                        }`}
                      >
                        <Icon3D name={s.icon ?? 'circle'} size={lead ? 34 : 38} plate={lead} className="text-[24px]" />
                      </span>
                      <h3 className={`mt-5 font-display font-semibold ${lead ? 'text-2xl' : 'text-xl'}`}>{s.label}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-text-muted">{s.desc}</p>
                    </div>
                    <span className="mt-5 flex items-center gap-1 text-sm font-semibold text-primary">
                      Explore
                      <Icon name="arrow_forward" className="text-[16px] transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              </Reveal>
            )
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8">
        <Reveal>
          <SectionHead
            eyebrow="Where teams start"
            title="The first call to hand to an agent, by industry"
            intro="A good first agent handles one frequent, repeatable kind of call with a clear next step. These are the starting points we see most often. Each industry page goes deeper, with sample conversations and a demo agent you can call in the browser."
            className="max-w-3xl"
          />
        </Reveal>
        <ol className="mt-10 grid gap-4 md:grid-cols-2">
          {STARTING_POINTS.map((item, i) => (
            <li key={item.to} className={i === STARTING_POINTS.length - 1 ? 'md:col-span-2' : ''}>
              <Reveal delayMs={(i % 2) * 70} className="h-full">
                <div className="vv-lift flex h-full gap-5 rounded-3xl border border-border bg-surface p-6">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-magenta font-display text-lg font-bold text-white shadow-[0_10px_24px_-10px_rgba(168,85,247,0.9)]">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{item.label}</p>
                    <h3 className="mt-2 font-display text-lg font-semibold">
                      <Link to={item.to} className="hover:text-primary">{item.first}</Link>
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-text-muted">{item.body}</p>
                    <p className="mt-3 text-sm text-text-muted">
                      See also{' '}
                      <Link to={item.related.to} className="font-semibold text-primary hover:underline">{item.related.label}</Link>.
                    </p>
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <TrustBand placement="solutions_trust_band" />

      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
        <div className={`grid items-center gap-10 lg:gap-14 ${platformVisual ? 'lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]' : ''}`}>
          <Reveal>
            <SectionEyebrow>Shared across every industry</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">One platform underneath</h2>
            <div className="mt-6 grid gap-5 text-sm leading-relaxed text-text-muted">
              <p className="border-t border-border pt-5">
                Every solution runs on the same{' '}
                <Link to="/product/agents" className="font-semibold text-primary hover:underline">voice agent builder</Link>:
                a persona, instructions, a voice and a default language, tested in the browser before it takes a real call.
                Agents speak{' '}
                <Link to="/languages" className="font-semibold text-primary hover:underline">130+ languages, including Hindi and English</Link>{' '}
                and follow a caller who switches mid-call.
              </p>
              <p className="border-t border-border pt-5">
                Calls reach the agent on your phone number through{' '}
                <Link to="/product/inbound" className="font-semibold text-primary hover:underline">inbound routing</Link>, from
                a{' '}
                <Link to="/product/widget" className="font-semibold text-primary hover:underline">button on your website</Link>, or
                as follow-up calls the agent places itself, always inside your calling window and Do-Not-Call list.
              </p>
              <p className="border-t border-border pt-5">
                Every call is saved with a transcript and summary, and the lead details go to{' '}
                <Link to="/integrations" className="font-semibold text-primary hover:underline">Zoho CRM, ArthaLeads, Slack, Google Sheets or a webhook</Link>.
                If you are not sure which industry fits, the{' '}
                <Link to="/best-ai-voice-calling-software-india" className="font-semibold text-primary hover:underline">buyer guide to AI voice calling software</Link>{' '}
                lists what to test first.
              </p>
            </div>
          </Reveal>
          {platformVisual && (
            <Reveal delayMs={80}>
              <FigureCard figure={platformVisual} sizes="(min-width: 1280px) 660px, (min-width: 1024px) 52vw, calc(100vw - 40px)" />
            </Reveal>
          )}
        </div>
      </section>

      {/* FAQ */}
      <FaqSection items={FAQ} />

      <div ref={endRef} />
      <CTABand />
      <StickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </MarketingLayout>
  )
}
