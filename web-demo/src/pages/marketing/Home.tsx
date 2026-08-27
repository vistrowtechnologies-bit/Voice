import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { DemoOrbCard } from '../../components/DemoOrbCard'
import { Seo } from '../../components/Seo'
import { TalkToArthaButton } from '../../components/MarketingBits'
import { RotatingGreeting, ScriptMarquee } from '../../components/BharatBits'
import { Reveal } from '../../components/Reveal'
import arthaAvatar from '../../assets/artha-avatar.png'
import {
  HOME_FEATURES,
  HOW_IT_WORKS,
  SOLUTIONS,
  GLOBAL_GREETINGS,
  HERO_STATS,
  LANGUAGES,
} from '../../lib/marketingContent'

const FAQ = [
  {
    q: 'What is Vistrow Voice?',
    a: 'An AI voice-agent platform for Indian businesses - Artha answers, qualifies, and books inbound, outbound, and web calls in 10 Indian languages plus English, live 24/7. On the global voices it also handles 76 more, from French to Japanese.',
  },
  {
    q: 'Do I need to write code to set it up?',
    a: 'No - build an agent with a no-code editor: persona, prompt, voice, and language, then publish. Most teams are live in under an hour.',
  },
  {
    q: 'Which languages does Artha speak?',
    a: 'Hindi, Marathi, Tamil, Telugu, Kannada, Malayalam, Gujarati, Bengali, Punjabi, and Odia - plus English and everyday code-switching such as Hinglish. The global voices add 76 more, including French, German, Spanish, Arabic and Japanese.',
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
const HOME_JSONLD = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Vistrow Voice',
    url: 'https://www.vistrowvoice.com/',
    logo: 'https://www.vistrowvoice.com/apple-touch-icon.png',
    sameAs: ['https://vistrow.com/'],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Vistrow Voice',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description:
      'AI voice agents that answer, qualify, and book customer calls in 10 Indian languages plus English - inbound, outbound, and web calls, live 24/7.',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  },
]

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
    glyph: '😤',
    title: 'It knows “bakwas” means trouble',
    body: 'Frustration in an Indian call rarely arrives in textbook English. Artha reads the cues people actually use - bekaar, faltu, bakwas - and softens its tone before the caller escalates.',
  },
  {
    glyph: '🎭',
    title: 'A voice that reacts, not just replies',
    body: 'Built by an Indian team, tuned for Indian callers: Artha reads frustration, confusion, or excitement in your caller’s voice and shifts its own pace and warmth to match - live, mid-call, not a flat text-to-speech read.',
  },
]

function SectionEyebrow({ children }: { children: string }) {
  return (
    <span className="text-xs font-bold uppercase tracking-widest text-cyan">{children}</span>
  )
}

export function Home() {
  const [openFaq, setOpenFaq] = useState<number | null>(0)
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
        title="Multilingual AI Voice Agents | Vistrow Voice"
        description="Artha answers, qualifies, and books appointments in 10 Indian languages plus English, across inbound, outbound, and web conversations - 24/7."
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
        <span>We're open for your feedback — try Artha and help us build voice AI for Bharat</span>
        <Icon name="arrow_forward" className="text-[16px]" />
      </button>
      {/* ---------- Hero ---------- */}
      <section className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-5 py-14 md:px-8 lg:grid-cols-2 lg:py-24">
        <div>
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
          <h1 className="mt-5 font-display text-4xl font-bold leading-[1.06] tracking-tight sm:text-5xl lg:text-6xl">
            <RotatingGreeting className="block min-h-[1.1em]" />
            <span className="mt-1 block">Voice AI built for</span>
            <span className="block bg-gradient-to-r from-primary to-magenta bg-clip-text text-transparent">
              how India actually speaks.
            </span>
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-text-muted sm:mt-6 sm:text-lg sm:leading-relaxed">
            Answer, qualify, and book customers across phone and web in 10 Indian languages plus English—and 76 more worldwide—with
            natural Hinglish and mid-sentence language switching.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <TalkToArthaButton />
            <Link
              to="/contact"
              className="rounded-full border border-border px-6 py-3 text-sm font-bold text-text transition-colors hover:border-primary"
            >
              Book a demo
            </Link>
          </div>
          <div className="mt-10 grid grid-cols-3 gap-4 border-t border-border pt-6 sm:gap-8">
            {HERO_STATS.map((stat) => (
              <div key={stat.label}>
                <p className="font-display text-2xl font-bold text-text">{stat.value}</p>
                <p className="text-xs uppercase tracking-wider text-text-muted">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <DemoOrbCard spotlight={demoSpotlight} />
        </div>
      </section>

      {/* Sits in the slot the old "Trusted by fast-growing Indian businesses"
          strip occupied. That line was an unsubstantiated claim with no logos
          behind it; this says something true instead - every script shown is
          a language the product genuinely speaks. */}
      <ScriptMarquee />

      <section className="mx-auto max-w-7xl px-5 py-16 md:px-8">
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-2xl border border-border bg-surface p-7">
            <SectionEyebrow>Hear the difference</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Language switching without restarting the call.</h2>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">Artha follows the caller naturally instead of forcing a language menu or a separate agent.</p>
            <a href="#live-demo" className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">Try it live <Icon name="arrow_forward" className="text-[16px]" /></a>
          </div>
          <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-surface p-7" aria-label="Example multilingual conversation">
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
        </div>
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
          {BHARAT_POINTS.map((point, i) => (
            <Reveal key={point.title} delayMs={i * 70} className="h-full">
              <div className="vv-lift group h-full rounded-2xl border border-border bg-surface p-7">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-display text-lg font-semibold">{point.title}</h3>
                  <span
                    aria-hidden="true"
                    className="shrink-0 font-display text-2xl text-text-muted transition-colors group-hover:text-primary"
                  >
                    {point.glyph}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-text-muted">{point.body}</p>
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
            <div className="vv-lift group relative h-full overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-surface to-surface p-7">
              <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="md:max-w-md">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-display text-lg font-semibold">Ten Indian languages plus 76 more, one agent</h3>
                    <span
                      aria-hidden="true"
                      className="shrink-0 font-display text-2xl text-text-muted transition-colors group-hover:text-primary md:hidden"
                    >
                      अ अ अ
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-text-muted">
                    From Punjabi in the north to Malayalam in the south, one agent covers them all - no
                    separate deployment, no per-language rebuild, no region left on an English-only fallback.
                  </p>
                  <Link
                    to="/languages"
                    className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
                  >
                    See every language
                    <Icon name="arrow_forward" className="text-[16px]" />
                  </Link>
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
                  {/* The Indian languages are the product's centre of gravity,
                      so they lead; these few say "and it does not stop there"
                      without turning the strip into a directory. */}
                  {GLOBAL_GREETINGS.map((g) => (
                    <li
                      key={g.name}
                      className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 font-display text-sm text-text-muted transition-colors group-hover:border-primary/50 group-hover:text-text"
                    >
                      {g.greeting}
                    </li>
                  ))}
                  <li className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 font-display text-sm font-semibold text-primary">
                    +76 more
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
      <div className="border-y border-border bg-surface-high/40">
      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <Reveal>
          <div className="mb-12 text-center">
            <SectionEyebrow>How it works</SectionEyebrow>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">Live in minutes, not months.</h2>
          </div>
        </Reveal>
        {/* The connecting rail turns three separate boxes into one sequence -
            the numbers already imply order, but nothing was drawing the eye
            along it. Desktop only: stacked on mobile, a horizontal rail would
            point nowhere. */}
        <div className="relative grid gap-6 md:grid-cols-3">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-0 right-0 top-[52px] hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block"
          />
          {HOW_IT_WORKS.map((step, i) => (
            <Reveal key={step.title} delayMs={i * 90} className="h-full">
              <div className="vv-lift relative h-full rounded-2xl border border-border bg-surface p-7">
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-high text-primary">
                    <Icon name={step.icon} className="text-[22px]" />
                  </span>
                  <span className="font-display text-3xl font-bold text-border">{`0${i + 1}`}</span>
                </div>
                <h3 className="mt-5 font-display text-xl font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
      </div>

      {/* ---------- Features grid ---------- */}
      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <Reveal>
          <div className="mb-12 text-center">
            <SectionEyebrow>The platform</SectionEyebrow>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">
              One platform for every voice conversation.
            </h2>
          </div>
        </Reveal>
        {/* Swipeable rail on phones, grid from sm up. Six full-width cards
            stacked vertically is a long scroll past near-identical boxes;
            a snap rail makes the set feel browsable and keeps the section a
            fixed height. -mx-5/px-5 lets cards bleed to the screen edge so
            the rail reads as scrollable instead of looking clipped. */}
        <div className="vv-rail -mx-5 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
          {HOME_FEATURES.map((f, i) => (
            <Reveal key={f.to} delayMs={i * 60} className="w-[78%] shrink-0 snap-start sm:w-auto sm:shrink">
              <Link
                to={f.to}
                className="vv-lift group flex h-full flex-col rounded-2xl border border-border bg-surface p-6"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary transition-transform group-hover:scale-110">
                  <Icon name={f.icon ?? 'circle'} className="text-[22px]" />
                </span>
                <h3 className="mt-5 flex items-center gap-1 font-display text-lg font-semibold">
                  {f.label}
                  <Icon
                    name="arrow_forward"
                    className="text-[16px] text-text-muted transition-transform group-hover:translate-x-1 group-hover:text-primary"
                  />
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{f.desc}</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- Solutions preview ---------- */}
      <div className="border-y border-border bg-surface-high/40">
      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <Reveal>
          <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
            <div>
              <SectionEyebrow>Solutions</SectionEyebrow>
              <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">Built for your industry.</h2>
            </div>
            <Link to="/solutions" className="text-sm font-semibold text-primary hover:underline">
              All industries →
            </Link>
          </div>
        </Reveal>
        {/* Five cards in a 3-column grid left two dead slots. Promoting the
            first vertical to a 2-column feature card fills the row exactly
            (2 + 1, then 3) AND puts real weight behind the industry these
            customers actually come from, instead of five interchangeable
            tiles. Same snap rail as the platform grid on phones. */}
        <div className="vv-rail -mx-5 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
          {SOLUTIONS.map((s, i) => (
            <Reveal
              key={s.to}
              delayMs={i * 60}
              className={`w-[78%] shrink-0 snap-start sm:w-auto sm:shrink ${i === 0 ? 'lg:col-span-2' : ''}`}
            >
              <Link
                to={s.to}
                className={`vv-lift group flex h-full flex-col justify-between rounded-2xl border border-border p-6 ${
                  i === 0 ? 'bg-gradient-to-br from-cyan/10 via-surface to-surface' : 'bg-surface'
                }`}
              >
                <div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-high text-cyan transition-transform group-hover:scale-110">
                    <Icon name={s.icon ?? 'circle'} className="text-[22px]" />
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
      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <Reveal>
          <div className="mb-12 text-center">
            <SectionEyebrow>Public beta</SectionEyebrow>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">Try the product before pricing is finalized.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-text-muted">Public testers get access to the complete multilingual voice platform and help shape the introductory plans.</p>
          </div>
        </Reveal>
        <div className="grid gap-5 md:grid-cols-3">
          {[
            ['mic', 'Live voice and chat', 'Test real conversations in the browser, by phone, or through your website.'],
            ['translate', '10 Indian languages + 76 global', 'One agent handles natural code-switching without separate language deployments.'],
            ['analytics', 'Calls, transcripts and feedback', 'Review outcomes, recordings, ratings, and operational analytics in one dashboard.'],
          ].map(([icon, title, body], i) => (
            <Reveal key={title} delayMs={i * 70} className="h-full">
              <div className="vv-lift h-full rounded-2xl border border-border bg-surface p-7">
                <Icon name={icon} className="text-[24px] text-primary" />
                <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/signup" className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-white hover:opacity-90">Join public beta</Link>
          <Link to="/contact" className="rounded-full border border-border px-6 py-3 text-sm font-bold hover:border-primary">Talk to us about volume</Link>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="mx-auto max-w-3xl px-5 py-20 md:px-8">
        <Reveal>
          <div className="mb-10 text-center">
            <SectionEyebrow>FAQ</SectionEyebrow>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">Questions, answered.</h2>
          </div>
        </Reveal>
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
              {openFaq === i && <p className="px-6 pb-5 text-sm leading-relaxed text-text-muted">{item.a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-surface to-surface-high p-10 text-center sm:p-16">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-[100px]" />
          <h2 className="relative font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Put an AI agent on every call.
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lg text-text-muted">
            Try Artha live in your browser, or book a walkthrough with our team.
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <TalkToArthaButton />
            <Link
              to="/contact"
              className="rounded-full border border-border px-6 py-3 text-sm font-bold text-text transition-colors hover:border-primary"
            >
              Book a demo
            </Link>
          </div>
        </div>
        </Reveal>
      </section>
    </MarketingLayout>
  )
}
