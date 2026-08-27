import { Icon } from '../../components/Icon'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout, NavLink } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { SectionEyebrow } from '../../components/MarketingBits'

const FAQ = [
  {
    q: 'What is a credit?',
    a: 'At the default rate, browser and phone calls both use 1 credit per minute — telephony is billed separately by whichever provider you connect. Economy, standard, and premium voice tiers apply 0.75×, 1×, and 2× multipliers, and the LLM you pick applies its own. Both channels draw from the same monthly pool.',
  },
  {
    q: 'Which languages are supported?',
    a: 'Artha speaks 10 Indian languages plus English, including Hindi, Tamil, Telugu, Bengali, Marathi, and Odia - switching mid-call to match the caller.',
  },
  {
    q: 'Can I bring my own phone number?',
    a: 'Yes. Point your existing number at Vistrow for inbound, or get one from us. The web call widget needs no number at all.',
  },
  {
    q: 'Is there a free way to try it?',
    a: 'Yes - talk to Artha live in your browser right now, no signup or credit card required.',
  },
]

// Answer-engine-friendly (AEO/GEO): FAQPage structured data lets Google,
// Bing, and LLM-based answer engines quote these Q&As directly instead of
// having to scrape the accordion markup.
const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
}

export function Pricing() {

  return (
    <MarketingLayout>
      <Seo
        title="Pricing - Vistrow Voice"
        description="Credit-based plans for AI voice agents. Every plan includes the web call widget, call history, and analytics - scale up as your call volume grows."
        path="/pricing"
        jsonLd={FAQ_JSONLD}
      />
      <section className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8 lg:py-20">
        <SectionEyebrow>Pricing</SectionEyebrow>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
          Public beta access is open.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-text-muted">
          Test the complete voice platform, share feedback, and help shape the introductory plans before launch.
        </p>
        <p className="mx-auto mt-3 max-w-xl text-sm text-text-muted">
          No public price is being advertised until the introductory rates are finalized.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-8 md:px-8">
        <div className="grid gap-5 lg:grid-cols-3">
          {[
            ['Voice + chat', ['Inbound and outbound calling', 'Embeddable website widget', 'Natural language switching']],
            ['Operate confidently', ['Call history and transcripts', 'Visitor feedback and analytics', 'Agent and provider readiness']],
            ['Scale when ready', ['Shared credit usage', 'CRM and webhook integrations', 'Volume planning with our team']],
          ].map(([title, features]) => (
            <div key={title as string} className="flex flex-col rounded-2xl border border-border bg-surface p-7">
              <h3 className="font-display text-lg font-semibold">{title as string}</h3>
              <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                {(features as string[]).map((feat) => <li key={feat} className="flex items-start gap-2 text-sm text-text-muted"><Icon name="check_circle" className="mt-0.5 text-[16px] text-cyan" />{feat}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3"><NavLink to="/signup" className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-white">Join public beta</NavLink><NavLink to="/contact" className="rounded-full border border-border px-6 py-3 text-sm font-bold">Discuss call volume</NavLink></div>
      </section>

      {/* FAQ */}
      <FaqSection items={FAQ} />

      <section className="mx-auto max-w-7xl px-5 pb-20 md:px-8">
        <div className="rounded-3xl border border-border bg-surface p-10 text-center">
          <h2 className="font-display text-2xl font-bold">Need something custom?</h2>
          <p className="mx-auto mt-2 max-w-md text-text-muted">
            High call volumes, on-prem, or a dedicated success manager - let’s talk.
          </p>
          <NavLink
            to="/contact"
            className="mt-6 inline-block rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            Talk to sales
          </NavLink>
        </div>
      </section>
    </MarketingLayout>
  )
}
