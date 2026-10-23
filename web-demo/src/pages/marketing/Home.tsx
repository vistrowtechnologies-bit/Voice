import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Icon3D } from '../../components/Icon3D'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { DemoOrbCard } from '../../components/DemoOrbCard'
import { LaunchFilm } from '../../components/LaunchFilm'
import { Seo } from '../../components/Seo'
import { CTABand } from '../../components/MarketingBits'
import { RotatingGreeting, ScriptMarquee } from '../../components/BharatBits'
import { Reveal } from '../../components/Reveal'
import arthaAvatar from '../../assets/artha-avatar.webp'
import { trackMarketingCta } from '../../lib/analytics'
import {
  HOME_FEATURES,
  HOW_IT_WORKS,
  SOLUTIONS,
  HERO_STATS,
  LANGUAGES,
} from '../../lib/marketingContent'
import {
  FeatureList,
  ObjectionCards,
  RiskReducers,
  SectionHead,
  ShowcaseStyles,
  Shot,
  SplitRow,
  StickyCta,
  Timeline,
  TrustBand,
  useStickyRefs,
} from '../../components/showcase'
import { HOME_DASHBOARD, HOME_LANGUAGE_SWITCH, HOME_ONE_AGENT, HOME_REAL_ESTATE_SCENE } from './premium-w5/visuals'

const FAQ = [
  {
    q: 'What is Vistrow Voice?',
    a: 'An AI voice-agent platform for Indian businesses - Artha answers, qualifies, and books inbound, outbound, and web calls 24/7 in more than 130 languages, including Hindi, English and 9 more Indian languages (Marathi, Tamil, Telugu, Kannada, Malayalam, Gujarati, Bengali, Punjabi and Odia).',
  },
  {
    q: 'Do I need to write code to set it up?',
    a: 'No - build an agent with a no-code editor: persona, prompt, voice, and language, then publish. You can build a first agent and test it in the browser in one sitting.',
  },
  {
    q: 'Which languages does Artha speak?',
    a: 'Hindi, Marathi, Tamil, Telugu, Kannada, Malayalam, Gujarati, Bengali, Punjabi, and Odia - plus English and everyday code-switching such as Hinglish. One agent covers all eleven and follows the caller when they switch mid-call.',
  },
  {
    q: 'Can I try it before signing up?',
    a: 'Yes - talk to Artha live in your browser right now on this page, no signup or credit card required.',
  },
  {
    q: 'Does it work for both inbound and outbound calling?',
    a: 'Yes - one agent and one dashboard cover inbound calls, outbound campaigns, and web calls, sharing the same knowledge base and analytics.',
  },
]

// Answer-engine-friendly (AEO/GEO): FAQPage structured data lets Google,
// Bing, and LLM-based answer engines quote these Q&As directly instead of
// having to scrape the accordion markup.
// Organization, WebSite and SoftwareApplication identities are supplied by
// the central SEO registry. This page contributes only its visible FAQ so the
// structured data cannot duplicate or drift from the canonical brand entity.
const HOME_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
}

// The concrete things a globally-built agent gets wrong on an Indian call.
// Each maps to real behaviour: mid-call language switching, the per-turn
// gender-agreement reminder, the Hinglish sentiment cues in emotion.py, and
// the ten-script voice catalog.
// Order matters for the bento grid below, not just for reading flow. In a
// 2-column grid, exactly one card may span both columns without leaving a
// hole: 2 + (4 x 1) = 6 column-units = 3 whole rows. That wide card also has
// to sit at an index that STARTS a row, or CSS grid auto-placement pushes it
// down and leaves a visible gap behind it - so the wide one is last.
const BHARAT_POINTS = [
  {
    glyph: 'हिं+EN',
    title: 'Hinglish is the default, not a fallback',
    body: 'Real callers start a sentence in Hindi and finish it in English. Artha follows the switch mid-sentence instead of forcing the caller to pick one language and stay in it.',
  },
  {
    glyph: 'ने / नी',
    title: 'Gender agreement throughout the call',
    body: 'Hindi, Marathi, Gujarati, and Punjabi verbs agree with the speaker’s gender. Most models get the first line right and drift after that. Artha stays consistent with its own voice, every turn.',
  },
  {
    glyph: 'बकवास',
    title: 'It knows “bakwas” means trouble',
    body: 'Frustration in an Indian call rarely arrives in textbook English. Artha reads the cues people actually use - bekaar, faltu, bakwas - and softens its tone before the caller escalates.',
  },
  {
    glyph: 'आवाज़',
    title: 'A voice that reacts to the caller',
    body: 'Built by an Indian team, tuned for Indian callers: Artha reads frustration, confusion, or excitement in your caller’s voice and shifts its own pace and warmth to match - live, mid-call, not a flat text-to-speech read.',
  },
]

function SectionEyebrow({ children }: { children: string }) {
  return (
    <span className="text-xs font-bold uppercase tracking-widest text-cyan">{children}</span>
  )
}

export function Home() {
  const { heroCtaRef, endRef } = useStickyRefs()
  const [demoSpotlight, setDemoSpotlight] = useState(false)
  const spotlightTimer = useRef<number | null>(null)

  const guideToDemo = () => {
    document.getElementById('live-demo')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setDemoSpotlight(false)
    window.requestAnimationFrame(() => setDemoSpotlight(true))
    if (spotlightTimer.current) window.clearTimeout(spotlightTimer.current)
    spotlightTimer.current = window.setTimeout(() => setDemoSpotlight(false), 5200)
  }
  // Reached via TalkToArthaButton's fallback (navigate('/#live-demo')) when
  // a visitor clicks "Talk to Artha live" on a page with no on-page demo
  // widget - React Router doesn't scroll to hashes on route change, so we
  // finish the job ourselves once the hero (and its #live-demo orb) mounts.
  useEffect(() => {
    if (window.location.hash === '#live-demo') {
      guideToDemo()
    }
    return () => {
      if (spotlightTimer.current) window.clearTimeout(spotlightTimer.current)
    }
    // This only handles the hash present when the homepage mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <MarketingLayout>
      <Seo
        title="AI Voice Agent for India in 130+ Languages | Vistrow Voice"
        description="An AI voice agent for Indian businesses: an AI voice calling agent that answers, qualifies and books customers on phone and web in 130+ languages."
        path="/"
        jsonLd={HOME_JSONLD}
      />
      <button
        type="button"
        onClick={guideToDemo}
        aria-controls="live-demo"
        className="independence-ribbon flex w-full items-center justify-center gap-2 px-4 py-2.5 text-center text-xs font-semibold text-text sm:text-sm"
      >
        <span className="ribbon-tricolour" aria-hidden="true"><i /><i /><i /></span>
        <span>Hear Artha switch language mid-call. Talk to her live, no signup needed</span>
        <Icon name="arrow_forward" className="text-[16px]" />
      </button>
      {/* ---------- Hero ---------- */}
      {/* Owner, 21 Oct: on phones the call card comes straight after the
          headline (it was ~1,000px down), then the description, CTA and stats.
          On desktop: text on the left, card on the right, as before. */}
      <div className="relative overflow-hidden">
      <ShowcaseStyles />
      {/* Soft violet glow behind the call card, as on the product and
          solution heroes. Pure CSS, so it costs the first paint nothing. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-32 top-0 h-[520px] w-[620px] rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute right-[22%] top-[50%] h-[300px] w-[380px] rounded-full bg-magenta/15 blur-[110px]" />
      </div>
      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-5 py-8 md:px-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:gap-x-12 lg:gap-y-0 lg:py-12">
        <div className="lg:col-start-1 lg:row-start-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold uppercase tracking-[0.28em]">
            <span className="font-sans normal-case tracking-normal text-sm text-text-muted">
              भारत के लिए
            </span>
            <span className="text-border">/</span>
            <span aria-label="Built for Bharat">
              <span className="text-text-muted">Built for </span>
              <span className="text-[#ff9933]">BH</span><span className="bharat-middle-letter">AR</span><span className="text-[#138808]">AT</span>
            </span>
          </p>
          {/* The greeting rotates through all ten scripts Artha speaks. It
              carries the positioning better than any adjective could: the
              claim and the proof are the same object. */}
          {/* Steps down to 4xl on the smallest screens - at 5xl this headline
              wrapped to five lines on a 375px viewport and pushed the CTAs
              entirely below the fold. */}
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.06] tracking-tight sm:text-5xl lg:text-[3.4rem]">
            <RotatingGreeting className="block min-h-[1.1em]" />
            <span className="mt-1 block">Answer every customer</span>
            <span className="block bg-gradient-to-r from-primary to-magenta bg-clip-text text-transparent">
              in their own language.
            </span>
          </h1>
        </div>

        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <DemoOrbCard spotlight={demoSpotlight} variant="call" />
        </div>

        <div className="lg:col-start-1 lg:row-start-2">
          <p className="max-w-xl text-[15px] leading-6 text-text-muted sm:mt-5 sm:text-lg sm:leading-relaxed">
            Vistrow Voice is an AI voice agent for Indian businesses, built for how India actually speaks. Your AI voice
            calling agent answers, qualifies, and books customers across phone and web in Hindi, English and 9 more
            Indian languages, with natural Hinglish and mid-sentence language switching.
          </p>
          {/* No "Book a demo" here: the header already has it (owner, 21 Oct). */}
          <div ref={heroCtaRef} className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
            {HERO_STATS.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-border bg-surface/80 px-2 py-3 text-center shadow-[0_18px_40px_-34px_rgba(76,29,149,0.7)] backdrop-blur">
                <p className="font-display text-2xl font-bold text-text">{stat.value}</p>
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-text-muted">{stat.label}</p>
              </div>
            ))}
          </div>
          <RiskReducers className="mt-5" />
        </div>
      </section>
      </div>

      {/* Sits in the slot the old "Trusted by fast-growing Indian businesses"
          strip occupied. That line was an unsubstantiated claim with no logos
          behind it; this says something true instead - every script shown is
          a language the product genuinely speaks. */}
      <ScriptMarquee />

      <LaunchFilm />

      {/* Text and the sample exchange on the left, the approved "menu vs one
          call" visual beside them, so the claim and the proof sit together. */}
      <section className="mx-auto max-w-7xl px-5 py-16 md:px-8">
        <SplitRow figure={HOME_LANGUAGE_SWITCH} className="">
          <Reveal>
            <SectionEyebrow>Hear the difference</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">An AI voice agent for India that switches language without restarting the call.</h2>
            <p className="mt-3 text-text-muted">Artha follows the caller naturally instead of forcing a language menu or a separate agent.</p>
            <a href="#live-demo" className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-primary hover:underline sm:mt-5 sm:min-h-0">Try it live <Icon name="arrow_forward" className="text-[16px]" /></a>
          </Reveal>
          <Reveal delayMs={80} className="mt-8">
          <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 to-surface p-7" aria-label="Example multilingual conversation">
            <div className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-high text-xs font-bold">You</span>
              <p className="rounded-2xl rounded-tl-sm bg-surface-high px-4 py-3 text-sm">Mujhe pricing samajhni hai, but please explain in English.</p>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <p className="rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm text-white">Of course. I’ll explain the plans in English and help you choose based on your call volume.</p>
              <img
                src={arthaAvatar}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-primary/25"
              />
            </div>
            <p className="mt-4 text-right text-[11px] font-semibold uppercase tracking-wider text-text-muted">Hindi → English · same voice · same conversation</p>
          </div>
          </Reveal>
        </SplitRow>
      </section>

      {/* ---------- Built for Bharat ----------
          Every point here maps to something the product actually does
          (language switching, per-turn gender agreement, Hinglish sentiment
          cues in emotion.py, the ten-script catalog). Kept concrete on
          purpose - "built for India" as a slogan is worth nothing; the
          specifics are what a foreign-built agent gets wrong. */}
      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <Reveal>
          <div className="mb-12 max-w-2xl">
            {/* Not "Built for Bharat" - that's already the hero kicker, and
                repeating it two screens later reads as a template, not a
                point of view. */}
            <SectionEyebrow>The difference</SectionEyebrow>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">
              Global voice AI treats India as an edge case.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-text-muted">
              We started here. These aren’t features we bolted on for a market - they’re the
              assumptions the whole system was built around.
            </p>
          </div>
        </Reveal>

        <div className="grid gap-5 md:grid-cols-2">
          {/* Bento: the first point borrows the dashboard's violet hero tile,
              the rest are lifted cards, the same rhythm as the product pages. */}
          {BHARAT_POINTS.map((point, i) => (
            <Reveal key={point.title} delayMs={i * 70} className="h-full">
              <div
                className={`group h-full rounded-3xl p-7 ${
                  i === 0 ? 'bento-hero relative overflow-hidden shadow-[0_24px_50px_-30px_rgba(76,29,149,0.9)]' : 'vv-lift border border-border bg-surface'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className={`font-display font-semibold ${i === 0 ? 'text-xl text-white' : 'text-lg'}`}>{point.title}</h3>
                  <span
                    aria-hidden="true"
                    className={`shrink-0 font-display text-2xl transition-colors ${i === 0 ? 'text-white/80' : 'text-text-muted group-hover:text-primary'}`}
                  >
                    {point.glyph}
                  </span>
                </div>
                <p className={`mt-3 text-sm leading-relaxed ${i === 0 ? 'text-white/85' : 'text-text-muted'}`}>{point.body}</p>
              </div>
            </Reveal>
          ))}

          {/* The tenth-language claim, shown instead of asserted - every glyph
              here is a language the product genuinely speaks, pulled from the
              same LANGUAGES list that drives the hero greeting and /languages.
              Spans both columns: it closes the section, and a full-width row
              is what keeps the 5-card set from leaving an orphan (see the
              note on BHARAT_POINTS above). */}
          <Reveal delayMs={BHARAT_POINTS.length * 70} className="h-full md:col-span-2">
            <div className="vv-lift group relative h-full overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-surface to-surface p-7">
              <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="md:max-w-md">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-display text-lg font-semibold">130+ languages, one agent</h3>
                    <span
                      aria-hidden="true"
                      className="shrink-0 font-display text-2xl text-text-muted transition-colors group-hover:text-primary md:hidden"
                    >
                      अ अ अ
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-text-muted">
                    From Punjabi in the north to Malayalam in the south, one agent covers them all,
                    without a separate deployment for each language.
                  </p>
                  <Link
                    to="/languages"
                    className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-primary hover:underline sm:mt-4 sm:min-h-0"
                  >
                    See every language
                    <Icon name="arrow_forward" className="text-[16px]" />
                  </Link>
                  <p className="mt-3 text-sm text-text-muted">
                    Regional guides:{' '}
                    <Link to="/languages/kannada" className="font-semibold text-primary hover:underline">
                      Kannada calls in Karnataka
                    </Link>{' '}
                    and{' '}
                    <Link to="/languages/telugu" className="font-semibold text-primary hover:underline">
                      Telugu calls in Andhra Pradesh and Telangana
                    </Link>
                    .
                  </p>
                </div>
                {/* Decorative: the greetings already carry the meaning, and
                    reading ten scripts aloud in sequence tells a screen-reader
                    user nothing the sentence above hasn't. */}
                <ul aria-hidden="true" className="flex flex-wrap gap-2 md:max-w-sm md:justify-end">
                  {LANGUAGES.map((lang) => (
                    <li
                      key={lang.slug}
                      className="rounded-full border border-border bg-surface/70 px-3 py-1.5 font-display text-sm text-text-muted transition-colors group-hover:border-primary/40 group-hover:text-text"
                    >
                      {lang.greeting}
                    </li>
                  ))}
                  <li className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 font-display text-sm font-semibold text-primary">
                    + English
                  </li>
                </ul>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- How it works ----------
          Tinted band. Every section used to sit on the same background with
          the same card treatment, so the page read as one endless column of
          boxes with no sense of where a section began or ended. Tinting every
          other section gives the scroll a rhythm, and the slightly darker
          ground also makes the white cards read as raised instead of flat. */}
      {/* The three steps as the kit's numbered timeline: one gradient rail,
          horizontal on desktop and vertical on phones. */}
      <div className="border-y border-border bg-surface-high/40">
        <Timeline eyebrow="How it works" title="Live in minutes, not months." steps={HOW_IT_WORKS} />
      </div>

      {/* ---------- Features grid ---------- */}
      {/* The six products beside the approved "one agent for every channel"
          visual (image on the left, so the rows alternate with the language
          row above). Swipeable rail on phones, a two-column list from sm. */}
      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <SplitRow figure={HOME_ONE_AGENT} flip className="">
          <Reveal>
            <SectionHead eyebrow="The platform" title="One platform for every voice conversation." />
          </Reveal>
          {/* max-w caps the rail's intrinsic width so it cannot widen the
              row's grid track (and the page) on phones. */}
          <div className="vv-rail -mx-5 mt-8 flex max-w-[100vw] snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0">
            {HOME_FEATURES.map((f, i) => (
              <Reveal key={f.to} delayMs={(i % 2) * 60} className="w-[78%] shrink-0 snap-start sm:w-auto sm:shrink">
                <Link
                  to={f.to}
                  className={`vv-lift group flex h-full flex-col rounded-3xl border p-5 ${
                    i === 0 ? 'border-primary/40 bg-gradient-to-br from-primary/[0.14] via-surface to-surface' : 'border-border bg-surface'
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-110 ${
                      i === 0 ? 'bg-gradient-to-br from-primary to-magenta text-white' : 'bg-primary/12 text-primary'
                    }`}
                  >
                    <Icon3D name={f.icon ?? 'circle'} size={i === 0 ? 28 : 32} plate={i === 0} className="text-[20px]" />
                  </span>
                  <h3 className="mt-4 flex items-center gap-1 font-display text-base font-semibold">
                    {f.label}
                    <Icon
                      name="arrow_forward"
                      className="text-[16px] text-text-muted transition-transform group-hover:translate-x-1 group-hover:text-primary"
                    />
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{f.desc}</p>
                </Link>
              </Reveal>
            ))}
          </div>
        </SplitRow>
      </section>

      {/* Mid-page violet band: trust facts and both CTAs. */}
      <TrustBand placement="home_trust_band" />

      {/* ---------- Solutions preview ---------- */}
      <div className="mt-20 border-y border-border bg-surface-high/40">
      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <Reveal>
          <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
            <div>
              <SectionEyebrow>Solutions</SectionEyebrow>
              <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">Built for your industry.</h2>
            </div>
            <Link to="/solutions" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline sm:min-h-0">
              All industries →
            </Link>
          </div>
        </Reveal>
        {/* Five cards in a 3-column grid left two dead slots. Promoting the
            first vertical to a 2-column feature card fills the row exactly
            (2 + 1, then 3) AND puts real weight behind the industry these
            customers actually come from, instead of five interchangeable
            tiles. Same snap rail as the platform grid on phones. */}
        <div className="vv-rail -mx-5 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 sm:max-lg:grid-close-2 lg:grid-cols-3">
          {SOLUTIONS.map((s, i) => (
            <Reveal
              key={s.to}
              delayMs={i * 60}
              className={`w-[78%] shrink-0 snap-start sm:w-auto sm:shrink ${i === 0 ? 'lg:col-span-2' : ''}`}
            >
              <Link
                to={s.to}
                className={`vv-lift group flex h-full flex-col justify-between rounded-3xl border border-border p-6 ${
                  i === 0 ? 'bg-gradient-to-br from-cyan/10 via-surface to-surface lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-6' : 'bg-surface'
                }`}
              >
                {/* The lead industry card carries its call scene from lg up,
                    where the card is wide enough for it to read. */}
                {i === 0 && (
                  <span className="hidden overflow-hidden rounded-2xl border border-border bg-panel lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:block">
                    <Shot figure={HOME_REAL_ESTATE_SCENE} sizes="(min-width: 1280px) 440px, 36vw" />
                  </span>
                )}
                <div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-high text-cyan transition-transform group-hover:scale-110">
                    <Icon3D name={s.icon ?? 'circle'} className="text-[22px]" />
                  </span>
                  <h3 className={`mt-5 font-display font-semibold ${i === 0 ? 'text-2xl' : 'text-lg'}`}>{s.label}</h3>
                  <p className={`mt-2 leading-relaxed text-text-muted ${i === 0 ? 'max-w-md text-base' : 'text-sm'}`}>
                    {s.desc}
                  </p>
                </div>
                <span className="mt-5 flex items-center gap-1 text-sm font-semibold text-primary">
                  Explore
                  <Icon name="arrow_forward" className="text-[16px] transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>
      </div>

      {/* ---------- Public beta access ---------- */}
      {/* Text and the three starting points beside the real dashboard. */}
      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <SplitRow figure={HOME_DASHBOARD} className="">
          <Reveal>
            <SectionEyebrow>Get started</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">Build your first AI voice calling agent in minutes.</h2>
            <p className="mt-4 max-w-2xl text-text-muted">Describe the job in plain English, test it with real calls, and put it on your website or phone line when it is ready. To have it make calls as well as take them, set it up as an{' '}<Link to="/ai-calling-agent" className="font-semibold text-primary underline-offset-4 hover:underline">AI calling agent</Link>.</p>
          </Reveal>
          <FeatureList
            items={[
              { icon: 'mic', title: 'Live voice and chat', body: 'Test real conversations in the browser, by phone, or through your website.' },
              { icon: 'translate', title: '130+ languages, one agent', body: 'More than 130 languages, including Hindi, English and 9 more Indian languages, with natural code-switching and no separate deployment per language.' },
              { icon: 'analytics', title: 'Calls, transcripts and feedback', body: 'Review outcomes, recordings, ratings, and operational analytics in one dashboard.' },
            ]}
          />
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/signup"
              onClick={() => trackMarketingCta('join_beta', 'home_bottom')}
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white shadow-[0_14px_36px_-14px_rgba(147,51,234,0.8)] transition-transform hover:-translate-y-0.5"
            >
              Create your account
            </Link>
            <Link
              to="/contact"
              onClick={() => trackMarketingCta('talk_to_sales', 'home_bottom')}
              className="inline-flex items-center justify-center rounded-full border border-border bg-surface/70 px-6 py-3 text-sm font-bold transition-colors hover:border-primary hover:text-primary"
            >
              Talk to us about volume
            </Link>
          </div>
        </SplitRow>
      </section>

      {/* Buyer objections with a "Still deciding?" CTA bar before the FAQ. */}
      <ObjectionCards route="/" placement="home_objections" />

      {/* ---------- FAQ ---------- */}
      <FaqSection items={FAQ} />

      <div ref={endRef} />

      {/* The homepage kept its own copy of the conversion band, so it did
          not pick up the shared one's redesign. Use CTABand like every other
          page — one place to change it next time. */}
      <CTABand />
      <StickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </MarketingLayout>
  )
}
