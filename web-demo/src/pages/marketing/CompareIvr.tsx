import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { RoiCalculator } from '../../components/RoiCalculator'
import { CTABand, SectionEyebrow, TalkToArthaButton } from '../../components/MarketingBits'

// Deliberately compares against the incumbent *category* — a phone menu or
// a human call desk — not against named competitors. That's both the
// honest comparison (it's what these buyers are actually replacing) and
// the durable one: no claims about another company's product that go stale
// or get disputed.

const ROWS: { dimension: string; ivr: string; human: string; vistrow: string }[] = [
  {
    dimension: 'Caller experience',
    ivr: 'Press 1, press 2, press 9 to repeat',
    human: 'Natural — if someone picks up',
    vistrow: 'Natural conversation, answered on the first ring',
  },
  {
    dimension: 'Availability',
    ivr: '24/7, but only to route',
    human: 'Business hours, minus breaks and leave',
    vistrow: '24/7, actually resolving the call',
  },
  {
    dimension: 'Languages',
    ivr: 'Usually two, chosen up front',
    human: 'Whatever that person speaks',
    vistrow: '10 Indian languages, switching mid-call',
  },
  {
    dimension: 'Peak load',
    ivr: 'Queues and hold music',
    human: 'Queues, or missed calls',
    vistrow: 'Every call answered in parallel',
  },
  {
    dimension: 'Answer quality',
    ivr: 'Fixed menu, no answers',
    human: 'Varies by person and by day',
    vistrow: 'Grounded in your knowledge base, consistent every call',
  },
  {
    dimension: 'Record of the call',
    ivr: 'Call logs only',
    human: 'Notes, if someone writes them',
    vistrow: 'Recording, transcript, outcome, and CRM sync automatically',
  },
  {
    dimension: 'Booking an appointment',
    ivr: 'Transfer to a human',
    human: 'Yes, manually',
    vistrow: 'Checks real availability and books on the call',
  },
  {
    dimension: 'Cost as volume grows',
    ivr: 'Flat, but unresolved calls pile up',
    human: 'Linear — more calls, more people',
    vistrow: 'Per minute of conversation, no new hires',
  },
]

const FAQ = [
  {
    q: 'Is this just a smarter IVR?',
    a: 'No. An IVR routes — it collects a keypress and sends the caller somewhere. Artha holds a conversation, answers from your knowledge base, captures details, and books appointments without transferring anyone.',
  },
  {
    q: 'Will it replace my whole call team?',
    a: 'Usually not, and we don’t recommend framing it that way. It absorbs the repetitive, high-volume calls — status checks, timings, qualification, reminders — so your team spends their day on the calls that genuinely need a person.',
  },
  {
    q: 'What happens when the AI can’t help?',
    a: 'It hands off to a human with the full context attached, or takes a message. It should never dead-end a caller, and it’s configured not to invent an answer it doesn’t have.',
  },
  {
    q: 'Do we have to replace our phone number?',
    a: 'No — point your existing business number at Vistrow, or get a new one from us. The website call widget needs no phone number at all.',
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
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  return (
    <MarketingLayout>
      <Seo
        title="AI Voice Agent vs. Traditional IVR — Vistrow Voice"
        description="How an AI voice agent differs from a press-1-press-2 phone menu or a human call desk: availability, languages, answer quality, call records, and cost as volume grows."
        path="/vs-ivr"
        jsonLd={FAQ_JSONLD}
      />

      <section className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8 lg:py-20">
        <SectionEyebrow>Comparison</SectionEyebrow>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
          Nobody has ever enjoyed pressing 1 for sales.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-text-muted">
          Most businesses answer calls with a phone menu, a small team, or both. Here’s how an AI voice
          agent actually differs — including where it doesn’t win.
        </p>
        <div className="mt-8 flex justify-center">
          <TalkToArthaButton />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-10 md:px-8">
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-surface-high">
                <th className="px-5 py-4 font-display text-sm font-semibold"> </th>
                <th className="px-5 py-4 font-display text-sm font-semibold text-text-muted">
                  Traditional IVR
                </th>
                <th className="px-5 py-4 font-display text-sm font-semibold text-text-muted">
                  Human call desk
                </th>
                <th className="px-5 py-4 font-display text-sm font-semibold text-primary">
                  Vistrow Voice
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.dimension} className="border-t border-border bg-surface">
                  <td className="px-5 py-4 font-semibold text-text">{row.dimension}</td>
                  <td className="px-5 py-4 text-text-muted">{row.ivr}</td>
                  <td className="px-5 py-4 text-text-muted">{row.human}</td>
                  <td className="px-5 py-4">
                    <span className="flex items-start gap-2 text-text">
                      <Icon name="check_circle" className="mt-0.5 flex-shrink-0 text-[16px] text-cyan" />
                      {row.vistrow}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Where a human still wins — credibility comes from admitting this */}
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
        <div className="mb-8 text-center">
          <SectionEyebrow>Run the numbers</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">
            What it would cost you.
          </h2>
        </div>
        <RoiCalculator />
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-14 md:px-8">
        <div className="mb-10 text-center">
          <SectionEyebrow>FAQ</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Questions, answered.</h2>
        </div>
        <div className="flex flex-col gap-3">
          {FAQ.map((item, i) => (
            <div key={item.q} className="rounded-2xl border border-border bg-surface">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
              >
                <span className="font-semibold text-text">{item.q}</span>
                <Icon
                  name="expand_more"
                  className={`text-[20px] text-text-muted transition-transform ${openFaq === i ? 'rotate-180' : ''}`}
                />
              </button>
              {openFaq === i && (
                <p className="px-6 pb-5 text-sm leading-relaxed text-text-muted">{item.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <CTABand />
    </MarketingLayout>
  )
}
