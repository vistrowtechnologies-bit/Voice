import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { SOLUTIONS } from '../../lib/marketingContent'

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

export function SolutionsOverview() {
  return (
    <MarketingLayout>
      <Seo
        title="Solutions by Industry - Vistrow Voice"
        description="Voice AI tuned to how your business takes calls - Real Estate, Healthcare, E-commerce, Finance & Collections, and Support & Helpdesk."
        path="/solutions"
        jsonLd={FAQ_JSONLD}
      />
      <section className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8 lg:py-24">
        <SectionEyebrow>Solutions</SectionEyebrow>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight min-[400px]:text-5xl">
          Voice AI for your industry.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-text-muted">
          One platform, tuned to how your business actually takes calls - from real-estate
          enquiries to collections reminders.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-8 md:px-8">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* Five cards: the first spans two columns so the rows fill exactly (2+1, then 3). */}
          {SOLUTIONS.map((s, i) => (
            <Link
              key={s.to}
              to={s.to}
              className={`group flex flex-col justify-between rounded-2xl border border-border bg-surface p-7 transition-colors hover:border-primary ${i === 0 ? 'sm:col-span-2' : ''}`}
            >
              <div>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-high text-cyan">
                  <Icon name={s.icon ?? 'circle'} className="text-[24px]" />
                </span>
                <h3 className="mt-5 font-display text-xl font-semibold">{s.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{s.desc}</p>
              </div>
              <span className="mt-5 flex items-center gap-1 text-sm font-semibold text-primary">
                Explore
                <Icon name="arrow_forward" className="text-[16px] transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8">
        <SectionEyebrow>Where teams start</SectionEyebrow>
        <h2 className="mt-3 max-w-2xl font-display text-2xl font-bold sm:text-3xl">
          The first call to hand to an agent, by industry
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-muted">
          A good first agent handles one frequent, repeatable kind of call with a clear next step. These are the
          starting points we see most often. Each industry page goes deeper, with sample conversations and a demo
          agent you can call in the browser.
        </p>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {STARTING_POINTS.map((item) => (
            <div key={item.to} className="rounded-2xl border border-border bg-surface p-6">
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
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
        <div className="rounded-3xl border border-border bg-surface p-8 sm:p-10">
          <SectionEyebrow>Shared across every industry</SectionEyebrow>
          <h2 className="mt-3 font-display text-2xl font-bold">One platform underneath</h2>
          <div className="mt-6 grid gap-6 text-sm leading-relaxed text-text-muted md:grid-cols-3">
            <p>
              Every solution runs on the same{' '}
              <Link to="/product/agents" className="font-semibold text-primary hover:underline">voice agent builder</Link>:
              a persona, instructions, a voice and a default language, tested in the browser before it takes a real call.
              Agents speak{' '}
              <Link to="/languages" className="font-semibold text-primary hover:underline">Hindi, English and 9 more Indian languages</Link>{' '}
              and follow a caller who switches mid-call.
            </p>
            <p>
              Calls reach the agent on your phone number through{' '}
              <Link to="/product/inbound" className="font-semibold text-primary hover:underline">inbound routing</Link>, from
              a{' '}
              <Link to="/product/widget" className="font-semibold text-primary hover:underline">button on your website</Link>, or
              as follow-up calls the agent places itself, always inside your calling window and Do-Not-Call list.
            </p>
            <p>
              Every call is saved with a transcript and summary, and the lead details go to{' '}
              <Link to="/integrations" className="font-semibold text-primary hover:underline">Zoho CRM, ArthaLeads, Slack, Google Sheets or a webhook</Link>.
              If you are not sure which industry fits, the{' '}
              <Link to="/best-ai-voice-calling-software-india" className="font-semibold text-primary hover:underline">buyer guide to AI voice calling software</Link>{' '}
              lists what to test first.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FaqSection items={FAQ} />

      <CTABand />
    </MarketingLayout>
  )
}
