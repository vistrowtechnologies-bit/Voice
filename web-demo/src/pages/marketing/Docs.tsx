import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MarketingLayout, NavLink } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, TalkToArthaButton } from '../../components/MarketingBits'
import { Reveal } from '../../components/Reveal'
import {
  BookDemoLink,
  FeatureCards,
  ItemLink,
  ReadingHero,
  SectionHead,
  StickyCta,
  TALK_CLASS,
  Timeline,
  useStickyRefs,
  type FeatureItem,
  type TimelineStep,
} from '../../components/showcase'

// Replaces the old "Docs - coming soon" stub. A dead docs link reads as an
// unfinished *product*, not just unfinished marketing, so this is
// deliberately a real, complete single-page guide rather than a shell for
// a docs site that doesn't exist yet. Every step here describes something
// the dashboard can actually do today.

interface Step {
  n: string
  title: string
  body: string
  icon: string
  to: string
}

const QUICKSTART: Step[] = [
  {
    n: '01',
    icon: 'smart_toy',
    to: '/help/agents/create-and-edit-agent',
    title: 'Create your agent',
    body: 'Dashboard → Agents → New Agent. Give it a name, pick a voice and a default language, and write the persona - who it is, what business it represents, and what it should try to achieve on a call.',
  },
  {
    n: '02',
    icon: 'menu_book',
    to: '/help/knowledge-base/add-knowledge',
    title: 'Add your knowledge',
    body: 'Dashboard → Knowledge Base. Upload PDFs or documents and they’re extracted into clean question–answer pairs the agent retrieves from. Turn on strict mode if the agent should only ever answer from this material.',
  },
  {
    n: '03',
    icon: 'science',
    to: '/help/testing-lab/quick-browser-test',
    title: 'Test it in the browser',
    body: 'Hit the mic button on the agent card to talk to it immediately - same prompt, same voice, same knowledge base it will use on real calls. No phone number needed.',
  },
  {
    n: '04',
    icon: 'call_received',
    to: '/help/phone-numbers/connect-a-number',
    title: 'Connect a channel',
    body: 'Point a phone number at the agent under Phone Numbers, or install the website widget under Website Widget for browser calls. One agent can serve all channels at once.',
  },
  {
    n: '05',
    icon: 'hub',
    to: '/help/integrations/connect-integrations',
    title: 'Send the results somewhere',
    body: 'Dashboard → Integrations. Connect a CRM, Slack, Sheets, or any webhook so qualified leads and transcripts land where your team already works.',
  },
]

const CONCEPTS: { term: string; def: string; icon: string; to: string }[] = [
  {
    term: 'Agent',
    icon: 'smart_toy',
    to: '/help/agents/create-and-edit-agent',
    def: 'One configured personality: persona, prompt, voice, language, knowledge base, and tools. An agent is what actually takes a call. You can run several - one per brand, location, or campaign.',
  },
  {
    term: 'Credit',
    icon: 'account_balance_wallet',
    to: '/help/billing/how-credits-work',
    def: 'Roughly one minute of conversation. Phone calls draw at a higher rate than browser calls, since they carry telecom cost. Every channel spends from the same monthly pool.',
  },
  {
    term: 'Knowledge base',
    icon: 'menu_book',
    to: '/help/knowledge-base/add-knowledge',
    def: 'The uploaded material your agent retrieves answers from. In strict mode the agent refuses to answer anything not grounded in it, rather than guessing.',
  },
  {
    term: 'Channel',
    icon: 'call_split',
    to: '/help/inbound/route-inbound-calls',
    def: 'How the call reaches the agent: inbound phone, outbound campaign, or a browser call from your website widget. Billing and analytics break down per channel.',
  },
  {
    term: 'Campaign',
    icon: 'campaign',
    to: '/help/outbound/run-a-campaign',
    def: 'A list of contacts the agent dials through automatically - reminders, follow-ups, collections. Supports {{variables}} for per-contact personalisation and scheduled start times.',
  },
  {
    term: 'Compliance gate',
    icon: 'verified_user',
    to: '/help/compliance/calling-rules',
    def: 'Every outbound dial is checked against your Do-Not-Call registry and calling window before it leaves the platform. A blocked dial is logged, never placed.',
  },
]

const HOWTO: { icon: string; title: string; body: string; to: string }[] = [
  {
    icon: 'dialpad',
    to: '/help/phone-numbers/connect-a-number',
    title: 'Use your existing phone number',
    body: 'Add the number under Phone Numbers and route it to an agent. You keep the number your customers already know, so there is nothing to port or re-advertise.',
  },
  {
    icon: 'code',
    to: '/help/website-widget/add-widget',
    title: 'Install the website widget',
    body: 'Copy the one-line script tag from Website Widget and paste it before your closing </body> tag. On WordPress, install the plugin and paste your site key instead.',
  },
  {
    icon: 'event',
    to: '/help/appointments/manage-appointments',
    title: 'Let the agent book appointments',
    body: 'Set your availability under Settings → Availability. The agent then checks real free slots during the call and books directly, without double-booking.',
  },
  {
    icon: 'webhook',
    to: '/help/integrations/connect-integrations',
    title: 'Receive leads over webhook',
    body: 'Add your endpoint under Integrations. On every completed call you receive JSON with contact details, captured fields, sentiment, duration, channel, and the full transcript.',
  },
  {
    icon: 'key',
    to: '/help/settings/notifications-and-privacy',
    title: 'Use the API',
    body: 'Generate a key under Settings → API Keys. Keys are shown once and stored hashed - copy it immediately, and revoke it from the same screen if it’s ever exposed.',
  },
  {
    icon: 'swap_calls',
    to: '/help/agents/agent-functions-and-transfer',
    title: 'Hand off to a human',
    body: 'Set a transfer number on the agent. When a phone caller needs a person, the agent dials your colleague into the call instead of dead-ending it. Website calls take a callback request instead.',
  },
]

export function Docs() {
  const { heroCtaRef, endRef } = useStickyRefs()
  const [last, ...firstSteps] = [...QUICKSTART].reverse()
  const steps: TimelineStep[] = firstSteps.reverse().map((step) => ({ icon: step.icon, title: step.title, body: step.body, to: step.to, link: 'Read the guide' }))
  const concepts: FeatureItem[] = CONCEPTS.map((c) => ({ icon: c.icon, title: c.term, body: c.def, to: c.to, link: 'Learn more' }))
  const tasks: FeatureItem[] = HOWTO.map((h) => ({ icon: h.icon, title: h.title, body: h.body, to: h.to, link: 'Step-by-step guide' }))
  return (
    <MarketingLayout>
      <Seo
        title="Docs & Help - Vistrow Voice"
        description="Set up a Vistrow Voice AI agent: create an agent, add a knowledge base, connect a phone number or website widget, book appointments, and push leads to your CRM."
        path="/resources/docs"
      />

      <ReadingHero
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Docs' }]}
        eyebrow="Docs & help"
        title="From zero to a live agent."
        lede="Everything you need to get an agent answering real calls. Most teams are live in under an hour, without writing any code."
        heroRef={heroCtaRef}
        actions={
          <>
            <TalkToArthaButton className={TALK_CLASS} />
            <BookDemoLink placement="docs_hero" />
          </>
        }
      />

      <Timeline
        eyebrow="Quickstart"
        title="Five steps to your first live call."
        steps={steps}
      />
      <section className="mx-auto -mt-6 max-w-7xl px-5 pb-6 md:px-8 lg:-mt-10">
        <Reveal>
          <div className="flex max-w-3xl gap-4 rounded-3xl border border-border bg-surface p-5 sm:p-6">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-magenta font-display text-lg font-bold text-white">
              {Number(last.n)}
            </span>
            <div>
              <h3 className="font-display text-lg font-semibold">Then: {last.title.toLowerCase()}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{last.body}</p>
              <ItemLink to={last.to} label="Read the guide" />
            </div>
          </div>
        </Reveal>
      </section>

      <FeatureCardsSection eyebrow="Core concepts" title="The words you will see in the dashboard." items={concepts} />
      <FeatureCardsSection eyebrow="Common tasks" title="The jobs teams do in their first week." items={tasks} />

      <section className="mx-auto max-w-7xl px-5 pb-4 md:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-border bg-surface p-8 text-center shadow-[0_30px_60px_-40px_rgba(76,29,149,0.55)] sm:p-10">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <Icon name="support_agent" className="text-[24px]" />
            </span>
            <h2 className="mt-5 font-display text-2xl font-bold tracking-tight">Still stuck?</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-muted">
              There’s a help assistant inside the dashboard that knows your actual workspace - your
              agents, your call history, your settings - so it can answer specifics this page can’t.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <NavLink
                to="/login"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 text-sm font-bold text-white transition-opacity hover:opacity-90"
              >
                Open the dashboard
              </NavLink>
              <Link
                to="/help"
                className="inline-flex min-h-[44px] items-center rounded-full border border-border px-6 text-sm font-bold text-text transition-colors hover:border-primary"
              >
                Browse the Help Center
              </Link>
              <NavLink
                to="/contact"
                className="inline-flex min-h-[44px] items-center rounded-full border border-border px-6 text-sm font-bold text-text transition-colors hover:border-primary"
              >
                Talk to us
              </NavLink>
            </div>
          </div>
        </Reveal>
      </section>

      <div ref={endRef} />
      <CTABand />
      <StickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </MarketingLayout>
  )
}

function FeatureCardsSection({ eyebrow, title, items }: { eyebrow: string; title: string; items: FeatureItem[] }) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
      <Reveal>
        <SectionHead eyebrow={eyebrow} title={title} className="mb-10" />
      </Reveal>
      <FeatureCards items={items} />
    </section>
  )
}
