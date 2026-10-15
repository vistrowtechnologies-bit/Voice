import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, SectionEyebrow, TalkToArthaButton } from '../../components/MarketingBits'

// Deliberately compares against the incumbent *category* - a phone menu or
// a human call desk - not against named competitors. That's both the
// honest comparison (it's what these buyers are actually replacing) and
// the durable one: no claims about another company's product that go stale
// or get disputed.

const ROWS: { dimension: string; ivr: string; agent: string; chatbot: string; human: string }[] = [
  {
    dimension: 'Answers phone calls',
    ivr: 'Yes, with a recorded menu',
    agent: 'Yes, in a spoken conversation',
    chatbot: 'No - text on a website or app',
    human: 'Yes, when someone is free',
  },
  {
    dimension: 'Caller experience',
    ivr: 'Press 1, press 2, press 9 to repeat',
    agent: 'Says what they need and gets an answer',
    chatbot: 'Types a question and reads a reply',
    human: 'Natural - if someone picks up',
  },
  {
    dimension: 'Availability',
    ivr: '24/7, but only to route',
    agent: '24/7, within the hours you set',
    chatbot: '24/7 in text',
    human: 'Business hours, minus breaks and leave',
  },
  {
    dimension: 'Languages',
    ivr: 'Usually two, chosen up front',
    agent: '10 Indian languages + English, switching mid-call',
    chatbot: 'Depends on the bot; text only',
    human: 'Whatever that person speaks',
  },
  {
    dimension: 'Peak load',
    ivr: 'Queues and hold music',
    agent: 'Several calls at once, up to the limit you set per number',
    chatbot: 'Many chats at once',
    human: 'Queues, or missed calls',
  },
  {
    dimension: 'Answer quality',
    ivr: 'Fixed menu, no answers',
    agent: 'Grounded in your knowledge base, consistent every call',
    chatbot: 'Depends on its content and setup',
    human: 'Varies by person and by day',
  },
  {
    dimension: 'Booking an appointment',
    ivr: 'Transfer to a human',
    agent: 'Checks your bookable hours and books on the call',
    chatbot: 'Possible if connected to a calendar',
    human: 'Yes, manually',
  },
  {
    dimension: 'Record of the conversation',
    ivr: 'Call logs only',
    agent: 'Recording, transcript, summary and CRM sync',
    chatbot: 'Chat log',
    human: 'Notes, if someone writes them',
  },
  {
    dimension: 'Cost as volume grows',
    ivr: 'Flat, but unresolved calls pile up',
    agent: 'Per minute of conversation, no new hires',
    chatbot: 'Varies by vendor',
    human: 'Linear - more calls, more people',
  },
]

// Plain definitions for the "IVR vs IVA vs voice AI" style of question.
const TERMS: { term: string; definition: string }[] = [
  {
    term: 'IVR (interactive voice response)',
    definition: 'A phone menu. It plays recorded options and routes the call based on the key the caller presses, or a few fixed words. It routes; it does not answer questions.',
  },
  {
    term: 'IVA (intelligent virtual assistant)',
    definition: 'A broad industry term for software that understands natural language and can complete simple tasks, by text or by voice. On a phone line it usually means the same thing as an AI voice agent.',
  },
  {
    term: 'Conversational AI',
    definition: 'The underlying technology: speech recognition, a language model that works out what the person means, and speech synthesis to reply. Chatbots and voice agents are both built on it.',
  },
  {
    term: 'AI voice agent',
    definition: 'Conversational AI on a live call. It listens, understands the request, answers from approved information, takes actions such as booking or transferring, and logs the call. Used to replace a menu, it is often called an AI IVR.',
  },
  {
    term: 'Chatbot',
    definition: 'A text assistant on a website or messaging app. Useful for people who prefer to type; it cannot answer the phone calls your business receives.',
  },
]

const WHEN_BETTER: { title: string; body: string }[] = [
  {
    title: 'A menu IVR is enough when…',
    body: 'Calls only need routing to two or three departments, every caller speaks the same language, and someone is always free to pick up.',
  },
  {
    title: 'An AI voice agent fits when…',
    body: 'Most calls ask the same questions, want a booking or need qualifying, callers speak different languages, or calls arrive outside office hours.',
  },
  {
    title: 'A chatbot fits when…',
    body: 'Your customers mostly reach you in writing, on your website or a messaging app, and do not expect to phone.',
  },
  {
    title: 'A human receptionist is better when…',
    body: 'Calls are few, sensitive or high value. Most teams pair one with an AI agent that takes the repetitive calls and transfers the rest.',
  },
]

const REPLACE_STEPS = [
  'List the menu options callers choose most and what your team says on each of those calls.',
  'Put those answers in a knowledge base and build an agent with your greeting and default language.',
  'Test the awkward calls in the browser - wrong numbers, angry callers, questions it should not answer.',
  'Route one line, or after-hours only, to the agent, with a transfer number for anything it should hand over.',
  'Read the first week of transcripts, fix the gaps, then move the remaining lines.',
]

const FAQ = [
  {
    q: 'What is an AI voice agent, and how is it different from a chatbot or an IVR?',
    a: 'An AI voice agent holds a spoken conversation on a phone or website call: it understands what the caller says, answers from approved information and takes actions such as booking. An IVR only plays a menu and routes on keypresses. A chatbot does similar work to a voice agent, but in text, so it cannot answer your phone line.',
  },
  {
    q: 'Is an AI voice agent just a smarter IVR?',
    a: 'Not quite. An IVR routes - it collects a keypress and sends the caller somewhere. Artha holds a conversation, answers from your knowledge base, captures details, and books appointments without transferring anyone. When it is used in place of a menu, people call it an AI IVR.',
  },
  {
    q: 'Voice AI vs IVR: which is better?',
    a: 'For routing a few departments in one language, a menu IVR is cheap and fine. Once callers ask questions, want bookings, speak several languages or call after hours, a voice agent resolves more calls without a transfer. Many teams keep a person for sensitive or high-value calls.',
  },
  {
    q: 'Will it replace my whole call team?',
    a: 'Usually not, and we don’t recommend framing it that way. It absorbs the repetitive, high-volume calls - status checks, timings, qualification, reminders - so your team spends their day on the calls that genuinely need a person.',
  },
  {
    q: 'What happens when the AI can’t help?',
    a: 'It transfers the call to a colleague if you have set a transfer number, or records a callback request. It is configured not to invent an answer it does not have.',
  },
  {
    q: 'Do we have to replace our phone number?',
    a: 'Not necessarily. An existing number from a compatible provider can be connected once we confirm the setup, or you can use a new one. The website call widget needs no phone number at all.',
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

export function CompareIvr() {

  return (
    <MarketingLayout>
      <Seo
        title="AI Voice Agent vs Traditional IVR vs Chatbot | Vistrow Voice"
        description="IVR, IVA, AI voice agent, chatbot or receptionist? Plain definitions, a side-by-side table, which fits when, and how to replace a menu IVR step by step."
        path="/vs-ivr"
        jsonLd={FAQ_JSONLD}
      />

      <section className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8 lg:py-20">
        <SectionEyebrow>Comparison</SectionEyebrow>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
          AI voice agent vs traditional IVR, chatbot and receptionist.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-text-muted">
          Nobody has ever enjoyed pressing 1 for sales. Most businesses answer calls with a phone menu, a small
          team, or both. Here’s how an AI voice agent actually differs - including where it doesn’t win.
        </p>
        <div className="mt-8 flex justify-center">
          <TalkToArthaButton />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-10 md:px-8">
        <Link
          to="/ai-ivr"
          className="group flex flex-col gap-2 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/[0.10] to-surface p-6 transition-colors hover:border-primary sm:flex-row sm:items-center sm:justify-between"
        >
          <span>
            <span className="block font-display text-lg font-semibold text-text">Looking for an AI IVR?</span>
            <span className="mt-1 block text-sm text-text-muted">
              See how Vistrow Voice replaces a press-1 menu on your business number: call flow, languages, setup and pricing.
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">
            AI IVR for Indian businesses
            <Icon name="arrow_forward" className="text-[16px] transition-transform group-hover:translate-x-1" />
          </span>
        </Link>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-12 md:px-8">
        <div className="mb-8 max-w-2xl">
          <SectionEyebrow>The terms</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">IVR, IVA, conversational AI, voice agent: what each one means.</h2>
        </div>
        <dl className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {TERMS.map((item) => (
            <div key={item.term} className="rounded-2xl border border-border bg-surface p-6">
              <dt className="font-display text-base font-semibold">{item.term}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-text-muted">{item.definition}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-10 md:px-8">
        <div className="mb-8 max-w-2xl">
          <SectionEyebrow>Side by side</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Menu IVR vs AI voice agent vs chatbot vs receptionist.</h2>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-surface-high">
                <th scope="col" className="px-5 py-4 font-display text-sm font-semibold">
                  <span className="sr-only">Dimension</span>
                </th>
                <th scope="col" className="px-5 py-4 font-display text-sm font-semibold text-text-muted">
                  Traditional IVR
                </th>
                <th scope="col" className="px-5 py-4 font-display text-sm font-semibold text-primary">
                  AI voice agent / AI IVR (Vistrow Voice)
                </th>
                <th scope="col" className="px-5 py-4 font-display text-sm font-semibold text-text-muted">
                  Chatbot
                </th>
                <th scope="col" className="px-5 py-4 font-display text-sm font-semibold text-text-muted">
                  Human receptionist
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.dimension} className="border-t border-border bg-surface">
                  <th scope="row" className="px-5 py-4 font-semibold text-text">{row.dimension}</th>
                  <td className="px-5 py-4 text-text-muted">{row.ivr}</td>
                  <td className="px-5 py-4">
                    <span className="flex items-start gap-2 text-text">
                      <Icon name="check_circle" className="mt-0.5 flex-shrink-0 text-[16px] text-cyan" />
                      {row.agent}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-text-muted">{row.chatbot}</td>
                  <td className="px-5 py-4 text-text-muted">{row.human}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-12 md:px-8">
        <div className="mb-8 max-w-2xl">
          <SectionEyebrow>Which is better</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">It depends on the calls you get.</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {WHEN_BETTER.map((item) => (
            <div key={item.title} className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="font-display text-base font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
        <div className="rounded-3xl border border-border bg-surface p-7 sm:p-9">
          <SectionEyebrow>How to replace an IVR with AI</SectionEyebrow>
          <h2 className="mt-3 font-display text-2xl font-bold tracking-tight">Move one line at a time.</h2>
          <ol className="mt-6 space-y-3">
            {REPLACE_STEPS.map((step, i) => (
              <li key={step} className="flex gap-3 text-sm leading-relaxed text-text-muted">
                <span className="font-display text-base font-bold text-primary">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <Link
            to="/ai-ivr"
            className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            The full AI IVR setup, with languages and pricing
            <Icon name="arrow_forward" className="text-[16px]" />
          </Link>
        </div>
      </section>

      {/* Where a human still wins - credibility comes from admitting this */}
      <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
        <div className="rounded-3xl border border-amber/40 bg-amber/[0.06] p-8 sm:p-10">
          <SectionEyebrow>Where a person still wins</SectionEyebrow>
          <h2 className="mt-3 font-display text-2xl font-bold tracking-tight">
            An AI agent isn’t the right answer for every call.
          </h2>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <div>
              <h3 className="font-display text-base font-semibold">Emotionally difficult calls</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Complaints, bad news, or a distressed caller deserve a person. Artha is configured to
                hand these off quickly rather than push through a script.
              </p>
            </div>
            <div>
              <h3 className="font-display text-base font-semibold">High-value negotiation</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Closing a large deal is a human job. Artha qualifies and books the meeting; your team
                takes it from there with the full transcript in hand.
              </p>
            </div>
            <div>
              <h3 className="font-display text-base font-semibold">Genuinely novel problems</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                If the answer isn’t in your knowledge base, we’d rather the agent say so and escalate
                than invent something confident and wrong.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
        <SectionEyebrow>Further reading</SectionEyebrow>
        <h2 className="mt-3 font-display text-2xl font-bold tracking-tight">Guides for planning the switch</h2>
        <ul className="mt-5 grid gap-3 text-sm leading-relaxed text-text-muted md:grid-cols-2">
          <li>
            <Link to="/resources/blog/when-to-use-voice-ai-instead-of-ivr" className="font-semibold text-primary hover:underline">
              AI voice agent or IVR: how to choose the call experience
            </Link>{' '}
            - which calls still suit a keypad menu, and how to test a conversational path against it.
          </li>
          <li>
            <Link to="/resources/blog/what-is-ivr-interactive-voice-response" className="font-semibold text-primary hover:underline">
              What IVR is and how it works
            </Link>{' '}
            - menus, keypad tones and call flows explained from the start.
          </li>
          <li>
            <Link to="/resources/blog/ivr-in-banking-and-finance" className="font-semibold text-primary hover:underline">
              IVR in banking and finance
            </Link>{' '}
            - what should stay on a verified keypad flow and what a voice agent can take.
          </li>
          <li>
            <Link to="/resources/blog/how-to-choose-an-ivr-service-provider-india" className="font-semibold text-primary hover:underline">
              How to choose an IVR service provider in India
            </Link>{' '}
            - questions about channels, languages, numbers and pricing to ask before you sign.
          </li>
          <li>
            <Link to="/help/inbound/route-inbound-calls" className="font-semibold text-primary hover:underline">
              Routing inbound calls to an agent
            </Link>{' '}
            - set hours, active days and a call limit for the line you pilot on.
          </li>
          <li>
            <Link to="/ai-receptionist" className="font-semibold text-primary hover:underline">
              AI receptionist for phone and website calls
            </Link>{' '}
            - the front-desk version of the same idea, with bookings and transfers.
          </li>
        </ul>
      </section>

      <FaqSection items={FAQ} />

      <CTABand />
    </MarketingLayout>
  )
}
