import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, PageHero, SectionEyebrow } from '../../components/MarketingBits'
import { LANGUAGES } from '../../lib/marketingContent'

// Commercial landing page for the "AI IVR" query cluster. /vs-ivr stays the
// comparison page; this one explains the product as an IVR replacement.
// Every capability below is one the dashboard actually has (see the help
// articles for transfer, routes, compliance and credits) - keep it that way.

const FLOW = [
  {
    icon: 'record_voice_over',
    title: 'The caller says what they need',
    body: 'No menu to sit through. The agent greets the caller and they answer in their own words - “I want to book for Saturday”, “where is my order”, “do you have a 2BHK under 80 lakh”.',
  },
  {
    icon: 'translate',
    title: 'It understands the request in their language',
    body: 'The agent works out the intent in Hindi, English or another supported Indian language, and follows the caller if they switch languages mid-sentence.',
  },
  {
    icon: 'call_split',
    title: 'It answers, books or transfers',
    body: 'It answers from your approved knowledge base, books a slot inside your business hours, takes a message, or dials a colleague into the call when a person is needed.',
  },
  {
    icon: 'task_alt',
    title: 'Your team gets the record',
    body: 'Every call is saved with the recording, transcript, summary and the fields you asked for, and can be sent on to your CRM, Google Sheets, Slack or a webhook.',
  },
]

const MENU_VS_AI: { dimension: string; menu: string; ai: string }[] = [
  { dimension: 'How the caller chooses', menu: 'Listens to options, presses a key', ai: 'Says what they want in a sentence' },
  { dimension: 'Language', menu: 'Pick a language first, usually two on offer', ai: 'Starts in your default language and follows the caller' },
  { dimension: 'Common questions', menu: 'Recorded message or transfer to an agent', ai: 'Answered from your approved knowledge base' },
  { dimension: 'Appointments', menu: 'Transfer to the front desk', ai: 'Checks your bookable hours and books on the call' },
  { dimension: 'Reaching a person', menu: 'Press 9, then wait in the queue', ai: 'Transfers when asked or when the call needs a person' },
  { dimension: 'After the call', menu: 'A call log with the keys pressed', ai: 'Recording, transcript, summary and captured details' },
  { dimension: 'Changing the flow', menu: 'Re-record prompts, re-map keys', ai: 'Edit the agent’s instructions and knowledge, test, publish' },
]

const SETUP = [
  { title: 'Describe the line', body: 'Create an agent, give it a persona, a voice, a default language and a greeting, and say which calls it should handle.' },
  { title: 'Add your facts', body: 'Upload your FAQs, price list or brochure to the knowledge base so answers come from your material, not guesses.' },
  { title: 'Test it in the browser', body: 'Run test conversations in the Testing Lab, including the awkward calls, before any real caller reaches it.' },
  { title: 'Connect the number', body: 'Connect your number, route it to the agent, and set the hours, days and concurrent-call limit for that line.' },
  { title: 'Send the results on', body: 'Switch on transfer and the integrations you need, then watch the first calls in Calls history and adjust.' },
]

const FITS = [
  {
    icon: 'support_agent',
    title: 'Support lines',
    body: 'Order status, timings, “how do I” questions and troubleshooting steps - with a clean handoff when the issue needs a person.',
    to: '/solutions/support',
    link: 'AI voice agents for customer support',
  },
  {
    icon: 'forum',
    title: 'Enquiry lines',
    body: 'Sales and property enquiries that need a few qualifying questions - budget, location, timeline - before your team calls back.',
    to: '/solutions/real-estate',
    link: 'AI voice agents for real estate enquiries',
  },
  {
    icon: 'event',
    title: 'Appointment lines',
    body: 'Clinics and service desks where most calls are “can I come in on Thursday”. The agent offers real free slots and books one.',
    to: '/solutions/healthcare',
    link: 'AI voice receptionist for clinics',
  },
  {
    icon: 'payments',
    title: 'Payment reminders',
    body: 'The outbound side: respectful reminder calls inside the permitted calling window, checked against your Do-Not-Call list first.',
    to: '/solutions/finance',
    link: 'AI voice agents for finance and collections',
  },
]

const IVR_TERMS = [
  {
    icon: 'dialpad',
    title: 'IVR system',
    body: 'An IVR system answers a business number, plays prompts and acts on the caller’s input: keypad tones or a few expected words. It then plays information, collects digits or routes the call to a queue. An AI IVR keeps that job but understands full sentences, so the caller does not need to know which option to pick.',
  },
  {
    icon: 'public',
    title: 'Cloud IVR',
    body: 'A cloud or hosted IVR runs on a provider’s servers instead of hardware in your office, and you manage it from a web dashboard. Vistrow Voice works the same way: there is nothing to install, numbers connect over SIP, and you change the agent’s instructions, knowledge and routing in the browser.',
  },
  {
    icon: 'call',
    title: 'IVR call',
    body: 'On a menu IVR call the caller listens, presses keys and often lands in a queue. On an AI IVR call the agent greets them, listens to the request, asks a follow-up if needed, and answers, books, takes a callback request or transfers. Every call is saved with a transcript and summary.',
  },
]

const GUIDES = [
  { to: '/resources/blog/what-is-ivr-interactive-voice-response', title: 'What is IVR (interactive voice response)?', body: 'Menus, DTMF, IVR trees, cloud IVR and where AI fits.' },
  { to: '/resources/blog/ivr-vs-ai-voice-agent-india', title: 'IVR vs AI voice agent: which should you use?', body: 'Decide from your own call reasons, with a worked menu example.' },
  { to: '/resources/blog/ivr-in-banking-and-finance', title: 'IVR in banking and finance', body: 'Which finance calls suit conversation and the guardrails to set.' },
  { to: '/resources/blog/how-to-choose-an-ivr-service-provider-india', title: 'How to choose an IVR service provider in India', body: 'A neutral checklist for comparing IVR solutions.' },
]

const FAQ = [
  {
    q: 'How do I replace my IVR with AI?',
    a: 'Keep the number and change what answers it. Build an agent with your greeting and knowledge, test it in the browser, then route the number to it. Many teams start with one line, such as after-hours or a single enquiry number, and move the rest once they have read the first week of transcripts.',
  },
  {
    q: 'What does an AI IVR cost?',
    a: 'You pay for minutes of conversation in credits. The credits per minute depend on the voice tier and model tier you choose, and each plan includes a monthly credit allowance. Carrier usage and number rental are separate from AI credits. Current plans are on the pricing page.',
  },
  {
    q: 'Can I keep my existing phone number?',
    a: 'Usually, yes. Phone calls run over SIP through EnableX, an Indian telecom provider. An existing number from a compatible provider can be connected once we confirm the connection setup, or you can use a new number. The website call widget needs no number at all.',
  },
  {
    q: 'Which languages can callers use?',
    a: 'Hindi, Marathi, Tamil, Telugu, Kannada, Bengali, Gujarati, Malayalam, Punjabi and Odia, plus English. The agent starts in the language you set and switches when the caller does, so nobody has to press a key to change language.',
  },
  {
    q: 'Can callers still reach a person?',
    a: 'Yes. Set a transfer number and the agent can dial your colleague into the call and stay on until they answer. You decide which situations should go to a person, such as complaints or anything the knowledge base does not cover.',
  },
  {
    q: 'What happens to call recordings and caller data?',
    a: 'Each call is stored in your workspace with its transcript and summary, and the recording if recording is on. You can require spoken consent at the start of the call and set a retention period after which transcripts and recordings are deleted automatically.',
  },
  {
    q: 'What is the difference between an IVR system and an AI IVR?',
    a: 'A traditional IVR system offers a fixed menu and acts on keypad tones or a few expected words. An AI IVR lets the caller say what they need in a full sentence, understands the request in their language, and answers, books or transfers without a menu. Both answer the number and route the call; the AI version removes the step of choosing an option.',
  },
  {
    q: 'Is Vistrow Voice a cloud IVR?',
    a: 'It is a cloud-hosted platform, so there is no hardware to install and everything is managed from the browser dashboard. Instead of a keypad menu it puts a conversational AI agent on the number. Phone calls connect over SIP through EnableX, and the same agent can also answer on your website.',
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

export function AiIvr() {
  return (
    <MarketingLayout>
      <Seo
        title="AI IVR System and Cloud IVR for India | Vistrow Voice"
        description="An AI IVR system for India: callers say what they need on an IVR call and get an answer, a booking or a transfer. A cloud IVR in 11 languages."
        path="/ai-ivr"
        jsonLd={FAQ_JSONLD}
      />

      <PageHero
        eyebrow="AI IVR"
        title="An AI IVR that lets callers speak instead of pressing 1."
        subhead="Replace the menu on your IVR system with an AI voice agent that understands the caller on every IVR call, answers in their language, and books or transfers the call. It runs as a cloud IVR on your existing business number."
      />

      {/* The plain answer comes first: that's what someone searching
          "what is an AI IVR" needs before anything else. */}
      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <div className="grid gap-6 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.10] via-surface to-surface p-7 sm:p-9 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
          <div>
            <SectionEyebrow>What is an AI IVR?</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">A phone line that listens, not a menu that lists.</h2>
            <p className="mt-4 leading-relaxed text-text-muted">
              An AI IVR, or AI-based IVR, answers your business number with a conversational voice agent instead of a
              recorded “press 1 for sales” menu. The caller says what they need in their own words; the agent understands
              the request, answers from your approved information, books an appointment, or transfers the call to the
              right person. It does the job a traditional IVR was meant to do - get each caller to the right outcome -
              without making them listen to options first.
            </p>
          </div>
          <ul className="space-y-3 text-sm leading-relaxed text-text-muted">
            {[
              'Inbound phone calls, outbound calls and the website voice widget from one agent',
              '10 Indian languages plus English, switching when the caller does',
              'Answers grounded in your knowledge base - it says so when it does not know',
              'Recording, transcript and summary for every call',
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
        <div className="mb-8 max-w-2xl">
          <SectionEyebrow>IVR system, cloud IVR, IVR call</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Where an AI IVR fits among the terms you have heard.</h2>
          <p className="mt-3 text-text-muted">
            New to the vocabulary? Our guide to{' '}
            <Link to="/resources/blog/what-is-ivr-interactive-voice-response" className="font-semibold text-primary underline-offset-4 hover:underline">
              what IVR is and how it works
            </Link>{' '}
            explains menus, keypad tones and call flows in more detail.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          {IVR_TERMS.map((item) => (
            <div key={item.title} className="rounded-2xl border border-border bg-surface p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                <Icon name={item.icon} className="text-[22px]" />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-10 max-w-2xl">
          <SectionEyebrow>How a call flows</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">From “hello” to a booked slot, without a menu.</h2>
        </div>
        <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW.map((step, i) => (
            <li key={step.title} className="rounded-2xl border border-border bg-surface p-7">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                  <Icon name={step.icon} className="text-[22px]" />
                </span>
                <span className="font-display text-3xl font-bold text-border">{`0${i + 1}`}</span>
              </div>
              <h3 className="mt-5 font-display text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-8 max-w-2xl">
          <SectionEyebrow>What it replaces</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Menu IVR vs AI IVR, side by side.</h2>
          <p className="mt-3 text-text-muted">
            Comparing more options, including chatbots and a human receptionist? See the{' '}
            <Link to="/vs-ivr" className="font-semibold text-primary underline-offset-4 hover:underline">
              AI voice agent vs IVR comparison
            </Link>
            .
          </p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[600px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-surface-high">
                <th scope="col" className="px-5 py-4 font-display text-sm font-semibold">
                  <span className="sr-only">Dimension</span>
                </th>
                <th scope="col" className="px-5 py-4 font-display text-sm font-semibold text-text-muted">
                  Menu IVR
                </th>
                <th scope="col" className="px-5 py-4 font-display text-sm font-semibold text-primary">
                  AI IVR (Vistrow Voice)
                </th>
              </tr>
            </thead>
            <tbody>
              {MENU_VS_AI.map((row) => (
                <tr key={row.dimension} className="border-t border-border bg-surface">
                  <th scope="row" className="px-5 py-4 font-semibold text-text">{row.dimension}</th>
                  <td className="px-5 py-4 text-text-muted">{row.menu}</td>
                  <td className="px-5 py-4">
                    <span className="flex items-start gap-2 text-text">
                      <Icon name="check_circle" className="mt-0.5 flex-shrink-0 text-[16px] text-cyan" />
                      {row.ai}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface p-7 sm:p-8">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-high text-cyan">
              <Icon name="dialpad" className="text-[22px]" />
            </span>
            <h2 className="mt-5 font-display text-2xl font-bold tracking-tight">Keep your existing number.</h2>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              Phone calls connect over SIP through EnableX, an Indian telecom provider. An existing number from a
              compatible provider can be connected once we confirm the connection setup, or you can use a new one.
              Each number is routed to an agent with its own hours, active days and concurrent-call limit, so you can
              start with one line and move the rest later.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              Callers on your website can talk to the same agent through the{' '}
              <Link to="/product/widget" className="font-semibold text-primary underline-offset-4 hover:underline">
                website call widget
              </Link>
              , which needs no phone number. Outbound calls go through{' '}
              <Link to="/product/outbound" className="font-semibold text-primary underline-offset-4 hover:underline">
                outbound campaigns
              </Link>
              .
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-7 sm:p-8">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-high text-cyan">
              <Icon name="translate" className="text-[22px]" />
            </span>
            <h2 className="mt-5 font-display text-2xl font-bold tracking-tight">Languages callers can use.</h2>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              Instead of “press 2 for Hindi”, the agent opens in your default language and follows the caller. These are
              the Indian languages it speaks, plus English:
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
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
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-8 max-w-2xl">
          <SectionEyebrow>Setup</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Five steps from menu to conversation.</h2>
          <p className="mt-3 text-text-muted">
            All of it happens in the dashboard. The step that takes longest is usually the second one: writing down
            the answers your team gives every day.
          </p>
        </div>
        <ol className="grid gap-4 md:grid-cols-5">
          {SETUP.map((step, i) => (
            <li key={step.title} className="rounded-2xl border border-border bg-surface p-6">
              <span className="font-display text-2xl font-bold text-primary">{i + 1}</span>
              <h3 className="mt-3 font-display text-base font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-sm text-text-muted">
          Step-by-step guides:{' '}
          <Link to="/help/phone-numbers/connect-a-number" className="font-semibold text-primary underline-offset-4 hover:underline">
            connect a phone number
          </Link>{' '}
          and{' '}
          <Link to="/help/inbound/route-inbound-calls" className="font-semibold text-primary underline-offset-4 hover:underline">
            route incoming calls to an agent
          </Link>
          .
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-10 max-w-2xl">
          <SectionEyebrow>Where it fits</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">The lines where a menu wastes the most time.</h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {FITS.map((fit) => (
            <div key={fit.title} className="rounded-2xl border border-border bg-surface p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                <Icon name={fit.icon} className="text-[22px]" />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">{fit.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{fit.body}</p>
              <Link
                to={fit.to}
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
              >
                {fit.link}
                <Icon name="arrow_forward" className="text-[16px]" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/[0.08] to-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <SectionEyebrow>Pricing</SectionEyebrow>
            <h2 className="mt-2 font-display text-xl font-bold tracking-tight">Billed by the minute of conversation.</h2>
            <p className="mt-1 max-w-2xl text-sm text-text-muted">
              Credits are counted from call minutes, multiplied by the voice tier and model tier you pick, so the main
              cost driver is how long your calls last. Carrier usage and number rental are separate from AI credits.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-5 py-3 text-sm font-bold text-primary transition-colors hover:bg-primary/10"
            >
              See plans and pricing
              <Icon name="arrow_forward" className="text-[16px]" />
            </Link>
            <Link
              to="/ai-voice-bot-pricing-india"
              className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-3 text-sm font-bold text-text transition-colors hover:border-primary"
            >
              What drives voice bot cost
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-8 max-w-2xl">
          <SectionEyebrow>IVR guides</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Read before you replace your menu.</h2>
          <p className="mt-3 text-text-muted">
            Answering front-desk calls rather than routing them? See the{' '}
            <Link to="/ai-receptionist" className="font-semibold text-primary underline-offset-4 hover:underline">
              AI receptionist
            </Link>{' '}
            page.
          </p>
        </div>
        <ul className="grid gap-5 sm:grid-cols-2">
          {GUIDES.map((guide) => (
            <li key={guide.to} className="rounded-2xl border border-border bg-surface p-6">
              <Link to={guide.to} className="group flex items-start justify-between gap-3">
                <span>
                  <span className="block font-display text-base font-semibold group-hover:text-primary">{guide.title}</span>
                  <span className="mt-1 block text-sm text-text-muted">{guide.body}</span>
                </span>
                <Icon name="arrow_forward" className="mt-1 shrink-0 text-[18px] text-primary" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <FaqSection items={FAQ} title="AI IVR questions, answered." />

      <CTABand
        title="Hear an AI IVR before you build one."
        subtitle="Talk to Artha live in your browser, or book a walkthrough using your own call flow."
      />
    </MarketingLayout>
  )
}
