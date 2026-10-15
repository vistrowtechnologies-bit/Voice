import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, PageHero, SectionEyebrow } from '../../components/MarketingBits'

// Plain-language explainer for "voice bot" / "voicebot" / "AI voice bot" /
// "AI voice call". The sample conversation is written for illustration and is
// labelled as such on the page - it is not a recording of a real call.

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

export function VoiceBot() {
  return (
    <MarketingLayout>
      <Seo
        title="AI Voice Bot for Business Calls in India | Vistrow Voice"
        description="What an AI voice bot is, how a voicebot call works, and how Vistrow Voice runs one on phone and website calls in Hindi, English and 9 more Indian languages."
        path="/voice-bot"
        jsonLd={FAQ_JSONLD}
      />

      <PageHero
        eyebrow="AI voice bot"
        title="An AI voice bot that talks with your callers, not at them."
        subhead="A plain-language guide to voice bots: what they are, how a call works, what one sounds like, and how to run one for your business on the phone and on your website."
      />

      <section className="mx-auto max-w-3xl px-5 py-8 md:px-8">
        <SectionEyebrow>In plain words</SectionEyebrow>
        <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">What a voice bot is.</h2>
        <div className="mt-4 space-y-4 leading-relaxed text-text-muted">
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
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-10 max-w-2xl">
          <SectionEyebrow>How a voicebot call works</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Four things happen on every turn.</h2>
        </div>
        <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PARTS.map((part) => (
            <li key={part.title} className="rounded-2xl border border-border bg-surface p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                <Icon name={part.icon} className="text-[22px]" />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">{part.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{part.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
          <div className="rounded-2xl border border-border bg-surface p-6 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionEyebrow>Sample conversation</SectionEyebrow>
              <span className="rounded-full border border-border px-3 py-1 text-xs text-text-muted">
                Written for illustration - not a real call
              </span>
            </div>
            <p className="mt-3 text-sm text-text-muted">
              A made-up dental clinic, in the Hinglish many callers use. The bot offers only slots that are free in the
              clinic’s calendar, and does not quote a price it was not given.
            </p>
            <ul className="mt-5 space-y-3">
              {SAMPLE.map((line, i) => (
                <li key={i} className={`flex ${line.who === 'caller' ? 'justify-end' : 'justify-start'}`}>
                  <span
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      line.who === 'caller' ? 'bg-primary/10 text-text' : 'border border-border bg-surface-high text-text'
                    }`}
                  >
                    <span className="mb-0.5 block text-[11px] font-bold uppercase tracking-widest text-text-muted">
                      {line.who === 'caller' ? 'Caller' : 'Voice bot'}
                    </span>
                    {line.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SectionEyebrow>What the clinic gets</SectionEyebrow>
            <h2 className="mt-3 font-display text-2xl font-bold tracking-tight">The record after the call.</h2>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              In a real deployment, a call like this would leave behind:
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-text-muted">
              {[
                'A booking in Appointments for the chosen slot, marked as made by the agent',
                'The full transcript, a short summary and the recording if recording is on',
                'The caller’s name and number in Contacts',
                'Any after-call fields you defined, such as the service asked about',
                'A copy sent to the CRM, Slack channel or sheet you connected',
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <Icon name="check_circle" className="mt-0.5 shrink-0 text-[16px] text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-text-muted">
              For a longer example with the call output laid out, see the{' '}
              <Link to="/demo-calls/hindi-real-estate-lead-qualification" className="font-semibold text-primary underline-offset-4 hover:underline">
                Hindi lead qualification demo call
              </Link>{' '}
              or talk to Artha yourself.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-8 max-w-2xl">
          <SectionEyebrow>In Vistrow Voice</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Where each part of a voice bot lives.</h2>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-surface-high">
                <th scope="col" className="px-5 py-4 font-display text-sm font-semibold">You want to</th>
                <th scope="col" className="px-5 py-4 font-display text-sm font-semibold text-primary">Where it is</th>
              </tr>
            </thead>
            <tbody>
              {MAPPING.map((row) => (
                <tr key={row.need} className="border-t border-border bg-surface">
                  <th scope="row" className="px-5 py-4 font-semibold text-text">{row.need}</th>
                  <td className="px-5 py-4 text-text-muted">{row.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface p-7 sm:p-8">
            <h2 className="font-display text-2xl font-bold tracking-tight">Good jobs for a voice bot.</h2>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-text-muted">
              <li>Answering the same questions many times a day, in several languages</li>
              <li>Taking enquiries and asking the qualifying questions before sales calls back</li>
              <li>Booking, rescheduling and confirming appointments</li>
              <li>Picking up after hours, when the alternative is a missed call</li>
              <li>Talking to website visitors who would rather speak than type</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-7 sm:p-8">
            <h2 className="font-display text-2xl font-bold tracking-tight">Jobs to keep with people.</h2>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-text-muted">
              <li>Complaints that need someone with authority to fix them</li>
              <li>Medical, legal or financial judgement</li>
              <li>Questions your knowledge base does not answer yet</li>
              <li>Long, high-value conversations where trust matters most</li>
            </ul>
            <p className="mt-4 text-sm text-text-muted">
              Replacing a keypad menu specifically? The{' '}
              <Link to="/vs-ivr" className="font-semibold text-primary underline-offset-4 hover:underline">
                voice agent vs IVR comparison
              </Link>{' '}
              goes through it.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/[0.08] to-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <SectionEyebrow>Cost</SectionEyebrow>
            <h2 className="mt-2 font-display text-xl font-bold tracking-tight">What a voice bot costs to run.</h2>
            <p className="mt-1 max-w-2xl text-sm text-text-muted">
              Usage is counted by conversation minutes and the voice and model tier you choose; number rental and
              carrier charges are separate.
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
              Voice bot cost factors
            </Link>
          </div>
        </div>
      </section>

      <FaqSection items={FAQ} title="Voice bot questions." />

      <CTABand
        title="Talk to a voice bot right now."
        subtitle="Artha is our own AI voice agent. Start a call in your browser, switch languages mid-sentence, and see how it handles you."
      />
    </MarketingLayout>
  )
}
