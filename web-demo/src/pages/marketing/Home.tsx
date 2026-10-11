import { useEffect, useRef, useState } from 'react'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { LaunchFilm } from '../../components/LaunchFilm'
import { Seo } from '../../components/Seo'
import { ScriptMarquee } from '../../components/BharatBits'
import { Reveal } from '../../components/Reveal'
import { SignalHero } from '../../components/SignalHero'
import { HowItWorksStory } from '../../components/HowItWorksStory'
import { BharatBento, LiveCallShowcase, PlatformBento, SignalClose, SignalEyebrow } from '../../components/SignalSections'
import { HOW_IT_WORKS } from '../../lib/marketingContent'

const FAQ = [
  {
    q: 'What is Vistrow Voice?',
    a: 'An AI voice-agent platform for Indian businesses - Artha answers, qualifies, and books inbound, outbound, and web calls in 99 languages, live 24/7: 10 Indian languages, English, and 88 more from French to Japanese.',
  },
  {
    q: 'Do I need to write code to set it up?',
    a: 'No - build an agent with a no-code editor: persona, prompt, voice, and language, then publish. Most teams are live in under an hour.',
  },
  {
    q: 'Which languages does Artha speak?',
    a: 'Hindi, Marathi, Tamil, Telugu, Kannada, Malayalam, Gujarati, Bengali, Punjabi, and Odia - plus English and everyday code-switching such as Hinglish. The same agent handles 88 more, including French, German, Spanish, Arabic and Japanese.',
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
// having to scrape the accordion markup. Organization, WebSite and
// SoftwareApplication identities come from the central SEO registry.
const HOME_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
}

/** A light band inside the dark page: the theme's light tokens scoped to this block. */
function LightBand({ children }: { children: React.ReactNode }) {
  return <div className="theme-signal-light bg-bg text-text">{children}</div>
}

// The homepage in the "Signal" theme (index.css .theme-signal): dark stage, the logo
// gradient as the identity, the live demo orb as the hero object.
export function Home() {
  const [demoSpotlight, setDemoSpotlight] = useState(false)
  const spotlightTimer = useRef<number | null>(null)

  const guideToDemo = () => {
    document.getElementById('live-demo')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setDemoSpotlight(false)
    window.requestAnimationFrame(() => setDemoSpotlight(true))
    if (spotlightTimer.current) window.clearTimeout(spotlightTimer.current)
    spotlightTimer.current = window.setTimeout(() => setDemoSpotlight(false), 5200)
  }
  // Reached via TalkToArthaButton's fallback (navigate('/#live-demo')) from a
  // page with no on-page demo widget - React Router doesn't scroll to hashes
  // on route change, so we finish the job once the hero mounts.
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
    <MarketingLayout signal>
      <Seo
        title="Multilingual AI Voice Agents | Vistrow Voice"
        description="Artha answers, qualifies, and books appointments in 10 Indian languages plus English, across inbound, outbound, and web conversations - 24/7."
        path="/"
        jsonLd={HOME_JSONLD}
      />

      <SignalHero spotlight={demoSpotlight} />

      {/* Every script shown is a language the product genuinely speaks. */}
      <ScriptMarquee />

      <LiveCallShowcase />

      <LightBand>
        <LaunchFilm />
      </LightBand>

      <BharatBento />

      <LightBand>
        <section className="mx-auto max-w-7xl px-5 py-20 md:px-8 lg:py-28">
          <Reveal>
            <div className="mb-12 text-center">
              <SignalEyebrow>How it works</SignalEyebrow>
              <h2 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">Live in minutes, not months.</h2>
            </div>
          </Reveal>
          {/* A scroll story: the product screen stays pinned and changes per step (HowItWorksStory). */}
          <HowItWorksStory steps={HOW_IT_WORKS} />
        </section>
      </LightBand>

      <PlatformBento />

      <FaqSection items={FAQ} />

      <SignalClose />
    </MarketingLayout>
  )
}
