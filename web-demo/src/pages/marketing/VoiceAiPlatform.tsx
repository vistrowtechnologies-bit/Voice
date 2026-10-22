import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, PageHero, SectionEyebrow } from '../../components/MarketingBits'
import { PageFigures } from '../../components/PageFigure'
import { LANGUAGES } from '../../lib/marketingContent'

// Landing page for the "voice AI platform" query cluster. It describes the
// platform as a whole: every module and developer hook below exists in the
// dashboard today (checked against the help articles, AgentDetail custom
// functions and the integrations page). No prices or credit figures here -
// /pricing owns those.

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
    body: 'Connect a number over SIP through EnableX, route it to an agent, and set its hours, active days and how many calls it takes at once.',
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

export function VoiceAiPlatform() {
  return (
    <MarketingLayout>
      <Seo
        title="Voice AI Platform for Indian Businesses | Vistrow Voice"
        description="A voice AI platform for India: build agents, add your knowledge, connect phone numbers and a website widget, test, and send every call record to your CRM."
        path="/voice-ai-platform"
        jsonLd={FAQ_JSONLD}
      />

      <PageHero
        eyebrow="Voice AI platform"
        title="A voice AI platform built for Indian businesses."
        subhead="Build an AI voice agent, teach it your facts, put it on your phone line and website, test it, and get a complete record of every call - in one workspace."
      />

      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <div className="grid gap-6 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.10] via-surface to-surface p-7 sm:p-9 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
          <div>
            <SectionEyebrow>Platform, not a single bot</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Everything a voice agent needs, around the agent.</h2>
            <p className="mt-4 leading-relaxed text-text-muted">
              A voice agent on its own is a model that can talk. What makes it usable for a business is everything
              around it: the knowledge it is allowed to answer from, the numbers and web pages callers reach it on,
              a safe place to test it, rules about when it may call, and a record your team can act on after the
              call ends. Vistrow Voice puts those pieces in one dashboard so a sales, support or operations team can
              run voice AI without stitching together separate speech, telephony and CRM tools.
            </p>
          </div>
          <ul className="space-y-3 text-sm leading-relaxed text-text-muted">
            {[
              'No-code agent builder, with an AI drafting assistant',
              'Phone numbers and a website call widget on the same agent',
              '130+ languages, including 10 Indian languages, switching mid-call',
              'Webhooks and custom functions when you do want code',
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <Icon name="check_circle" className="mt-0.5 shrink-0 text-[16px] text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-10 max-w-2xl">
          <SectionEyebrow>What the platform includes</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Nine parts, one workspace.</h2>
          <p className="mt-3 text-text-muted">
            Each of these is a page in the dashboard today. The links go to the product page or the help guide for it.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <div key={m.title} className="flex flex-col rounded-2xl border border-border bg-surface p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                <Icon name={m.icon} className="text-[22px]" />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">{m.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-text-muted">{m.body}</p>
              <Link
                to={m.to}
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
              >
                {m.link}
                <Icon name="arrow_forward" className="text-[16px]" />
              </Link>
            </div>
          ))}
        </div>
        <PageFigures route="/voice-ai-platform" after="Nine parts, one workspace." />
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-8 max-w-2xl">
          <SectionEyebrow>From signup to live calls</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">How teams usually go live.</h2>
          <p className="mt-3 text-text-muted">
            The order matters more than the speed. Teams that test before they route a real number spend less time
            apologising to callers in week one.
          </p>
        </div>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PATH_TO_LIVE.map((step, i) => (
            <li key={step.title} className="rounded-2xl border border-border bg-surface p-6">
              <span className="font-display text-2xl font-bold text-primary">{i + 1}</span>
              <h3 className="mt-3 font-display text-base font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-sm text-text-muted">
          The full sequence is in the{' '}
          <Link to="/help/getting-started/get-started" className="font-semibold text-primary underline-offset-4 hover:underline">
            get started guide
          </Link>
          . Start with one call type on one channel and widen once the transcripts look right.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
          <div>
            <SectionEyebrow>For developers</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Hooks for the parts you want to own.</h2>
            <p className="mt-4 leading-relaxed text-text-muted">
              None of this is needed to go live. It is for teams that want the agent to work with their own
              order, booking or lead systems.
            </p>
            <ul className="mt-6 space-y-4 text-sm leading-relaxed text-text-muted">
              <li className="flex gap-3">
                <Icon name="webhook" className="mt-0.5 shrink-0 text-[20px] text-cyan" />
                <span>
                  <strong className="text-text">Webhooks.</strong> A workspace webhook receives every qualified lead
                  as JSON. Each agent can also post its lead, appointment and callback events to its own URL; the
                  same URL in both places gets one delivery, not two.
                </span>
              </li>
              <li className="flex gap-3">
                <Icon name="api" className="mt-0.5 shrink-0 text-[20px] text-cyan" />
                <span>
                  <strong className="text-text">Custom functions.</strong> Describe an endpoint - name, purpose, URL,
                  method, headers and typed parameters - and the agent decides when to call it during the
                  conversation, such as looking up an order or checking a booking.
                </span>
              </li>
              <li className="flex gap-3">
                <Icon name="code" className="mt-0.5 shrink-0 text-[20px] text-cyan" />
                <span>
                  <strong className="text-text">Variables.</strong> Define {'{{variable}}'} names with fallback
                  values and use them in prompts and greetings.
                </span>
              </li>
              <li className="flex gap-3">
                <Icon name="bolt" className="mt-0.5 shrink-0 text-[20px] text-cyan" />
                <span>
                  <strong className="text-text">Instant Lead Follow-up.</strong> A private URL: post a lead from a
                  form, CRM or automation tool and a call is queued, still subject to your Do-Not-Call list and
                  calling window.
                </span>
              </li>
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-6 min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Example custom function (illustrative)</p>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-surface-high p-4 text-xs leading-relaxed text-text">
              <code>{FUNCTION_EXAMPLE}</code>
            </pre>
            <p className="mt-3 text-xs leading-relaxed text-text-muted">
              The fields mirror the custom function form on an agent. The endpoint and key are placeholders; the
              description is what the agent reads when deciding whether to call it.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="rounded-2xl border border-border bg-surface p-7 sm:p-8">
          <SectionEyebrow>Built for India</SectionEyebrow>
          <h2 className="mt-3 font-display text-2xl font-bold tracking-tight">Languages your callers actually mix.</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-muted">
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
                  className="inline-block rounded-full border border-border px-3.5 py-1.5 text-sm text-text-muted transition-colors hover:border-primary hover:text-text"
                >
                  {lang.name} <span lang={lang.code}>{lang.native}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="max-w-3xl">
          <SectionEyebrow>Choosing a platform</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Ask who will maintain the agent.</h2>
          <p className="mt-3 leading-relaxed text-text-muted">
            Developer frameworks give full control and expect engineers to own prompts, telephony and storage. A
            finished platform lets the business team edit, test and read the results. When comparing, ask to see a
            finished call record as well as hearing a demo. The{' '}
            <Link to="/best-ai-voice-calling-software-india" className="font-semibold text-primary underline-offset-4 hover:underline">
              guide to choosing AI voice calling software
            </Link>{' '}
            has a full checklist, and{' '}
            <Link to="/pricing" className="font-semibold text-primary underline-offset-4 hover:underline">
              plans and pricing
            </Link>{' '}
            explains what usage costs.
          </p>
        </div>
      </section>

      <FaqSection items={FAQ} title="Voice AI platform questions." />

      <CTABand
        title="See the whole platform on a live call."
        subtitle="Talk to Artha in your browser, or book a walkthrough of the dashboard with your own use case."
      />
    </MarketingLayout>
  )
}
