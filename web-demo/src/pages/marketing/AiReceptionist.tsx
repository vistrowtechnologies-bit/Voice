import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Icon3D } from '../../components/Icon3D'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { HERO_STATS, LANGUAGES } from '../../lib/marketingContent'
import {
  BookDemoLink,
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
import { ActionBand, BadgeTimeline, CheckPanel, LINK_CLASS as linkClass, MediaCard, SampleCall, Section } from './premium-w2/W2Kit'
import { W2_VISUALS } from './premium-w2/visuals'

// Landing page for the "AI receptionist" query cluster. Every capability here
// is checked against the product: transfer is phone-only (agent/tools.py
// transfer_call refuses web calls), bookings land in the built-in Appointments
// calendar, routes with a blank call window answer at any time, and the
// integrations are Zoho CRM, ArthaLeads, Slack, Google Sheets and webhook.
// No WhatsApp or Facebook claims, no prices: link to /pricing instead.
// Layout: the premium kit (components/showcase/) plus the wave 2 pieces in
// ./premium-w2/.

const ROUTE = '/ai-receptionist'
const V = W2_VISUALS[ROUTE]

const CHANNELS = [
  {
    icon: 'call',
    title: 'On your phone number',
    body: 'Connect a business number and route it to the agent. It picks up with your welcome line, answers from your knowledge base, books a slot or takes a message, and can transfer the call to a colleague when a person is needed.',
    to: '/product/inbound',
    link: 'Inbound call answering',
    figure: V.phone,
  },
  {
    icon: 'widgets',
    title: 'On your website',
    body: 'Add the call button to your site and visitors talk to the same agent in their browser, with no number to dial. Each site keeps its own call history, including the page a conversation started from.',
    to: '/product/widget',
    link: 'Website call widget',
    figure: V.website,
  },
]

const DAY = [
  {
    time: '8:10 am',
    icon: 'quiz',
    title: 'A timing question before the doors open',
    body: 'A caller wants to know whether the clinic is open on Sunday. The agent answers from the approved timings in the knowledge base and the call ends in under a minute.',
  },
  {
    time: '11:30 am',
    icon: 'event_available',
    title: 'A booking while the front desk is busy',
    body: 'Two people are at the counter and the phone rings. The agent asks which service the caller needs, offers free slots inside your business hours and confirms only once the booking has saved.',
  },
  {
    time: '3:45 pm',
    icon: 'swap_calls',
    title: 'A complaint that needs a person',
    body: 'A caller is unhappy about a bill. The agent does not argue or improvise a refund. It dials the transfer number you set and stays on the line until your colleague answers.',
  },
  {
    time: '9:20 pm',
    icon: 'dark_mode',
    title: 'An enquiry after closing time',
    body: 'Nobody is at the desk. The agent still answers, captures the caller’s name, number and reason, and books the first free slot or records a callback request for the morning.',
  },
]

const SAMPLE = [
  { speaker: 'Agent', line: 'Namaste, Sunrise Dental Clinic. How can I help you today?' },
  { speaker: 'Caller', line: 'Haan, mujhe cleaning ki appointment chahiye, Thursday ko.' },
  { speaker: 'Agent', line: 'Theek hai. Thursday ko 11 baje aur 4 baje ka slot khaali hai. Aapko kaunsa time suit karega?' },
  { speaker: 'Caller', line: '4 baje. Mera naam Priya hai.' },
  { speaker: 'Agent', line: 'Thank you, Priya ji. Thursday 4 baje ka appointment book ho gaya hai. Kya main is number ko hi contact number ke liye save kar doon?' },
]

const HANDLES = [
  'Common questions answered from your approved knowledge base: timings, location, services, documents to bring',
  'Appointments booked into your Appointments calendar, inside the hours and slot length you set',
  'Callback requests and messages with the caller’s name, number and reason',
  'Lead details such as budget, location or visit reason, saved as fields on the call',
  'Callers who switch between Hindi, English and another supported language mid-sentence',
  'Returning callers, if you turn on Memory: the agent greets them with a short summary of earlier calls',
]

const HANDS_OVER = [
  'The caller asks for a person: on phone calls the agent transfers to the number you set',
  'Complaints, disputes or anything your instructions mark as “always a person”',
  'Questions your knowledge base does not cover: with strict mode on, it says it will check with the team',
  'Website calls that need a person: a browser call cannot be transferred to a phone, so the agent takes a callback number instead',
]

const INDUSTRIES = [
  {
    icon: 'health_and_safety',
    title: 'Clinics and diagnostic centres',
    body: 'Timing questions, appointment requests and rescheduling, with worrying symptoms sent to a person rather than handled by the agent.',
    to: '/solutions/healthcare',
    link: 'AI voice receptionist for clinics',
  },
  {
    icon: 'apartment',
    title: 'Real estate offices',
    body: 'Property enquiries qualified on budget, location and timeline, and site visits booked while the buyer is still on the line.',
    to: '/solutions/real-estate',
    link: 'AI calling agent for real estate',
  },
  {
    icon: 'account_balance',
    title: 'Finance and lending',
    body: 'General product and document questions answered from approved material, with account-specific requests passed to an authorised person.',
    to: '/solutions/finance',
    link: 'Voice agents for finance',
  },
  {
    icon: 'support_agent',
    title: 'Support desks',
    body: 'How-to questions answered first, then a clean handoff with the transcript so your team does not restart the conversation.',
    to: '/solutions/support',
    link: 'AI voice agents for customer support',
  },
]

const FAQ = [
  {
    q: 'What is an AI receptionist?',
    a: 'An AI receptionist is a voice agent that answers your business calls and website voice conversations the way a front-desk person would: it greets the caller, answers common questions, books appointments, takes messages and passes the call to a person when needed. It works at any hour and keeps a transcript of every conversation.',
  },
  {
    q: 'Can the AI receptionist transfer a call to my staff?',
    a: 'Yes, on phone calls. Set a transfer number on the agent and it can dial your colleague into the call and stay on until they answer. Calls made from the website widget run in the browser and cannot be transferred to a phone, so the agent takes a callback number instead.',
  },
  {
    q: 'Which languages does it speak?',
    a: 'Hindi and English, plus Marathi, Tamil, Telugu, Kannada, Bengali, Gujarati, Malayalam, Punjabi and Odia. It starts in the language you set and switches when the caller does, including Hinglish and other mixed speech.',
  },
  {
    q: 'Where do the appointments go?',
    a: 'Into the Appointments calendar in your dashboard, in calendar or list view. Your team can reschedule a booking or mark it confirmed, completed, cancelled or no-show. The agent only offers slots inside the business hours, slot length and blackout dates you set under Settings.',
  },
  {
    q: 'Does it answer calls after office hours?',
    a: 'It answers whenever the route allows. Leave the call window on the number’s route blank and the agent picks up at any time, including nights, Sundays and holidays. If you set a window or active days, calls outside them are not answered by the agent.',
  },
  {
    q: 'How does my team see what happened on a call?',
    a: 'Every call is saved in Calls history with its transcript, a summary, the details captured and, if recording is on, the audio. Leads can also be sent to Zoho CRM, ArthaLeads, Slack, Google Sheets or any webhook as the call ends.',
  },
  {
    q: 'How much does an AI receptionist cost?',
    a: 'Calls are billed in credits by the minute of conversation, and each plan includes a monthly allowance. The voice and model you choose change how many credits a minute uses. Current plans are on the pricing page.',
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

export function AiReceptionist() {
  const { heroCtaRef, endRef } = useStickyRefs()
  return (
    <MarketingLayout>
      <Seo
        title="AI Receptionist for Indian Businesses | Vistrow Voice"
        description="An AI receptionist that answers your phone and website calls in 130+ languages, including Hindi and English, books appointments and transfers to your team."
        path="/ai-receptionist"
        jsonLd={FAQ_JSONLD}
      />

      <SplitHero
        eyebrow="AI receptionist"
        title="AI receptionist for Indian businesses."
        subhead="A voice agent that answers every call on your number and your website, books appointments into your calendar, and hands the caller to your team when a person is needed, in the language they speak."
        visual={V.hero}
        placement="ai_receptionist_hero"
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
                'Answers at any hour your route allows, including nights and holidays',
                '130+ languages, including Hindi, English and 9 other Indian languages, switching when the caller does',
                'Books into the built-in Appointments calendar',
                'Transcript, summary and captured details for every call',
              ]}
            />
          }
        >
          <Reveal>
            <SectionHead eyebrow="What is an AI receptionist?" title="The front desk, on every call." />
            <p className="mt-5 leading-relaxed text-text-muted">
              An AI receptionist answers your business calls the way a good front-desk person does. It greets the caller,
              works out what they need, answers from the information you have approved, books an appointment, takes a
              message, or connects them to the right colleague. Unlike a recorded{' '}
              <Link to="/ai-ivr" className={linkClass}>press-1 phone menu</Link>, the caller simply talks. Unlike a
              voicemail box, every call ends with a next step and a written record.
            </p>
          </Reveal>
        </SplitRow>
      </Section>

      <Section>
        <Reveal>
          <SectionHead
            eyebrow="Where it answers"
            title="One agent for the phone and the website."
            intro="Build the receptionist once, with its voice, greeting, knowledge and rules, then use it on your phone line, your website, or both."
            className="mb-10"
          />
        </Reveal>
        <div className="grid gap-5 lg:grid-cols-2">
          {CHANNELS.map((item, i) => (
            <Reveal key={item.title} delayMs={i * 80} className="h-full">
              <MediaCard figure={item.figure} icon={item.icon} title={item.title} body={item.body} to={item.to} link={item.link} />
            </Reveal>
          ))}
        </div>
      </Section>

      <Section>
        <Reveal>
          <SectionHead
            eyebrow="A day at the front desk"
            title="Four calls, one receptionist."
            intro="A sample day at a dental clinic, written to show how the agent handles different kinds of call. The clinic, times and caller are illustrative, not a customer account."
            className="mb-12"
          />
        </Reveal>
        <BadgeTimeline steps={DAY.map((step) => ({ icon: step.icon, badge: step.time, title: step.title, body: step.body }))} />

        <SplitRow figure={V.day} className="pt-14">
          <Reveal>
            <SampleCall
              title="Sample conversation: the 11:30 booking, in Hinglish."
              intro="A short written sample to show the style of call. It is not a recording of a customer call."
              badge="Written sample"
              turns={SAMPLE.map((turn) => ({ agent: turn.speaker === 'Agent', label: turn.speaker, text: turn.line }))}
              outcomeIcon="event_available"
              outcome="Outcome: the booking appears in Appointments with the caller’s name and number, and the call is saved with its transcript and summary."
            />
          </Reveal>
        </SplitRow>
      </Section>

      <TrustBand placement="ai_receptionist_trust_band" />

      <Section>
        <SplitRow figure={V.handover} className="">
          <Reveal>
            <SectionHead eyebrow="Know its limits" title="What it handles, and when it hands over." />
          </Reveal>
          <div className="mt-8 grid gap-4">
            <Reveal>
              <CheckPanel title="Handles on its own" items={HANDLES} />
            </Reveal>
            <Reveal delayMs={80}>
              <CheckPanel title="Hands to a person" items={HANDS_OVER} icon="swap_calls" tone="cyan">
                <p className="mt-4 text-sm text-text-muted">
                  Setup details are in the{' '}
                  <Link to="/help/agents/agent-functions-and-transfer" className={linkClass}>
                    functions and transfer guide
                  </Link>
                  .
                </p>
              </CheckPanel>
            </Reveal>
          </div>
        </SplitRow>
      </Section>

      <Section>
        <SplitRow figure={V.calendar} flip className="">
          <div className="grid gap-10">
            <Reveal>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-magenta text-white">
                <Icon3D name="calendar_month" size={32} plate className="text-[22px]" />
              </span>
              <h2 className="mt-5 font-display text-3xl font-bold tracking-tight">Appointments, booked on the call.</h2>
              <p className="mt-3 leading-relaxed text-text-muted">
                The agent books into the Appointments calendar built into your dashboard. Set business hours for each day,
                a slot length between 15 and 60 minutes, your timezone and any blackout dates under Settings, and it offers
                only free slots inside them. It confirms a booking to the caller only after the booking has saved.
              </p>
              <p className="mt-3 text-sm text-text-muted">
                More in{' '}
                <Link to="/help/appointments/manage-appointments" className={linkClass}>
                  bookings and availability
                </Link>
                .
              </p>
            </Reveal>
            <Reveal delayMs={80}>
              <div className="rounded-3xl border border-border bg-surface p-6 sm:p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <Icon3D name="dark_mode" className="text-[22px]" />
                </span>
                <h2 className="mt-5 font-display text-2xl font-bold tracking-tight">After-hours answering.</h2>
                <p className="mt-3 text-sm leading-relaxed text-text-muted">
                  Each phone number is routed to an agent with its own timezone, call window, active days and concurrent-call
                  limit. Leave the call window blank and the receptionist answers at any time, so late-evening and Sunday
                  callers get an answer and a booked slot or callback request instead of a ringing phone.
                </p>
                <p className="mt-3 text-sm text-text-muted">
                  See{' '}
                  <Link to="/help/inbound/route-inbound-calls" className={linkClass}>
                    route incoming calls to an agent
                  </Link>
                  .
                </p>
              </div>
            </Reveal>
          </div>
        </SplitRow>
      </Section>

      <Section>
        <SplitRow figure={V.languages} className="">
          <Reveal>
            <SectionEyebrow>Languages</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Speaks the caller’s language.</h2>
            <p className="mt-3 leading-relaxed text-text-muted">
              The receptionist opens in the language you choose and follows the caller if they switch, so nobody has to
              press a key to change language. It speaks more than 130 languages, including Hindi, English and 9 other Indian languages:
            </p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {LANGUAGES.map((lang) => (
                <li key={lang.slug}>
                  <Link
                    to={`/languages/${lang.slug}`}
                    className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-3.5 py-1.5 sm:min-h-0 text-sm text-text-muted transition-colors hover:border-primary hover:text-text"
                  >
                    {lang.name} <span lang={lang.code}>{lang.native}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm leading-relaxed text-text-muted">
              For callers in the south, see{' '}
              <Link to="/languages/kannada" className={linkClass}>
                a Kannada receptionist for Bengaluru and Karnataka
              </Link>{' '}
              or{' '}
              <Link to="/languages/telugu" className={linkClass}>
                a Telugu receptionist for Hyderabad and Andhra Pradesh
              </Link>
              ; both pages have short sample lines. Serving Hindi and Punjabi speakers in the UK, Canada or the
              Gulf? Read our guide to{' '}
              <Link to="/resources/blog/multilingual-ai-receptionist-hindi-punjabi-english" className={linkClass}>
                a multilingual AI receptionist for Hindi, Punjabi and English callers
              </Link>
              . For a front desk in the US or UK, see{' '}
              <Link to="/languages/american-british-english" className={linkClass}>
                the American and British English AI voice agent
              </Link>
              .
            </p>
          </Reveal>
        </SplitRow>
      </Section>

      <Section>
        <SplitRow figure={V.record} className="">
          <Reveal>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-magenta text-white">
              <Icon3D name="receipt_long" size={32} plate className="text-[22px]" />
            </span>
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight">Every call leaves a record.</h2>
            <p className="mt-3 leading-relaxed text-text-muted">
              Each conversation is saved in Calls history with the full transcript, a summary, the fields you asked the
              agent to capture and, if recording is on, the audio. Leads can go to Zoho CRM, ArthaLeads, Slack, Google
              Sheets or any webhook as the call ends. You can require spoken consent at the start of a call and set how many
              days transcripts and recordings are kept.
            </p>
            <p className="mt-3 text-sm text-text-muted">
              See{' '}
              <Link to="/product/integrations" className={linkClass}>
                CRM and webhook integrations
              </Link>
              .
            </p>
          </Reveal>
        </SplitRow>
      </Section>

      <Section>
        <Reveal>
          <SectionHead eyebrow="Who uses one" title="Front desks where a missed call is a missed customer." className="mb-10" />
        </Reveal>
        <FeatureCards items={INDUSTRIES} />
      </Section>

      <ActionBand
        eyebrow="Get started"
        title="Build your receptionist, test it, then connect the number."
        body={
          <>
            Write the greeting, add your FAQs and timings to the knowledge base, and run test calls in the browser
            before any caller reaches it. Calls are billed by the minute of conversation; plans are on the{' '}
            <Link to="/pricing" className={linkClass}>pricing page</Link>.
          </>
        }
        actions={
          <>
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white shadow-[0_14px_36px_-14px_rgba(147,51,234,0.8)] transition-transform hover:-translate-y-0.5"
            >
              Create your account
              <Icon name="arrow_forward" className="text-[16px]" />
            </Link>
            <BookDemoLink placement="ai_receptionist_get_started" />
          </>
        }
      />

      <ObjectionCards route={ROUTE} placement="ai_receptionist_objections" />

      <FaqSection items={FAQ} title="AI receptionist questions, answered." />

      <div ref={endRef} />
      <CTABand
        title="Hear the receptionist before you build one."
        subtitle="Talk to Artha live in your browser, or book a walkthrough using your own front-desk calls."
      />
      <StickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </MarketingLayout>
  )
}
