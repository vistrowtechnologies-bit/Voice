import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand } from '../../components/MarketingBits'
import { ScriptMarquee } from '../../components/BharatBits'
import { pageFigures } from '../../lib/pageFigures'
import { LANGUAGES } from '../../lib/marketingContent'
import {
  FeatureList,
  ObjectionCards,
  Reveal,
  RiskReducers,
  SectionHead,
  SplitHero,
  SplitRow,
  StickyCta,
  TrustBand,
  useStickyRefs,
} from '../../components/showcase'
import { W4_AGENT_LANGUAGE, W4_MIXED_TRANSCRIPT } from './premiumW4Visuals'

const HERO_TITLE = 'Your customer shouldn’t have to switch languages to be understood.'
const SETUP_HEADING = 'One agent, one default language, and it follows the caller.'
const HARD_HEADING = 'Translation isn’t the same as speaking the language.'
const SETUP_ICONS = ['language', 'swap_horiz', 'record_voice_over', 'numbers', 'receipt_long', 'devices']

const WHY_HARD = [
  {
    icon: 'sync_alt',
    title: 'Mid-sentence switching',
    body: 'Real callers mix languages inside a single sentence. Artha follows the switch instead of forcing the caller to pick one and stay there.',
  },
  {
    icon: 'record_voice_over',
    title: 'Grammatical gender',
    body: 'In Hindi, Marathi, Gujarati, and Punjabi, verbs agree with the speaker’s gender. Artha stays consistent with its own voice from the first line of the call to the last.',
  },
  {
    icon: 'badge',
    title: 'Numbers and names',
    body: 'Amounts, dates, and Indian names are the first thing a generic voice model gets wrong. They’re the details that decide whether a call sounds local or imported.',
  },
]

// Owner decision 21 Oct 2026: the site claims "more than 130 languages" (the
// Studio voices' list, voice_catalog.GEMINI_38_FLASH_TTS_TOTAL_LANGUAGES) and
// names Hindi, English and the 9 other Indian languages from lib/agentOptions.ts LANGUAGES
// as the most tested. Keep copy and the hero stat in step with that decision.
const LANGUAGE_SETUP = [
  {
    title: 'Set a default language',
    body: 'Each agent has a default language: the one it greets callers in. A Pune developer might open in Marathi, a Chennai clinic in Tamil, a national helpline in Hindi or English. The welcome message is written in that language too.',
  },
  {
    title: 'The caller can switch',
    body: 'If a caller answers in another language, or mixes English words into Hindi, Kannada or Telugu, the agent replies in the language the caller is using rather than asking them to switch back.',
  },
  {
    title: 'Pick a voice that suits the language',
    body: 'Voices are added from the Voices page and previewed before you use them. Some voices are tuned to sound native in a particular language while still speaking the others, so a Tamil line can use a voice that sounds local.',
  },
  {
    title: 'Numbers, dates and names',
    body: 'Prices, dates, phone numbers and Indian names are where generic voice systems sound foreign. Test them in your own language in the Testing Lab before going live, and add the spellings that matter to your knowledge base.',
  },
  {
    title: 'Same records in every language',
    body: 'Whatever language the call ran in, it is saved with a recording, a transcript and a summary in Calls history, and the lead details go to your CRM, Slack, Google Sheets or a webhook in the same format.',
  },
  {
    title: 'Phone and website',
    body: 'Languages work the same way on phone calls (inbound and outbound) and on browser calls from the website widget.',
  },
]

const inlineLink = 'font-semibold text-primary underline-offset-4 hover:underline'

// Premium layout (showcase kit): split hero with the languages map, the
// language cards, how language works beside the
// agent page, the violet trust band, why it is hard beside a mixed-language
// transcript, objections, then the CTA band.
export function LanguagesOverview() {
  const { heroCtaRef, endRef } = useStickyRefs()
  const heroVisual = pageFigures('/languages', HERO_TITLE)[0]

  return (
    <MarketingLayout>
      <Seo
        title="AI Voice Agents in 130+ Languages incl. Hindi | Vistrow Voice"
        description="AI voice agents that speak 130+ languages, including Hindi, English, Marathi, Tamil, Telugu, Kannada, Bengali, Gujarati, Malayalam, Punjabi and Odia."
        path="/languages"
      />

      <SplitHero
        eyebrow="Languages"
        title={HERO_TITLE}
        subhead="Artha speaks more than 130 languages, including Hindi, English and 9 other Indian languages, and switches mid-call when the caller does - including the everyday mixed speech most people actually use on the phone, on phone calls and website calls."
        visual={heroVisual}
        placement="languages_hero"
        ctaRef={heroCtaRef}
        trust={
          <>
            <RiskReducers className="mt-5" />
            <p className="mt-5 max-w-xl border-t border-border pt-5 text-sm text-text-muted">
              Each Indian language has its own page with a sample conversation and regional notes, for example{' '}
              <Link to="/languages/kannada" className={inlineLink}>
                Kannada for Bengaluru and Karnataka
              </Link>{' '}
              and{' '}
              <Link to="/languages/telugu" className={inlineLink}>
                Telugu for Hyderabad, Telangana and Andhra Pradesh
              </Link>
              .
            </p>
          </>
        }
      />

      <ScriptMarquee />

      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
        <Reveal>
          <SectionHead
            eyebrow="Indian languages"
            title="Hindi, English and 9 other Indian languages, each with its own page."
            intro="Open a language to read a sample call in its own script and hear the agent switch with the caller."
            className="mb-10"
          />
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 sm:max-lg:grid-close-2 lg:grid-close-3">
          {LANGUAGES.map((lang, i) => (
            <Reveal key={lang.slug} delayMs={(i % 3) * 70} className="h-full">
              <Link
                to={`/languages/${lang.slug}`}
                className={`vv-lift group flex h-full flex-col rounded-3xl border p-6 ${
                  i === 0 ? 'border-primary/40 bg-gradient-to-br from-primary/[0.14] via-surface to-surface' : 'border-border bg-surface'
                }`}
              >
                <p lang={lang.code} className="font-display text-3xl font-bold leading-none text-primary">
                  {lang.native}
                </p>
                {/* The greeting is the point of the product - show it, don't
                    just name the language. */}
                <p lang={lang.code} className="mt-2 text-sm text-text-muted">{lang.greeting}</p>
                <div className="mt-4 flex items-center gap-1">
                  <h2 className="font-display text-lg font-semibold">{lang.name}</h2>
                  <Icon
                    name="arrow_forward"
                    className="text-[16px] text-text-muted transition-transform group-hover:translate-x-1 group-hover:text-primary"
                  />
                </div>
                <p className="mt-1 text-xs uppercase tracking-wider text-text-muted">{lang.region}</p>
                <p className="mt-3 text-sm leading-relaxed text-text-muted">{lang.blurb}</p>
              </Link>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <Link
            to="/languages/american-british-english"
            className="vv-lift group mt-4 flex flex-col gap-2 rounded-3xl border border-border bg-surface p-6 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>
              <span className="block text-xs font-bold uppercase tracking-widest text-text-muted">Callers in the US or UK</span>
              <span className="mt-1 flex items-center gap-1 font-display text-lg font-semibold">
                American and British English AI voice agent
                <Icon
                  name="arrow_forward"
                  className="text-[16px] text-text-muted transition-transform group-hover:translate-x-1 group-hover:text-primary"
                />
              </span>
            </span>
            <span className="text-sm text-text-muted sm:max-w-sm sm:text-right">Hear a demo call in American and British English.</span>
          </Link>
        </Reveal>
      </section>

      <div className="bg-surface-high/40">
        <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
          <SplitRow figure={W4_AGENT_LANGUAGE(SETUP_HEADING)} className="">
            <Reveal>
              <SectionHead eyebrow="How language works on an agent" title={SETUP_HEADING} />
            </Reveal>
            <FeatureList items={LANGUAGE_SETUP.map((item, i) => ({ ...item, icon: SETUP_ICONS[i] }))} />
          </SplitRow>
          <p className="mt-8 max-w-3xl text-sm leading-relaxed text-text-muted">
            Where to go next: the{' '}
            <Link to="/product/agents" className={inlineLink}>
              voice agent builder
            </Link>{' '}
            is where the default language and voice are set; the{' '}
            <Link to="/help/voices/choose-voices" className={inlineLink}>
              guide to choosing voices
            </Link>{' '}
            explains the voice tiers; and the sample transcripts show real flows, such as a{' '}
            <Link to="/demo-calls/marathi-site-visit-booking" className={inlineLink}>
              Marathi site-visit booking
            </Link>{' '}
            and a{' '}
            <Link to="/demo-calls/telugu-website-widget-call" className={inlineLink}>
              Telugu website widget call
            </Link>
            . If you are replacing a keypad menu, the{' '}
            <Link to="/ai-ivr" className={inlineLink}>
              AI IVR page
            </Link>{' '}
            covers how a multilingual agent answers your existing number.
          </p>
          <p className="mt-4 max-w-3xl text-xs leading-relaxed text-text-muted">
            The live demo above can also open in some languages outside this list. Those run on voices we are
            still testing and are not available on customer agents yet.
          </p>
        </section>
      </div>

      <div className="py-14 lg:py-16">
        <TrustBand placement="languages_trust_band" />
      </div>

      <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8 lg:pb-16">
        <SplitRow figure={W4_MIXED_TRANSCRIPT(HARD_HEADING)} flip className="">
          <Reveal>
            <SectionHead eyebrow="Why this is hard" title={HARD_HEADING} />
          </Reveal>
          <FeatureList items={WHY_HARD} />
        </SplitRow>
      </section>

      <ObjectionCards route="/languages" placement="languages_objections" />

      <div ref={endRef} />
      <CTABand />
      <StickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </MarketingLayout>
  )
}
