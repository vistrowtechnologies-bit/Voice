import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Icon3D } from '../../components/Icon3D'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand } from '../../components/MarketingBits'
import { HERO_STATS, LANGUAGES } from '../../lib/marketingContent'
import {
  Bento,
  FeatureList,
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
import { BadgeTimeline, BoundaryBand, SampleCall, Section } from './premium-w2/W2Kit'
import { W2_VISUALS } from './premium-w2/visuals'

// Landing page for "AI telecaller" / "AI calling agent". Claims are limited to
// what the product does today: transfer works on phone calls only
// (agent/tools.py transfer_call bridges a colleague in and refuses web calls),
// callback requests land in Appointments and integrations (request_callback),
// campaigns have max attempts / retry minutes / concurrency (Outbound.tsx,
// server/campaign_dialer.py), and every outbound dial is checked against the
// account's Do-Not-Call list and calling window. Outbound is described without
// volume or scale claims.

const ROUTE = '/ai-telecaller'
const V = W2_VISUALS[ROUTE]

const JOBS = [
  {
    icon: 'call_received',
    title: 'Inbound lead calls',
    body: 'When a prospect rings the number on your ad, hoarding or website, the agent picks up, answers from your approved information and asks the questions your telecallers would ask.',
  },
  {
    icon: 'bolt',
    title: 'New-lead follow-up',
    body: 'Post a lead from a website form, your CRM or an automation tool to the Instant Lead Follow-up webhook and a call is queued within about 15 to 30 seconds, still inside your calling rules.',
  },
  {
    icon: 'call_made',
    title: 'Follow-up campaigns',
    body: 'Pick a number, an agent and a contact list or segment. The agent calls each contact with their own details filled into the script, and each campaign shows connected, pending, no-answer, failed and blocked counts.',
  },
  {
    icon: 'phone_callback',
    title: 'Callbacks',
    body: 'If a caller wants to talk later, or a slot they asked for is not free, the agent records a callback request with name, number, preferred time and reason. It appears in Appointments and in your connected tools.',
  },
]

const RULES = [
  {
    icon: 'block',
    title: 'Do-Not-Call list',
    body: 'Every outbound dial is checked against your Do-Not-Call list first. When someone asks not to be called again, the agent adds them itself. Blocked contacts are counted, not called.',
  },
  {
    icon: 'schedule',
    title: 'Calling window',
    body: 'With the calling window enforced, dials outside your permitted hours and days are blocked automatically, using your account’s timezone.',
  },
  {
    icon: 'history',
    title: 'Retries you control',
    body: 'Set the maximum attempts per contact and how many minutes to wait before a retry. With one attempt, a contact who does not answer is not called again by that campaign.',
  },
  {
    icon: 'record_voice_over',
    title: 'Spoken consent',
    body: 'Turn on spoken consent and the agent’s first reply asks whether recording and follow-up are okay. If the person declines, the recording is discarded and no personal details are collected.',
  },
]

const SAMPLE: { speaker: 'Agent' | 'Lead'; native: string; gloss: string }[] = [
  {
    speaker: 'Agent',
    native: 'नमस्ते प्रिया जी, मैं ABC Academy से AI assistant बात कर रही हूँ। आपने कल website पर weekend batch के लिए enquiry की थी, दो मिनट बात हो सकती है?',
    gloss: 'Hello Priya ji, I am an AI assistant from ABC Academy. You enquired about the weekend batch on the website yesterday; can we talk for two minutes?',
  },
  { speaker: 'Lead', native: 'हाँ, बताइए। Fees कितनी हैं और classes कब से शुरू हैं?', gloss: 'Yes, tell me. How much are the fees and when do the classes start?' },
  {
    speaker: 'Agent',
    native: 'Weekend batch अगले महीने 5 तारीख़ से शुरू है। Fees की exact details हमारी counsellor आपको बता देंगी। आप online classes लेंगी या centre पर?',
    gloss: 'The weekend batch starts on the 5th of next month. Our counsellor will give you the exact fee details. Will you take online classes or at the centre?',
  },
  { speaker: 'Lead', native: 'Centre पर। लेकिन अभी मैं office में हूँ, शाम को call कर सकते हैं?', gloss: 'At the centre. But I am at the office right now; can you call in the evening?' },
  {
    speaker: 'Agent',
    native: 'ज़रूर। मैंने आज शाम 6:30 बजे counsellor के call के लिए note कर लिया है। धन्यवाद प्रिया जी!',
    gloss: 'Of course. I have noted a call from the counsellor at 6:30 this evening. Thank you, Priya ji!',
  },
]

const START = [
  { title: 'Pick a source', body: 'Website form leads or one inbound number. Leave the rest of the team’s list as it is.' },
  { title: 'Write the script', body: 'The questions to ask, what the agent may answer, and when to hand over.' },
  { title: 'Test hard calls', body: 'Use the Testing Lab: busy lead, language switch, price question, request for a person.' },
  { title: 'Review and widen', body: 'Read a week of transcripts with your team lead, fix the knowledge base, then add sources.' },
]

const FAQ = [
  {
    q: 'What is an AI telecaller?',
    a: 'An AI voice agent that does the routine part of a telecaller’s job: answering lead calls, calling new enquiries back, asking qualifying questions, booking a visit or appointment and recording the outcome. Your team then calls the leads that need a person, with the transcript and captured details in hand.',
  },
  {
    q: 'Is an AI telecaller the same as an AI calling agent or AI voice calling agent?',
    a: 'They describe the same idea from different angles. Telecaller is the role your team already knows; calling agent and voice calling agent describe the software. In Vistrow Voice it is one agent that you can put on inbound phone calls, outbound campaigns and the website call widget.',
  },
  {
    q: 'Can it transfer a call to my sales team?',
    a: 'On phone calls, yes. Set a transfer number on the agent and it dials your colleague into the same call and stays on until they answer. If nobody picks up it offers a callback. Website widget calls cannot be transferred to a phone, so the agent takes a callback number instead.',
  },
  {
    q: 'How does it follow calling rules in India?',
    a: 'Every outbound dial is checked against your own Do-Not-Call list and, when enforced, your calling window. The agent adds people who ask not to be called again. These controls help you comply; you remain responsible for your own consent and telemarketing obligations, including the national registry.',
  },
  {
    q: 'Which languages can it call in?',
    a: 'Hindi and English plus Marathi, Tamil, Telugu, Kannada, Bengali, Gujarati, Malayalam, Punjabi and Odia. It opens in the language you set and follows the caller if they switch, including Hinglish and other mixed speech.',
  },
  {
    q: 'How many calls can it make at once?',
    a: 'You set a concurrent-call limit per campaign, and actual throughput depends on your workspace and the channels on your telephony account. Start with a small list, read the transcripts, and tell us your expected peak during a demo so we can confirm what your setup supports.',
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

export function AiTelecaller() {
  const { heroCtaRef, endRef } = useStickyRefs()
  return (
    <MarketingLayout>
      <Seo
        title="AI Telecaller for Indian Businesses | Vistrow Voice"
        description="An AI telecaller that answers and calls back leads, qualifies them and runs follow-ups in 130+ languages, including Hindi and English, inside your calling rules."
        path="/ai-telecaller"
        jsonLd={FAQ_JSONLD}
      />

      <SplitHero
        eyebrow="AI telecaller"
        title="AI telecaller for Indian businesses."
        subhead="An AI calling agent that answers lead calls, rings back new enquiries, asks your qualifying questions in the caller’s language and leaves your team a clean record - so people spend their time on the leads that are ready."
        visual={V.hero}
        chips={[
          { label: 'Calling new leads', live: true },
          { label: 'Do-Not-Call checked first', icon: 'block' },
        ]}
        placement="ai_telecaller_hero"
        trust={<HeroFacts facts={HERO_STATS} />}
        ctaRef={heroCtaRef}
      />

      <Section className="py-12 lg:py-14">
        <SplitRow figure={V.flow} className="">
          <Reveal>
            <SectionHead eyebrow="Why teams look for one" title="The calls that slip are the ones that matter." />
            <p className="mt-5 leading-relaxed text-text-muted">
              A telecalling team spends much of the day on the same few conversations: confirming interest, asking budget
              and timeline, explaining the basics, and chasing people who did not pick up. New enquiries arrive in the
              evening and get called the next morning, by which time the prospect has spoken to someone else. An AI
              voice calling agent takes those routine calls at any hour and writes down what was said, so your
              telecallers start the day with qualified leads instead of a list of names.
            </p>
          </Reveal>
        </SplitRow>
      </Section>

      <Bento
        visual={V.campaigns}
        items={JOBS}
        head={<SectionHead eyebrow="What it does" title="Inbound, follow-ups and callbacks." />}
      />
      <Section className="-mt-8 pb-10 pt-0">
        <p className="text-sm text-text-muted">
          More on{' '}
          <Link to="/product/inbound" className={linkClass}>inbound call answering</Link>,{' '}
          <Link to="/product/outbound" className={linkClass}>outbound campaigns</Link> and{' '}
          <Link to="/help/integrations/instant-lead-follow-up" className={linkClass}>calling new leads within seconds</Link>.
          For the same agent on every kind of business call, see the{' '}
          <Link to="/ai-calling-agent" className={linkClass}>AI calling agent</Link> page.
        </p>
      </Section>

      <Section>
        <SplitRow figure={V.record} className="">
          <Reveal>
            <SectionHead eyebrow="Lead qualification" title="Your questions, asked the same way every time." />
            <p className="mt-4 leading-relaxed text-text-muted">
              You write the questions into the agent’s instructions and choose the fields to pull from every
              transcript. The agent asks them in order, accepts answers in mixed language, and does not invent
              prices or availability: with strict mode on, anything outside your knowledge base is passed to the team.
            </p>
          </Reveal>
          <ul className="mt-6 grid gap-3 text-sm leading-relaxed text-text-muted sm:grid-cols-2">
            {[
              'Need, budget, location and timeline, or any field you define',
              'Interest level and the best time for a person to call',
              'A site visit, demo or appointment booked on your calendar',
              'Transcript, summary and recording on every call',
              'Leads sent to Zoho CRM, ArthaLeads, Slack, Google Sheets or a webhook',
              'Earlier calls from the same number, shown together in Calls history',
            ].map((item, i) => (
              <li key={item}>
                <Reveal delayMs={(i % 2) * 60} className="vv-lift flex h-full gap-3 rounded-2xl border border-border bg-surface p-4">
                  <Icon name="check_circle" className="mt-0.5 shrink-0 text-[18px] text-primary" />
                  <span>{item}</span>
                </Reveal>
              </li>
            ))}
          </ul>
        </SplitRow>
      </Section>

      <Section>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-8">
          <Reveal>
            <SampleCall
              eyebrow="Sample conversation"
              titleAs="h2"
              title="A follow-up call to a website enquiry, in Hinglish."
              intro="A written example to show the style of call, with an English gloss under each line. It is not a recording of a customer call, and the business name is a placeholder."
              badge="Written sample"
              lang="hi"
              turns={SAMPLE.map((turn) => ({
                agent: turn.speaker === 'Agent',
                label: turn.speaker === 'Agent' ? 'AI telecaller' : 'Lead',
                text: turn.native,
                gloss: turn.gloss,
              }))}
              outcome="The fee question goes to a person because it is not in the agent’s approved answers. Preferred mode and the callback time are saved on the call for the counsellor."
            />
          </Reveal>

          <div className="grid gap-5 lg:sticky lg:top-28">
            <Reveal delayMs={60}>
              <div className="bento-hero relative overflow-hidden rounded-3xl p-6 shadow-[0_24px_50px_-30px_rgba(76,29,149,0.9)] sm:p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-white">
                  <Icon3D name="translate" size={32} plate className="text-[22px]" />
                </span>
                <h2 className="mt-4 font-display text-lg font-semibold text-white">Calls in the lead’s language</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/85">
                  The agent opens in the language you set and follows the caller if they switch. It speaks English and
                  these Indian languages:
                </p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {LANGUAGES.map((lang) => (
                    <li key={lang.slug}>
                      <Link
                        to={`/languages/${lang.slug}`}
                        className="inline-flex min-h-11 items-center rounded-full border border-white/30 bg-white/10 px-3 py-1 sm:min-h-0 text-sm text-white transition-colors hover:bg-white/20"
                      >
                        {lang.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delayMs={120}>
              <div className="rounded-3xl border border-border bg-surface p-6 sm:p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <Icon3D name="support_agent" className="text-[22px]" />
                </span>
                <h2 className="mt-4 font-display text-lg font-semibold">Handing over to a person</h2>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">
                  On phone calls, set a transfer number and the agent can dial your colleague into the same call, staying on
                  until they answer. If the transfer does not go through, it takes a callback request instead. Website
                  widget calls run in the browser and cannot be transferred to a phone. See{' '}
                  <Link to="/help/agents/agent-functions-and-transfer" className={linkClass}>functions and transfer</Link>.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      <TrustBand placement="ai_telecaller_trust_band" />

      <Section>
        <SplitRow figure={V.checks} flip className="">
          <Reveal>
            <SectionHead
              eyebrow="Calling rules"
              title="Checks that run before every outbound dial."
              intro="These are dashboard settings enforced by the system, not instructions the agent could ignore. They help you meet your obligations; they do not replace them."
            />
          </Reveal>
          <FeatureList items={RULES} />
          <p className="mt-5 text-sm text-text-muted">
            Details:{' '}
            <Link to="/help/compliance/calling-rules" className={linkClass}>calling window and Do-Not-Call</Link> and{' '}
            <Link to="/help/compliance/consent-recording-retention" className={linkClass}>consent, recording and retention</Link>.
          </p>
        </SplitRow>
      </Section>

      <BoundaryBand
        eyebrow="Know the limits"
        title="Where it does not replace your telecallers."
        items={[
          <>
            <strong className="text-text">Negotiation and closing.</strong> Discounts, payment plans and the final
            decision need a person who can make commitments. The agent books that conversation.
          </>,
          <>
            <strong className="text-text">Relationship calls.</strong> Long-standing customers, complaints and
            sensitive situations are better handled by someone who knows the history.
          </>,
          <>
            <strong className="text-text">Cold lists.</strong> The agent works best on people who enquired or are
            already customers. It is not a tool for calling numbers without consent.
          </>,
        ]}
      />

      <Section className="py-14 lg:py-20">
        <Reveal>
          <SectionHead eyebrow="Getting started" title="Start with one lead source." className="mb-12" />
        </Reveal>
        <BadgeTimeline steps={START.map((step, i) => ({ ...step, badge: `Step ${i + 1}` }))} />
        <p className="mt-10 text-sm text-text-muted">
          Property teams can start from{' '}
          <Link to="/solutions/real-estate" className={linkClass}>AI calling for real estate</Link>; reminder and
          collection calls are covered under{' '}
          <Link to="/solutions/finance" className={linkClass}>finance and collections</Link>. For a whole support floor,
          see <Link to="/ai-call-center" className={linkClass}>AI call center software</Link>.
        </p>
      </Section>

      <ObjectionCards route={ROUTE} placement="ai_telecaller_objections" />

      <FaqSection items={FAQ} title="AI telecaller questions." />

      <div ref={endRef} />
      <CTABand
        title="Bring one lead list to a demo."
        subtitle="Tell us who you call and what you ask, and we will show the agent making that call - and handing over the rest."
      />
      <StickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </MarketingLayout>
  )
}
