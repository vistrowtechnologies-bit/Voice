import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, PageHero, SectionEyebrow } from '../../components/MarketingBits'
import { LANGUAGES } from '../../lib/marketingContent'

// Landing page for "AI calling agent" / "AI calling" / "automated calling
// software". It is the umbrella page for the software category; /ai-telecaller
// covers the lead-calling role and /product/outbound the campaign feature, and
// both are linked from here. Claims match the product today:
// - transfer is phone-only (agent/tools.py transfer_call refuses web calls),
// - every outbound dial checks the account Do-Not-Call list (calls_db.is_dnc,
//   honor_dnc on by default) and, when enforced, the calling window in the
//   account's timezone (calls_db.within_calling_window); a campaign schedule
//   can only narrow that window (campaign_dialer.py),
// - campaigns have max attempts, retry minutes and a concurrency setting that
//   is also capped by the telephony channels available,
// - the agent adds callers who ask not to be called again (tools.do_not_call).

const CALL_TYPES = [
  {
    icon: 'call_received',
    title: 'Inbound calls',
    body: 'Point a business number at the agent and it picks up every call, answers from the information you approved, books a slot or takes a callback request, and transfers the caller to your team when they need a person.',
  },
  {
    icon: 'call_made',
    title: 'Outbound calls',
    body: 'Upload a contact list or pick a segment and the agent calls each person with their own details filled into the script: reminders, confirmations, renewals and follow-ups on enquiries.',
  },
  {
    icon: 'bolt',
    title: 'New-lead callbacks',
    body: 'Send a new enquiry from your website form, CRM or automation tool to the Instant Lead Follow-up webhook, and the call is queued within about 15 to 30 seconds, still inside your calling rules.',
  },
  {
    icon: 'forum',
    title: 'Website voice calls',
    body: 'The same agent can sit in a call button on your website, so a visitor can talk to it from the browser without dialling a number.',
  },
]

const RULES = [
  {
    icon: 'block',
    title: 'Do-Not-Call list',
    body: 'Every outbound dial is checked against your Do-Not-Call list. If someone asks not to be called again, the agent adds the number itself.',
  },
  {
    icon: 'schedule',
    title: 'Calling window',
    body: 'Set the permitted hours and days once. With the window enforced, dials outside it are blocked, and a campaign schedule can only narrow it.',
  },
  {
    icon: 'history',
    title: 'Attempts and retries',
    body: 'Choose the maximum attempts per contact and how long to wait before trying again. Nobody gets called ten times by mistake.',
  },
  {
    icon: 'support_agent',
    title: 'Phone-only transfer',
    body: 'On phone calls the agent can bring a colleague into the same call. Website calls run in the browser, so it takes a callback number instead.',
  },
]

const FAQ = [
  {
    q: 'What is an AI calling agent?',
    a: 'Software that holds a spoken conversation on a phone call. It listens to the caller, understands the request, replies in a natural voice, and takes an action such as booking a slot, recording a callback or transferring the call. After the call it saves the transcript, a summary and the details you asked it to capture.',
  },
  {
    q: 'How is it different from automated calling software or an auto-dialer?',
    a: 'Most automated calling software either plays a recorded message, offers a press-1 menu, or dials numbers and connects whoever answers to a human agent. An AI calling agent has the conversation itself, then hands over the calls that need a person.',
  },
  {
    q: 'Can one agent handle both inbound and outbound calls?',
    a: 'Yes. The same agent, with the same instructions and knowledge, can answer a phone number, call a campaign list and take website calls. Many teams still keep separate agents when the script for each job is different.',
  },
  {
    q: 'Which languages can it call in?',
    a: 'Hindi and English, plus Marathi, Tamil, Telugu, Kannada, Bengali, Gujarati, Malayalam, Punjabi and Odia. It opens in the language you set and follows the caller if they switch, including Hinglish.',
  },
  {
    q: 'Does AI calling follow the calling rules in India?',
    a: 'The platform checks your Do-Not-Call list and, when enforced, your calling window before every outbound dial. These controls help you comply; you remain responsible for consent and your telemarketing obligations, including the national registry.',
  },
  {
    q: 'How many calls can it make at the same time?',
    a: 'You set a concurrent-call limit on each campaign, and the real ceiling also depends on your workspace and the channels on your telephony account. Share your expected peak during a demo and we will confirm what your setup supports.',
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

const linkClass = 'font-semibold text-primary underline-offset-4 hover:underline'

export function AiCallingAgent() {
  return (
    <MarketingLayout>
      <Seo
        title="AI Calling Agent & Automated Calling Software | Vistrow Voice"
        description="An AI calling agent for Indian businesses: automated calling software that answers inbound calls, calls leads back and follows up in 11 languages."
        path="/ai-calling-agent"
        jsonLd={FAQ_JSONLD}
      />

      <PageHero
        eyebrow="AI calling agent"
        title="An AI calling agent for Indian businesses."
        subhead="Automated calling software that holds the conversation itself: it answers inbound calls, calls your leads and customers, asks your questions in their language and leaves your team a written record of every call."
      />

      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.10] via-surface to-surface p-7 sm:p-9">
          <SectionEyebrow>In plain words</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">What AI calling means for your phone line.</h2>
          <p className="mt-4 max-w-3xl leading-relaxed text-text-muted">
            AI calling puts a voice agent on your business calls. It listens to what the person says, works out what
            they need, answers from information you have approved and takes the next step: a booking, a callback
            request, a transfer to your team or a note that the customer is not interested. The difference from a
            recorded message is that the caller can interrupt, ask a question in their own words or switch to
            Hindi halfway through, and the agent keeps up.
          </p>
          <p className="mt-4 max-w-3xl leading-relaxed text-text-muted">
            Vistrow Voice runs one AI calling agent across inbound phone calls, outbound campaigns and your website,
            so the same instructions, knowledge and call records apply wherever a customer reaches you.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-8 max-w-2xl">
          <SectionEyebrow>Inbound and outbound</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">The calls an AI calling agent can take on.</h2>
          <p className="mt-3 text-text-muted">
            Start with the calls your team repeats most. Each one below runs on the same agent and lands in the same
            Calls history.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {CALL_TYPES.map((item) => (
            <div key={item.title} className="rounded-2xl border border-border bg-surface p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-high text-cyan">
                <Icon name={item.icon} className="text-[22px]" />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{item.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm text-text-muted">
          Set-up details:{' '}
          <Link to="/product/inbound" className={linkClass}>inbound call answering</Link>,{' '}
          <Link to="/product/outbound" className={linkClass}>outbound calling campaigns</Link> and the{' '}
          <Link to="/product/widget" className={linkClass}>website call widget</Link>.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <div>
            <SectionEyebrow>Lead qualification and follow-ups</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Your questions, every call, in the same order.</h2>
            <p className="mt-4 leading-relaxed text-text-muted">
              You write the qualifying questions into the agent’s instructions and choose which fields to pull from
              every transcript, such as budget, location, timeline or interest level. With strict mode on, the agent
              answers only from your knowledge base and passes anything else to the team instead of guessing a price
              or a date.
            </p>
            <p className="mt-4 leading-relaxed text-text-muted">
              When a lead is busy, the agent records a callback request with the preferred time. It shows up in
              Appointments and in the tools you connect, so a person follows up at the time the customer chose.
            </p>
          </div>
          <ul className="grid gap-3 text-sm leading-relaxed text-text-muted sm:grid-cols-2">
            {[
              'Transcript, summary and recording on every call',
              'Post-call fields filled from what the caller said',
              'Callback requests and bookings in Appointments',
              'Earlier calls from the same number shown together',
              'Results sent to Zoho CRM, ArthaLeads, Slack, Google Sheets or a webhook',
              'Campaign counts for connected, pending, no-answer, failed and blocked calls',
            ].map((item) => (
              <li key={item} className="flex gap-2 rounded-xl border border-border bg-surface p-4">
                <Icon name="check_circle" className="mt-0.5 shrink-0 text-[16px] text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="rounded-2xl border border-border bg-surface p-7 sm:p-8">
          <SectionEyebrow>Compared with older tools</SectionEyebrow>
          <h2 className="mt-3 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            How it differs from other automated calling software.
          </h2>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            <div>
              <h3 className="font-display text-lg font-semibold">Recorded broadcasts</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Play the same message to everyone. The listener cannot ask anything, so questions turn into missed
                calls back to your office.
              </p>
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold">Press-1 menus</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Route a caller by keypress but do not answer. If you want to replace a menu on an incoming line, see{' '}
                <Link to="/ai-ivr" className={linkClass}>AI IVR</Link>.
              </p>
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold">Auto-dialers</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Dial numbers quickly and connect whoever answers to a free human agent. The agent described here holds
                the conversation first and passes on the calls that need a person.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          <div>
            <SectionEyebrow>Languages</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Calls in the language your customer picks.</h2>
            <p className="mt-4 leading-relaxed text-text-muted">
              The agent opens in the language you set and follows the caller if they switch, including the Hinglish
              and other mixed speech most Indian calls actually use. It speaks English and these Indian languages:
            </p>
          </div>
          <ul className="flex flex-wrap gap-2 lg:pt-10">
            {LANGUAGES.map((lang) => (
              <li key={lang.slug}>
                <Link
                  to={`/languages/${lang.slug}`}
                  className="inline-block rounded-full border border-border px-3 py-1 text-sm text-text-muted transition-colors hover:border-primary hover:text-text"
                >
                  {lang.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-10 max-w-2xl">
          <SectionEyebrow>Compliance controls</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Rules checked by the system, not left to the script.</h2>
          <p className="mt-3 text-text-muted">
            These are settings in your dashboard that the dialer enforces. They help you meet your obligations; they do
            not replace them.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {RULES.map((rule) => (
            <div key={rule.title} className="rounded-2xl border border-border bg-surface p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                <Icon name={rule.icon} className="text-[22px]" />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">{rule.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{rule.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm text-text-muted">
          Details:{' '}
          <Link to="/help/compliance/calling-rules" className={linkClass}>calling window and Do-Not-Call</Link> and{' '}
          <Link to="/help/agents/agent-functions-and-transfer" className={linkClass}>functions and transfer</Link>.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-8 max-w-2xl">
          <SectionEyebrow>Where to read next</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Pick the page that matches your job.</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          <Link to="/ai-telecaller" className="rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary">
            <Icon name="call" className="text-[22px] text-cyan" />
            <h3 className="mt-4 font-display text-lg font-semibold">AI telecaller</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              For sales and admissions teams: how the agent takes over routine lead calls, follow-ups and callbacks.
            </p>
          </Link>
          <Link to="/product/outbound" className="rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary">
            <Icon name="campaign" className="text-[22px] text-cyan" />
            <h3 className="mt-4 font-display text-lg font-semibold">Outbound campaigns</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              The campaign feature itself: lists, segments, retries, concurrency and the results of each run.
            </p>
          </Link>
          <Link to="/ai-call-center" className="rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary">
            <Icon name="groups" className="text-[22px] text-cyan" />
            <h3 className="mt-4 font-display text-lg font-semibold">AI call center</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              For a support floor: putting an agent on the first line of the queue, with handover to your team.
            </p>
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-8 max-w-2xl">
          <SectionEyebrow>Getting started</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Start with one kind of call.</h2>
        </div>
        <ol className="grid gap-4 md:grid-cols-4">
          {[
            { title: 'Choose the call', body: 'One inbound number or one follow-up list. Leave everything else as it is.' },
            { title: 'Write the brief', body: 'What the agent may answer, what it should ask, and when to hand over.' },
            { title: 'Test in the browser', body: 'Use the Testing Lab for the hard cases: a busy lead, a language switch, a price question.' },
            { title: 'Review a week', body: 'Read the transcripts with your team lead, fix the knowledge base, then widen.' },
          ].map((step, i) => (
            <li key={step.title} className="rounded-2xl border border-border bg-surface p-6">
              <span className="font-display text-2xl font-bold text-primary">{i + 1}</span>
              <h3 className="mt-3 font-display text-base font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <FaqSection items={FAQ} title="AI calling questions." />

      <CTABand
        title="Bring one call type to a demo."
        subtitle="Tell us who you call or who calls you, and we will show the agent taking that call and handing over the rest."
      />
    </MarketingLayout>
  )
}
