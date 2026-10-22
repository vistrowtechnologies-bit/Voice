import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand } from '../../components/MarketingBits'
import { HERO_STATS, LANGUAGES } from '../../lib/marketingContent'
import {
  AGENT_CALLOUTS,
  DashboardCallouts,
  FeatureCards,
  HeroFacts,
  ObjectionCards,
  Reveal,
  SectionHead,
  SplitHero,
  SplitRow,
  StickyCta,
  TrustBand,
  useStickyRefs,
} from '../../components/showcase'
import { ActionBand, BadgeTimeline, CheckPanel, Section } from './premium-w2/W2Kit'
import { W2_VISUALS } from './premium-w2/visuals'

// Landing page for the "voice AI platform" query cluster. It describes the
// platform as a whole: every module and developer hook below exists in the
// dashboard today (checked against the help articles, AgentDetail custom
// functions and the integrations page). No prices or credit figures here -
// /pricing owns those. No telephony vendor names (owner rule).

const ROUTE = '/voice-ai-platform'
const V = W2_VISUALS[ROUTE]

const MODULES = [
  {
    icon: 'smart_toy',
    title: 'Agent builder',
    body: 'Describe your business in plain words and Build with AI drafts the instructions, voice and after-call fields for you to review. Or set the persona, voice, default language, welcome message and functions by hand.',
    to: '/product/agents',
    link: 'Voice agent builder',
  },
  {
    icon: 'menu_book',
    title: 'Knowledge base',
    body: 'Upload a brochure, price sheet or handbook, or paste text, then turn it into question-and-answer pairs you approve. Strict mode keeps the agent to approved answers.',
    to: '/product/knowledge-base',
    link: 'Knowledge base',
  },
  {
    icon: 'dialpad',
    title: 'Phone numbers',
    body: 'Connect a number over SIP, route it to an agent, and set its hours, active days and how many calls it takes at once.',
    to: '/product/inbound',
    link: 'Inbound calling',
  },
  {
    icon: 'chat',
    title: 'Website widget',
    body: 'A call button for your site: visitors talk to the agent in the browser with no app and no phone number. Page rules send different pages to different agents.',
    to: '/product/widget',
    link: 'Website call widget',
  },
  {
    icon: 'science',
    title: 'Testing Lab',
    body: 'Play the caller against the real agent configuration: an angry customer, a silent caller, Hindi-English switching, a booking conflict. Save your own scenarios and re-run them after every prompt change.',
    to: '/help/testing-lab/run-a-test',
    link: 'How the Testing Lab works',
  },
  {
    icon: 'hub',
    title: 'Integrations',
    body: 'Qualified leads go to Zoho CRM, ArthaLeads CRM, Slack or Google Sheets, or as JSON to any webhook - which also covers Zapier, Make and n8n.',
    to: '/product/integrations',
    link: 'Integrations',
  },
  {
    icon: 'receipt_long',
    title: 'Call records',
    body: 'Every call across phone, web and the widget is listed with its transcript, summary, captured fields and CRM delivery status, plus the recording when recording is on.',
    to: '/help/calls/find-a-call',
    link: 'Finding a call',
  },
  {
    icon: 'insights',
    title: 'Analytics',
    body: 'Calls, qualified leads, minutes and bookings against the previous period, and a breakdown by language, peak hour, sentiment, channel and agent.',
    to: '/help/getting-started/dashboard-overview',
    link: 'Reading the dashboard',
  },
  {
    icon: 'group',
    title: 'Team roles',
    body: 'Invite colleagues by email as Owner, Admin, Member or Viewer, so the people who read transcripts are not the people who can change a live agent.',
    to: '/help/settings/workspace-and-team',
    link: 'Workspace and team',
  },
]

const PATH_TO_LIVE = [
  { title: 'Create the workspace', body: 'Sign up, name the workspace and set the country your numbers belong to.' },
  { title: 'Draft the first agent', body: 'Start from Build with AI or a blank agent. Pick a voice and the language it should open in.' },
  { title: 'Give it your facts', body: 'Attach a knowledge base. Only approved, current answers should go in.' },
  { title: 'Break it on purpose', body: 'Run Testing Lab scenarios until the awkward calls go the way you want.' },
  { title: 'Put it where callers are', body: 'Embed the widget on one page, or route one phone number, or both.' },
  { title: 'Wire up the output', body: 'Connect your CRM, Slack or Sheets, then read the first week of transcripts.' },
]

const FAQ = [
  {
    q: 'What is a voice AI platform?',
    a: 'Software for building, running and reviewing AI agents that hold spoken conversations. A complete platform covers the agent itself, the knowledge it answers from, the channels callers reach it on, testing before launch, and the records and integrations after each call. Vistrow Voice keeps all of those in one workspace.',
  },
  {
    q: 'Do I need developers to use it?',
    a: 'No. Building, testing, routing numbers, embedding the widget and connecting integrations are all done in the dashboard. Developers become useful when you want the agent to call your own systems mid-conversation through custom functions, or to process webhook events in your own code.',
  },
  {
    q: 'Which languages does it support?',
    a: 'Hindi, Marathi, Tamil, Telugu, Kannada, Bengali, Gujarati, Malayalam, Punjabi and Odia, plus English. Each agent has a default language and follows the caller when they switch.',
  },
  {
    q: 'Can one agent handle both phone and website calls?',
    a: 'Yes. The same agent can answer a routed phone number and sit behind the website widget, and every call lands in the same Calls history with its channel marked. Transfer to a colleague works on phone calls; on web calls the agent offers a callback instead.',
  },
  {
    q: 'How does the platform connect to our own systems?',
    a: 'Through the built-in CRM, Slack and Google Sheets integrations, a workspace or per-agent webhook that posts lead, appointment and callback events as JSON, custom functions the agent can call during a conversation, and an Instant Lead Follow-up URL that queues a call when you post a lead to it.',
  },
  {
    q: 'How is it priced?',
    a: 'Usage is counted in credits based on call minutes and the voice and model tier you choose, and each plan includes a monthly allowance. Carrier usage and number rental are separate. The pricing page has the current plans.',
  },
]

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
}

const FUNCTION_EXAMPLE = `{
  "name": "check_order_status",
  "description": "Look up an order when the caller gives an order number",
  "url": "https://api.example.com/orders/status",
  "method": "POST",
  "headers": { "Authorization": "Bearer <your key>" },
  "parameters": [
    { "name": "order_id", "type": "string", "required": true,
      "description": "Order number as the caller says it" }
  ]
}`

const linkClass = 'font-semibold text-primary underline-offset-4 hover:underline'

export function VoiceAiPlatform() {
  const { heroCtaRef, endRef } = useStickyRefs()
  return (
    <MarketingLayout>
      <Seo
        title="Voice AI Platform for Indian Businesses | Vistrow Voice"
        description="A voice AI platform for India: build agents, add your knowledge, connect phone numbers and a website widget, test, and send every call record to your CRM."
        path="/voice-ai-platform"
        jsonLd={FAQ_JSONLD}
      />

      <SplitHero
        eyebrow="Voice AI platform"
        title="A voice AI platform built for Indian businesses."
        subhead="Build an AI voice agent, teach it your facts, put it on your phone line and website, test it, and get a complete record of every call - in one workspace."
        visual={V.hero}
        chips={[
          { label: 'Agents taking calls', live: true },
          { label: 'Every call logged', icon: 'receipt_long' },
        ]}
        placement="voice_ai_platform_hero"
        trust={<HeroFacts facts={HERO_STATS} />}
        ctaRef={heroCtaRef}
      />

      <Section className="py-12 lg:py-14">
        <SplitRow
          className=""
          aside={
            <CheckPanel
              tone="violet"
              items={[
                'No-code agent builder, with an AI drafting assistant',
                'Phone numbers and a website call widget on the same agent',
                '130+ languages, including 10 Indian languages, switching mid-call',
                'Webhooks and custom functions when you do want code',
              ]}
            />
          }
        >
          <Reveal>
            <SectionHead eyebrow="Platform, not a single bot" title="Everything a voice agent needs, around the agent." />
            <p className="mt-5 leading-relaxed text-text-muted">
              A voice agent on its own is a model that can talk. What makes it usable for a business is everything
              around it: the knowledge it is allowed to answer from, the numbers and web pages callers reach it on,
              a safe place to test it, rules about when it may call, and a record your team can act on after the
              call ends. Vistrow Voice puts those pieces in one dashboard so a sales, support or operations team can
              run voice AI without stitching together separate speech, telephony and CRM tools.
            </p>
          </Reveal>
        </SplitRow>
      </Section>

      <Section>
        <SplitRow figure={V.map} className="pb-12">
          <Reveal>
            <SectionHead
              eyebrow="What the platform includes"
              title="Nine parts, one workspace."
              intro="Each of these is a page in the dashboard today. The links go to the product page or the help guide for it."
            />
            <ul className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { icon: 'smart_toy', label: 'Build', parts: 'Agent builder, knowledge base, Testing Lab' },
                { icon: 'call', label: 'Reach callers', parts: 'Phone numbers, website widget' },
                { icon: 'insights', label: 'After the call', parts: 'Call records, analytics, integrations, team roles' },
              ].map((group) => (
                <li key={group.label} className="rounded-2xl border border-border bg-surface p-4">
                  <Icon name={group.icon} className="text-[20px] text-primary" />
                  <p className="mt-2 font-display text-sm font-semibold">{group.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">{group.parts}</p>
                </li>
              ))}
            </ul>
          </Reveal>
        </SplitRow>
        <FeatureCards items={MODULES} />
      </Section>

      <DashboardCallouts
        view={V.agent}
        callouts={AGENT_CALLOUTS}
        title="One page per agent."
        intro="The agent page in the real Vistrow Voice dashboard, with sample data."
      />

      <Section className="py-14 lg:py-20">
        <Reveal>
          <SectionHead
            eyebrow="From signup to live calls"
            title="How teams usually go live."
            intro="The order matters more than the speed. Teams that test before they route a real number spend less time apologising to callers in week one."
            className="mb-12"
          />
        </Reveal>
        <BadgeTimeline steps={PATH_TO_LIVE.map((step, i) => ({ ...step, badge: `Step ${i + 1}` }))} />
        <p className="mt-10 text-sm text-text-muted">
          The full sequence is in the{' '}
          <Link to="/help/getting-started/get-started" className={linkClass}>
            get started guide
          </Link>
          . Start with one call type on one channel and widen once the transcripts look right.
        </p>
      </Section>

      <TrustBand placement="voice_ai_platform_trust_band" />

      <Section>
        {/* Own grid rather than SplitRow: the code sample needs min-w-0 on the
            column so a long line scrolls inside the card on phones. */}
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-14">
          <Reveal className="order-2 min-w-0 lg:sticky lg:top-28">
            <div className="min-w-0 overflow-hidden rounded-3xl border border-border bg-[#17112a] shadow-[0_30px_60px_-40px_rgba(76,29,149,0.8)]">
              <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
                <p className="ml-2 text-xs font-bold uppercase tracking-widest text-white/60">Example custom function (illustrative)</p>
              </div>
              <pre className="overflow-x-auto p-5 text-xs leading-relaxed text-[#e9e3ff]">
                <code>{FUNCTION_EXAMPLE}</code>
              </pre>
              <p className="border-t border-white/10 px-5 py-3 text-xs leading-relaxed text-white/65">
                The fields mirror the custom function form on an agent. The endpoint and key are placeholders; the
                description is what the agent reads when deciding whether to call it.
              </p>
            </div>
          </Reveal>
          <div className="order-1 min-w-0">
          <Reveal>
            <SectionHead eyebrow="For developers" title="Hooks for the parts you want to own." />
            <p className="mt-4 leading-relaxed text-text-muted">
              None of this is needed to go live. It is for teams that want the agent to work with their own
              order, booking or lead systems.
            </p>
          </Reveal>
          <ul className="mt-6 space-y-3 text-sm leading-relaxed text-text-muted">
            {[
              {
                icon: 'webhook',
                body: (
                  <>
                    <strong className="text-text">Webhooks.</strong> A workspace webhook receives every qualified lead
                    as JSON. Each agent can also post its lead, appointment and callback events to its own URL; the
                    same URL in both places gets one delivery, not two.
                  </>
                ),
              },
              {
                icon: 'api',
                body: (
                  <>
                    <strong className="text-text">Custom functions.</strong> Describe an endpoint - name, purpose, URL,
                    method, headers and typed parameters - and the agent decides when to call it during the
                    conversation, such as looking up an order or checking a booking.
                  </>
                ),
              },
              {
                icon: 'code',
                body: (
                  <>
                    <strong className="text-text">Variables.</strong> Define {'{{variable}}'} names with fallback
                    values and use them in prompts and greetings.
                  </>
                ),
              },
              {
                icon: 'bolt',
                body: (
                  <>
                    <strong className="text-text">Instant Lead Follow-up.</strong> A private URL: post a lead from a
                    form, CRM or automation tool and a call is queued, still subject to your Do-Not-Call list and
                    calling window.
                  </>
                ),
              },
            ].map((item, i) => (
              <li key={item.icon}>
                <Reveal delayMs={i * 60} className="flex gap-4 rounded-2xl border border-border bg-surface p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan/10 text-cyan">
                    <Icon name={item.icon} className="text-[20px]" />
                  </span>
                  <span>{item.body}</span>
                </Reveal>
              </li>
            ))}
          </ul>
          </div>
        </div>
      </Section>

      <Section>
        <SplitRow figure={V.languages} flip className="">
          <Reveal>
            <SectionHead eyebrow="Built for India" title="Languages your callers actually mix." />
            <p className="mt-4 leading-relaxed text-text-muted">
              Indian callers rarely stay in one language for a whole call. Agents open in the language you choose and
              follow the caller into Hinglish or another mix, and the transcript keeps what was said. Phone calls run
              through an Indian telecom provider, and outbound dials respect the calling window and Do-Not-Call rules
              you set on the Compliance page.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {LANGUAGES.map((lang) => (
                <li key={lang.slug}>
                  <Link
                    to={`/languages/${lang.slug}`}
                    className="inline-block rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-text-muted transition-colors hover:border-primary hover:text-text"
                  >
                    {lang.name} <span lang={lang.code}>{lang.native}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Reveal>
        </SplitRow>
      </Section>

      <ActionBand
        eyebrow="Choosing a platform"
        title="Ask who will maintain the agent."
        body={
          <>
            Developer frameworks give full control and expect engineers to own prompts, telephony and storage. A
            finished platform lets the business team edit, test and read the results. When comparing, ask to see a
            finished call record as well as hearing a demo. The{' '}
            <Link to="/best-ai-voice-calling-software-india" className={linkClass}>
              guide to choosing AI voice calling software
            </Link>{' '}
            has a full checklist, and{' '}
            <Link to="/pricing" className={linkClass}>
              plans and pricing
            </Link>{' '}
            explains what usage costs.
          </>
        }
        actions={
          <Link
            to="/best-ai-voice-calling-software-india"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white shadow-[0_14px_36px_-14px_rgba(147,51,234,0.8)] transition-transform hover:-translate-y-0.5"
          >
            Read the buyer’s checklist
            <Icon name="arrow_forward" className="text-[16px]" />
          </Link>
        }
      />

      <ObjectionCards route={ROUTE} placement="voice_ai_platform_objections" />

      <FaqSection items={FAQ} title="Voice AI platform questions." />

      <div ref={endRef} />
      <CTABand
        title="See the whole platform on a live call."
        subtitle="Talk to Artha in your browser, or book a walkthrough of the dashboard with your own use case."
      />
      <StickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </MarketingLayout>
  )
}
