import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand } from '../../components/MarketingBits'
import { HERO_STATS } from '../../lib/marketingContent'
import {
  AGENT_CALLOUTS,
  Bento,
  BOOK_DEMO_CLASS,
  DashboardCallouts,
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
import { ActionBand, CheckPanel, SampleCall, Section, TableCard } from './premium-w2/W2Kit'
import { W2_VISUALS } from './premium-w2/visuals'

// Plain-language explainer for "voice bot" / "voicebot" / "AI voice bot" /
// "AI voice call". The sample conversation is written for illustration and is
// labelled as such on the page - it is not a recording of a real call.

const ROUTE = '/voice-bot'
const V = W2_VISUALS[ROUTE]

const PARTS = [
  {
    icon: 'hearing',
    title: 'It listens',
    body: 'Speech recognition turns what the caller says into text as they speak, including Hindi-English and other mixed speech.',
  },
  {
    icon: 'psychology',
    title: 'It decides',
    body: 'A language model reads the conversation with your instructions and knowledge base, and works out the next thing to say or do.',
  },
  {
    icon: 'graphic_eq',
    title: 'It speaks',
    body: 'A synthetic voice says the reply. Callers can interrupt, and the bot stops and listens, as a person would.',
  },
  {
    icon: 'task_alt',
    title: 'It acts',
    body: 'Tools let it do things during the call: check free slots and book one, request a callback, save lead details, or, on phone calls, transfer to a colleague.',
  },
]

const SAMPLE: { who: 'bot' | 'caller'; text: string }[] = [
  { who: 'bot', text: 'Namaste, Sunrise Dental Clinic. Main aapki appointment mein help kar sakti hoon. Bataiye?' },
  { who: 'caller', text: 'Haan, mujhe cleaning karwani hai, is Saturday aa sakta hoon kya?' },
  { who: 'bot', text: 'Saturday ko 11 baje aur 3 baje ke slots free hain. Kaunsa theek rahega?' },
  { who: 'caller', text: '11 baje theek hai. Cleaning ka price kitna hai?' },
  { who: 'bot', text: 'Clinic ki list ke hisaab se cleaning ka charge doctor checkup ke baad confirm hota hai. Main 11 baje ka slot book kar doon? Aapka naam bata dijiye.' },
  { who: 'caller', text: 'Rohan Mehta.' },
  { who: 'bot', text: 'Ho gaya, Rohan Mehta ji. Saturday 11 baje, cleaning. Aur kuch chahiye?' },
]

const MAPPING: { need: string; where: string }[] = [
  { need: 'Decide what the bot says and does', where: 'Agent instructions, persona and welcome message, drafted for you by Build with AI' },
  { need: 'Keep its answers factual', where: 'Knowledge base with approved Q&A pairs and strict mode' },
  { need: 'Choose how it sounds', where: 'Voices page, with a default language per agent' },
  { need: 'Let it book or hand over', where: 'Built-in booking, callback and lead tools; transfer on phone calls' },
  { need: 'Reach it by phone', where: 'Phone numbers connected over SIP and routed to the agent' },
  { need: 'Reach it from your website', where: 'Website widget: a call button, no app or phone number needed' },
  { need: 'Check it before customers do', where: 'Testing Lab scenarios and saved regression tests' },
  { need: 'Get the result after the call', where: 'Calls history plus Zoho CRM, ArthaLeads, Slack, Google Sheets or a webhook' },
]

const FAQ = [
  {
    q: 'What is a voice bot?',
    a: 'A voice bot is software that holds a spoken conversation with a person, usually on a phone call or a website. A modern AI voice bot understands free speech instead of keypad presses, answers from information you give it, and can take actions such as booking an appointment.',
  },
  {
    q: 'Is a voicebot the same as an AI voice agent or a chatbot?',
    a: 'Voice bot, voicebot and AI voice agent are used for the same thing; agent tends to mean one that can take actions as well as answer. A chatbot works in text. Many businesses use both, but a voice bot reaches people who would rather call than type.',
  },
  {
    q: 'What is an AI voice call?',
    a: 'A call where the other side is an AI voice bot rather than a person or a recorded menu. With Vistrow Voice that can be a phone call to or from your business number, or a call a visitor starts from your website in the browser.',
  },
  {
    q: 'Will callers know they are talking to a bot?',
    a: 'They should. We recommend the welcome message says it is an AI assistant, and you can require spoken consent for recording at the start of the call. Being upfront also makes callers more patient with the occasional repeat.',
  },
  {
    q: 'What happens when the voice bot does not know the answer?',
    a: 'With strict mode on, it says it will check with the team instead of guessing, and it can take a callback request. On phone calls with a transfer number set, it can bring a colleague into the call.',
  },
  {
    q: 'How long does it take to set up a voice bot?',
    a: 'The first draft is quick with Build with AI. The time goes into writing down your real answers for the knowledge base and running test calls until the hard cases sound right. Plan time for testing as well as building.',
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

export function VoiceBot() {
  const { heroCtaRef, endRef } = useStickyRefs()
  return (
    <MarketingLayout>
      <Seo
        title="AI Voice Bot for Business Calls in India | Vistrow Voice"
        description="What an AI voice bot is, how a voicebot call works, and how Vistrow Voice runs one on phone and website calls in 130+ languages, including Hindi and English."
        path="/voice-bot"
        jsonLd={FAQ_JSONLD}
      />

      <SplitHero
        eyebrow="AI voice bot"
        title="An AI voice bot that talks with your callers, not at them."
        subhead="A plain-language guide to voice bots: what they are, how a call works, what one sounds like, and how to run one for your business on the phone and on your website."
        visual={V.hero}
        chips={[
          { label: 'Voice bot on a call', live: true },
          { label: 'Slot booked', icon: 'event_available' },
        ]}
        placement="voice_bot_hero"
        trust={<HeroFacts facts={HERO_STATS} />}
        ctaRef={heroCtaRef}
      />

      <Section className="py-12 lg:py-14">
        <SplitRow figure={V.menu} className="">
          <Reveal>
            <SectionHead eyebrow="In plain words" title="What an AI voice bot is." />
            <div className="mt-5 space-y-4 leading-relaxed text-text-muted">
              <p>
                A voice bot is a computer program you can talk to. You call a number or press a button on a website, and
                instead of a recorded menu asking you to press 1, something answers and asks what you need. You reply in
                your own words; it replies in a natural voice; and when the call ends, the business has a written record
                of what was said and what was agreed.
              </p>
              <p>
                Older voice bots matched keywords against a fixed script and broke as soon as a caller said something
                unexpected. Today’s AI voice bots use language models, so they cope with how people actually talk:
                half-sentences, a change of mind, an English word in the middle of a Hindi sentence. They are still only
                as good as the instructions and facts you give them, which is why the setup work is mostly writing down
                what your best staff already know.
              </p>
            </div>
          </Reveal>
        </SplitRow>
      </Section>

      <Bento
        visual={V.turn}
        items={PARTS}
        head={<SectionHead eyebrow="How a voicebot call works" title="Four things happen on every turn." />}
      />

      <Section>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-10">
          <Reveal>
            <SampleCall
              eyebrow="Sample conversation"
              title="A dental clinic booking, in Hinglish."
              badge="Written for illustration - not a real call"
              intro="A made-up dental clinic, in the Hinglish many callers use. The bot offers only slots that are free in the clinic’s calendar, and does not quote a price it was not given."
              turns={SAMPLE.map((line) => ({ agent: line.who === 'bot', label: line.who === 'caller' ? 'Caller' : 'Voice bot', text: line.text }))}
            />
          </Reveal>
          <Reveal delayMs={80} className="lg:sticky lg:top-28">
            <CheckPanel
              tone="violet"
              head={
                <>
                  <span className="text-xs font-bold uppercase tracking-widest text-white/75">What the clinic gets</span>
                  <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-white">The record after the call.</h2>
                  <p className="mt-3 text-sm leading-relaxed text-white/80">In a real deployment, a call like this would leave behind:</p>
                </>
              }
              items={[
                'A booking in Appointments for the chosen slot, marked as made by the agent',
                'The full transcript, a short summary and the recording if recording is on',
                'The caller’s name and number in Contacts',
                'Any after-call fields you defined, such as the service asked about',
                'A copy sent to the CRM, Slack channel or sheet you connected',
              ]}
            >
              <p className="mt-5 text-sm text-white/85">
                For a longer example with the call output laid out, see the{' '}
                <Link to="/demo-calls/hindi-real-estate-lead-qualification" className="font-semibold text-white underline underline-offset-4">
                  Hindi lead qualification demo call
                </Link>{' '}
                or talk to Artha yourself.
              </p>
            </CheckPanel>
          </Reveal>
        </div>
      </Section>

      <TrustBand placement="voice_bot_trust_band" />

      <Section>
        <Reveal>
          <SectionHead eyebrow="In Vistrow Voice" title="Where each part of a voice bot lives." className="mb-10" />
        </Reveal>
        <TableCard>
          <thead>
            <tr className="bg-gradient-to-r from-primary/[0.10] to-surface-high">
              <th scope="col" className="px-5 py-4 font-display text-sm font-semibold">You want to</th>
              <th scope="col" className="px-5 py-4 font-display text-sm font-semibold text-primary">Where it is</th>
            </tr>
          </thead>
          <tbody>
            {MAPPING.map((row) => (
              <tr key={row.need} className="border-t border-border">
                <th scope="row" className="px-5 py-4 font-semibold text-text">
                  <span className="flex items-center gap-3">
                    <Icon name="check_circle" className="shrink-0 text-[18px] text-primary" />
                    {row.need}
                  </span>
                </th>
                <td className="px-5 py-4 text-text-muted">{row.where}</td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      </Section>

      <DashboardCallouts
        view={V.agent}
        callouts={AGENT_CALLOUTS}
        title="Where you set up the voice bot."
        intro="The agent page in the real Vistrow Voice dashboard, with sample data."
      />

      <Section>
        <div className="grid gap-5 md:grid-cols-2">
          <Reveal className="h-full">
            <CheckPanel
              tone="violet"
              titleAs="h2"
              title={<span className="text-2xl font-bold tracking-tight">Good jobs for a voice bot.</span>}
              items={[
                'Answering the same questions many times a day, in several languages',
                'Taking enquiries and asking the qualifying questions before sales calls back',
                'Booking, rescheduling and confirming appointments',
                'Picking up after hours, when the alternative is a missed call',
                'Talking to website visitors who would rather speak than type',
              ]}
            />
          </Reveal>
          <Reveal delayMs={80} className="h-full">
            <CheckPanel
              tone="cyan"
              icon="support_agent"
              titleAs="h2"
              title={<span className="text-2xl font-bold tracking-tight">Jobs to keep with people.</span>}
              items={[
                'Complaints that need someone with authority to fix them',
                'Medical, legal or financial judgement',
                'Questions your knowledge base does not answer yet',
                'Long, high-value conversations where trust matters most',
              ]}
            >
              <p className="mt-5 text-sm text-text-muted">
                Replacing a keypad menu specifically? The{' '}
                <Link to="/vs-ivr" className={linkClass}>
                  voice agent vs IVR comparison
                </Link>{' '}
                goes through it. For one bot that answers your number and also calls customers back, see the{' '}
                <Link to="/ai-calling-agent" className={linkClass}>
                  AI calling agent
                </Link>{' '}
                page.
              </p>
            </CheckPanel>
          </Reveal>
        </div>
      </Section>

      <ActionBand
        eyebrow="Cost"
        title="What a voice bot costs to run."
        body="Usage is counted by conversation minutes and the voice and model tier you choose; number rental and carrier charges are separate."
        actions={
          <>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white shadow-[0_14px_36px_-14px_rgba(147,51,234,0.8)] transition-transform hover:-translate-y-0.5"
            >
              See plans and pricing
              <Icon name="arrow_forward" className="text-[16px]" />
            </Link>
            <Link to="/ai-voice-bot-pricing-india" className={BOOK_DEMO_CLASS}>
              Voice bot cost factors
            </Link>
          </>
        }
      />

      <ObjectionCards route={ROUTE} placement="voice_bot_objections" />

      <FaqSection items={FAQ} title="Voice bot questions." />

      <div ref={endRef} />
      <CTABand
        title="Talk to a voice bot right now."
        subtitle="Artha is our own AI voice agent. Start a call in your browser, switch languages mid-sentence, and see how it handles you."
      />
      <StickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </MarketingLayout>
  )
}
