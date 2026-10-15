import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, PageHero, SectionEyebrow } from '../../components/MarketingBits'

// Landing page for "AI call center" / "call center automation". Claims are
// limited to what the product does today: transfer works on phone calls only
// (agent/tools.py transfer_call refuses web calls and offers a callback), and
// the compliance controls are the ones on the Compliance and Inbound pages.
// Outbound is described without volume or scale claims.

const SPLIT: { task: string; ai: string; team: string }[] = [
  { task: 'Repeat questions', ai: 'Timings, locations, prices, eligibility, order status from your approved answers', team: 'Questions your knowledge base does not cover' },
  { task: 'New enquiries', ai: 'Collects name, need, budget, location or any field you define', team: 'Follow-up calls that need negotiation or judgement' },
  { task: 'Appointments', ai: 'Offers free slots inside your bookable hours and books one', team: 'Exceptions, overbooking and special requests' },
  { task: 'Complaints', ai: 'Listens, captures the details and transfers the call', team: 'Resolving it and deciding on remedies' },
  { task: 'After hours', ai: 'Answers within the hours you set on the route, takes a message or a callback request', team: 'Calls back the next working day with the transcript in hand' },
]

const COMPLIANCE = [
  {
    icon: 'schedule',
    title: 'Calling window',
    body: 'With the calling window enforced, outbound dials outside your permitted hours and days are blocked automatically, in the callee’s timezone.',
  },
  {
    icon: 'block',
    title: 'Do-Not-Call list',
    body: 'Every outbound dial is checked against your Do-Not-Call registry first. When a caller asks not to be called again, the agent adds them itself.',
  },
  {
    icon: 'record_voice_over',
    title: 'Spoken recording consent',
    body: 'Turn on spoken consent and the agent’s first reply asks whether recording and follow-up are okay. If the caller declines, the recording is discarded and no personal details are collected.',
  },
  {
    icon: 'history',
    title: 'Retention',
    body: 'Set a number of days and older transcripts and recordings are deleted automatically each day. Recording itself can be switched off.',
  },
  {
    icon: 'call_split',
    title: 'Line limits',
    body: 'Each inbound route has a schedule, active days and a maximum number of concurrent calls. Calls outside those limits are not answered by the agent.',
  },
  {
    icon: 'group',
    title: 'Team roles',
    body: 'Owner, Admin, Member and Viewer roles separate the people who review calls from the people who can change agents and rules.',
  },
]

const FAQ = [
  {
    q: 'What is AI call center software?',
    a: 'Software that lets an AI voice agent handle part of a call center’s work - answering inbound calls, qualifying enquiries, booking appointments and making follow-up calls - and passes the rest to human agents with a record of the conversation.',
  },
  {
    q: 'Can the AI agent transfer a call to a person?',
    a: 'On phone calls, yes. Set a transfer number on the agent and it dials your colleague into the call and stays on until they answer; if nobody picks up, it offers a callback. Calls through the website widget cannot be transferred to a phone, so the agent takes a callback number instead.',
  },
  {
    q: 'What is call center automation, and where should we start?',
    a: 'Automating the repetitive parts of call handling: first-line answers, data capture, booking and routine follow-ups. Start with one queue that is mostly repeat questions, keep a transfer number on it, and compare a week of transcripts with what your team would have said before widening it.',
  },
  {
    q: 'Does it make outbound calls too?',
    a: 'Yes, through outbound campaigns: pick a number, an agent and a contact list or segment, and progress is shown per campaign. Leads posted to the Instant Lead Follow-up webhook are queued for a call as well. Every outbound dial is checked against your Do-Not-Call list and calling window first.',
  },
  {
    q: 'How many calls can it handle at once?',
    a: 'You set a maximum concurrent-call limit per inbound route, and the practical ceiling also depends on the channels on your telephony account. Tell us your expected peak during a demo and we will confirm what your setup supports before you rely on it.',
  },
  {
    q: 'Which languages can it handle?',
    a: 'Hindi, Marathi, Tamil, Telugu, Kannada, Bengali, Gujarati, Malayalam, Punjabi and Odia, plus English, with the agent following callers who switch mid-call.',
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

export function AiCallCenter() {
  return (
    <MarketingLayout>
      <Seo
        title="AI Call Center Automation Software for India | Vistrow Voice"
        description="Call center automation for the first line: AI call center software that takes inbound calls and follow-ups in Indian languages and logs every call."
        path="/ai-call-center"
        jsonLd={FAQ_JSONLD}
      />

      <PageHero
        eyebrow="AI call center"
        title="AI call center software for the first line, not the whole floor."
        subhead="Let an AI voice agent answer the repeat calls, capture every enquiry and handle routine follow-ups, and hand your team the calls that need a person - with the transcript already written."
      />

      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <div className="grid gap-8 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.10] via-surface to-surface p-7 sm:p-9 lg:grid-cols-2">
          <div>
            <SectionEyebrow>What it is</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">An agent that picks up first.</h2>
            <p className="mt-4 leading-relaxed text-text-muted">
              In most call centers, a large share of calls ask the same few things: where is my order, what are your
              timings, is this still available, can I book for Saturday. AI call center software puts a voice agent
              at the front of the queue to answer those in the caller’s language, from information you have approved,
              and to collect the details your team needs for everything else.
            </p>
          </div>
          <div>
            <SectionEyebrow>Call center automation</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Automate steps, not judgement.</h2>
            <p className="mt-4 leading-relaxed text-text-muted">
              Call center automation is usually sold as replacing people. In practice the parts worth automating are
              narrower: answering, note-taking, form-filling, booking and the follow-up call nobody got round to. With
              Vistrow Voice those steps happen on the call, and the result - recording, transcript, summary and
              captured fields - lands in your CRM, Slack or Google Sheets without anyone typing it up.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-8 max-w-2xl">
          <SectionEyebrow>Who handles what</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">A sensible split between the agent and your team.</h2>
          <p className="mt-3 text-text-muted">You decide the boundary in the agent’s instructions; this is where most teams start.</p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-surface-high">
                <th scope="col" className="px-5 py-4 font-display text-sm font-semibold">Call type</th>
                <th scope="col" className="px-5 py-4 font-display text-sm font-semibold text-primary">AI agent</th>
                <th scope="col" className="px-5 py-4 font-display text-sm font-semibold text-text-muted">Your team</th>
              </tr>
            </thead>
            <tbody>
              {SPLIT.map((row) => (
                <tr key={row.task} className="border-t border-border bg-surface">
                  <th scope="row" className="px-5 py-4 font-semibold text-text">{row.task}</th>
                  <td className="px-5 py-4 text-text">{row.ai}</td>
                  <td className="px-5 py-4 text-text-muted">{row.team}</td>
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
              <Icon name="support_agent" className="text-[22px]" />
            </span>
            <h2 className="mt-5 font-display text-2xl font-bold tracking-tight">Handing a call to a person.</h2>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              On phone calls, set a transfer number on the agent and transfer becomes available to it. When a caller
              asks for a human, or the call needs one, the agent dials your colleague into the same call and stays on
              until they answer, then steps back. If the transfer does not go through, it apologises and takes a
              callback number instead of leaving the caller on hold.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              Website widget calls run in the browser and cannot be transferred to a phone. There the agent offers a
              callback and captures the number, which shows up in the call record and your integrations. The
              guide to{' '}
              <Link to="/help/agents/agent-functions-and-transfer" className="font-semibold text-primary underline-offset-4 hover:underline">
                functions and transfer
              </Link>{' '}
              covers the settings.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-7 sm:p-8">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-high text-cyan">
              <Icon name="phone_callback" className="text-[22px]" />
            </span>
            <h2 className="mt-5 font-display text-2xl font-bold tracking-tight">Follow-ups and outbound calls.</h2>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              Callbacks the agent promised, leads that arrived overnight, reminders that are due: these are the calls
              that slip when the floor is busy.{' '}
              <Link to="/product/outbound" className="font-semibold text-primary underline-offset-4 hover:underline">
                Outbound campaigns
              </Link>{' '}
              let you pick a number, an agent and a contact list or segment, and show each campaign’s connected,
              pending, no-answer, failed and blocked counts.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              For new leads, the Instant Lead Follow-up webhook queues a call when a website form, CRM or automation
              tool posts a lead to it. Start outbound with a small list and read the transcripts before widening it;
              every dial still passes the compliance checks below. For lead calls specifically, see the{' '}
              <Link to="/ai-telecaller" className="font-semibold text-primary underline-offset-4 hover:underline">
                AI telecaller
              </Link>{' '}
              page; for one agent across inbound and outbound calls, see the{' '}
              <Link to="/ai-calling-agent" className="font-semibold text-primary underline-offset-4 hover:underline">
                AI calling agent
              </Link>{' '}
              page.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-10 max-w-2xl">
          <SectionEyebrow>Compliance controls</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Rules the agent cannot talk its way around.</h2>
          <p className="mt-3 text-text-muted">
            These are settings in the dashboard, checked by the system rather than left to the agent’s instructions.
            You remain responsible for your own calling and consent obligations; these controls help you meet them.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {COMPLIANCE.map((c) => (
            <div key={c.title} className="rounded-2xl border border-border bg-surface p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                <Icon name={c.icon} className="text-[22px]" />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{c.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm text-text-muted">
          Details:{' '}
          <Link to="/help/compliance/calling-rules" className="font-semibold text-primary underline-offset-4 hover:underline">
            calling window and Do-Not-Call
          </Link>
          ,{' '}
          <Link to="/help/compliance/consent-recording-retention" className="font-semibold text-primary underline-offset-4 hover:underline">
            consent, recording and retention
          </Link>
          , and how we handle data on the{' '}
          <Link to="/security" className="font-semibold text-primary underline-offset-4 hover:underline">
            security page
          </Link>
          .
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <div>
            <SectionEyebrow>Reporting</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">What a supervisor sees.</h2>
            <p className="mt-4 leading-relaxed text-text-muted">
              Every call is in Calls history, filterable by channel, direction and feedback, with the transcript,
              recording, captured fields and earlier calls from the same number. Nothing has to be reconstructed from
              memory after a shift.
            </p>
          </div>
          <ul className="grid gap-3 text-sm leading-relaxed text-text-muted sm:grid-cols-2">
            {[
              'Calls, qualified leads, minutes and bookings against the previous period',
              'Breakdown by language, peak hour, sentiment, channel and agent',
              'A funnel from answered to engaged, qualified and booked',
              'CRM delivery status on each call, with re-send',
              'Cards that flag a CRM that stopped receiving leads or calls that ended before anyone spoke',
              'Optional email alerts when integration deliveries start failing',
            ].map((item) => (
              <li key={item} className="flex gap-2 rounded-xl border border-border bg-surface p-4">
                <Icon name="bar_chart" className="mt-0.5 shrink-0 text-[16px] text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="rounded-2xl border border-border bg-surface p-7 sm:p-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-high text-cyan">
            <Icon name="info" className="text-[22px]" />
          </span>
          <h2 className="mt-5 font-display text-2xl font-bold tracking-tight">Where it does not replace your team.</h2>
          <ul className="mt-4 grid gap-3 text-sm leading-relaxed text-text-muted md:grid-cols-3">
            <li>
              <strong className="text-text">Escalations and disputes.</strong> An angry customer needs someone who can
              make a decision. The agent’s job is to capture the facts and transfer.
            </li>
            <li>
              <strong className="text-text">Anything outside your knowledge base.</strong> With strict mode on, the
              agent says it will check with the team rather than improvising an answer.
            </li>
            <li>
              <strong className="text-text">Sensitive or regulated advice.</strong> Medical, legal and financial
              judgement stays with qualified people; the agent can book them, not stand in for them.
            </li>
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-8 max-w-2xl">
          <SectionEyebrow>Rollout</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">A low-risk first month.</h2>
        </div>
        <ol className="grid gap-4 md:grid-cols-4">
          {[
            { title: 'Pick one queue', body: 'After-hours, one enquiry number, or one campaign. Leave the rest of the floor as it is.' },
            { title: 'Write the boundary', body: 'List what the agent answers, what it collects, and when it must transfer.' },
            { title: 'Test the hard calls', body: 'Run Testing Lab scenarios: angry caller, silent caller, language switch, transfer unavailable.' },
            { title: 'Review weekly', body: 'Read transcripts with the team leads, fix the knowledge base, then widen.' },
          ].map((step, i) => (
            <li key={step.title} className="rounded-2xl border border-border bg-surface p-6">
              <span className="font-display text-2xl font-bold text-primary">{i + 1}</span>
              <h3 className="mt-3 font-display text-base font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-sm text-text-muted">
          Support-heavy teams can start from{' '}
          <Link to="/solutions/support" className="font-semibold text-primary underline-offset-4 hover:underline">
            AI voice agents for customer support
          </Link>
          ; usage is billed by conversation minutes, explained on the{' '}
          <Link to="/pricing" className="font-semibold text-primary underline-offset-4 hover:underline">
            pricing page
          </Link>
          .
        </p>
      </section>

      <FaqSection items={FAQ} title="AI call center questions." />

      <CTABand
        title="Bring one queue to a demo."
        subtitle="Tell us the calls your team answers most, and we will show the agent handling them - and handing off the rest."
      />
    </MarketingLayout>
  )
}
