import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Icon3D } from '../../components/Icon3D'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout, NavLink } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { trackMarketingCta } from '../../lib/analytics'
import { PLANS, SHARED_PLAN_FEATURES, planHighlights } from '../../lib/plans'
import {
  FeatureList,
  ObjectionCards,
  Reveal,
  RiskReducers,
  SectionHead,
  SplitHero,
  SplitRow,
  StickyCta,
  useStickyRefs,
} from '../../components/showcase'
import { PRICING_CREDITS, PRICING_HERO } from './premium-w5/visuals'

const FAQ = [
  {
    q: 'How much does it cost?',
    a: 'We share pricing on request while plans are being finalised. Usage is measured in minutes of conversation, and the voice and model you choose change how quickly minutes are used. Telephony is billed separately by whichever provider you connect. Talk to us and we will quote for your call volume.',
  },
  {
    q: 'Which languages are supported?',
    a: 'Artha speaks more than 130 languages, including Hindi, Tamil, Telugu, Bengali, Marathi, and Odia - switching mid-call to match the caller.',
  },
  {
    q: 'Can I bring my own phone number?',
    a: 'You can use a compatible provider and number after we confirm the connection setup. Carrier usage and number rental are separate from your plan. The web call widget needs no phone number.',
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

const LINK = 'font-semibold text-primary hover:underline'

// Premium template (showcase kit): split hero with the Usage page, the plan
// cards, the estimate guide beside the minutes-to-credits visual, buyer
// objections, FAQ and the custom-plan band. Plan copy comes from plans.ts
// unchanged.
export function Pricing() {
  const { heroCtaRef, endRef } = useStickyRefs()

  return (
    <MarketingLayout>
      <Seo
        title="Pricing - Vistrow Voice"
        description="Starter, Growth and Scale plans for AI voice agents. Every plan includes the web call widget and call history. Talk to us for pricing that fits your call volume."
        path="/pricing"
        jsonLd={FAQ_JSONLD}
      />
      <SplitHero
        eyebrow="Pricing"
        title="Choose the plan for your business."
        subhead="Start with one knowledgeable agent. Add campaign automation, integrations, and API access as you grow."
        visual={PRICING_HERO}
        chips={[
          { label: 'Plan minutes by day', live: true },
          { label: 'By channel, agent and voice', icon: 'monitoring' },
        ]}
        placement="pricing_hero"
        trust={
          <>
            <p className="mt-5 max-w-xl text-sm text-text-muted">
              All plans include voice conversations, your website widget, and call insights. Choose the agent capacity and automation your team needs.
            </p>
            <RiskReducers className="mt-4" />
          </>
        }
        ctaRef={heroCtaRef}
      />

      <section className="mx-auto max-w-7xl px-5 pb-8 pt-6 md:px-8">
        <div className="grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.key} delayMs={i * 70} className="h-full">
              <div
                className={`vv-lift relative flex h-full flex-col overflow-hidden rounded-3xl border p-7 ${
                  plan.key === 'growth'
                    ? 'border-primary/40 bg-gradient-to-br from-primary/[0.12] via-surface to-surface shadow-[0_30px_60px_-40px_rgba(76,29,149,0.6)]'
                    : 'border-border bg-surface'
                }`}
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                    plan.key === 'growth' ? 'bg-gradient-to-br from-primary to-magenta text-white' : 'bg-primary/12 text-primary'
                  }`}
                >
                  <Icon3D
                    name={plan.key === 'starter' ? 'person' : plan.key === 'growth' ? 'groups' : 'apartment'}
                    size={plan.key === 'growth' ? 32 : 36}
                    plate={plan.key === 'growth'}
                    className="text-[22px]"
                  />
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold">{plan.name}</h3>
                <p className="mt-3 text-sm font-semibold text-cyan">Pricing on request</p>
                <p className="mt-2 text-sm text-text-muted">{plan.description}</p>
                <ul className="mt-6 flex flex-1 flex-col gap-2.5 border-t border-border pt-5">
                  {planHighlights(plan).map((feat) => <li key={feat} className="flex items-start gap-2 text-sm text-text-muted"><Icon name="check_circle" className="mt-0.5 text-[16px] text-cyan" />{feat}</li>)}
                </ul>
                <p className="mt-5 text-xs text-text-muted">{plan.key === 'starter' ? 'Need campaigns, CRM integration, or a live catalog? Choose Growth.' : plan.key === 'growth' ? 'Need API access or premium voices? Choose Scale.' : 'Need more agents or capacity? Talk to us about a custom plan.'}</p>
                <NavLink
                  to="/contact"
                  onClick={() => trackMarketingCta('talk_to_sales', `pricing_plan_${plan.key}`)}
                  className={`mt-6 rounded-full px-5 py-3 text-center text-sm font-bold transition-transform hover:-translate-y-0.5 ${
                    plan.key === 'growth'
                      ? 'bg-gradient-to-br from-primary to-primary-dark text-white shadow-[0_14px_36px_-14px_rgba(147,51,234,0.8)]'
                      : 'border border-primary text-primary'
                  }`}
                >
                  Talk to us for pricing
                </NavLink>
              </div>
            </Reveal>
          ))}
        </div>
        <details className="mt-6 rounded-3xl border border-border bg-surface p-6">
          <summary className="cursor-pointer font-semibold">Included in every plan</summary>
          <ul className="mt-4 grid gap-3 text-sm text-text-muted sm:grid-cols-2 sm:grid-close-2">
            {SHARED_PLAN_FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <Icon name="check_circle" className="mt-0.5 shrink-0 text-[16px] text-cyan" />
                {feature}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-text-muted">Basic inbound calling requires a configured, supported number. Advanced inbound routing and outbound campaigns require Growth or Scale. Telephony is billed separately.</p>
        </details>
        <p className="mt-5 text-center text-sm text-text-muted">We share pricing on request while plans are being finalised. Telephony is billed separately by your provider.</p>
        <p className="mt-3 text-center text-sm text-text-muted">Not sure which plan fits? Our team can help estimate your usage and arrange setup.</p>
      </section>

      {/* The estimate guide beside the minutes-to-credits visual. */}
      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
        <SplitRow figure={PRICING_CREDITS} className="">
          <Reveal>
            <SectionHead
              eyebrow="Estimate your plan"
              title="Work out what you need"
              intro="Share these three things with us and we will recommend a plan and quote for your call volume."
            />
          </Reveal>
          <FeatureList
            items={[
              {
                icon: 'call',
                title: 'Start from your call volume',
                body: (
                  <>
                    Multiply the calls you expect each month by their average length. A short enquiry that ends in a
                    booking might take two or three minutes; a qualification call with several questions takes longer.
                    Your own{' '}
                    <Link to="/help/calls/find-a-call" className={LINK}>call history</Link>{' '}
                    shows real durations once the agent is live.
                  </>
                ),
              },
              {
                icon: 'tune',
                title: 'Check capacity as well as minutes',
                body: (
                  <>
                    Plans also differ in the number of agents, concurrent calls and features such as{' '}
                    <Link to="/product/outbound" className={LINK}>outbound campaigns</Link>,{' '}
                    <Link to="/product/integrations" className={LINK}>CRM integrations</Link>{' '}
                    and API access. A team that only needs a{' '}
                    <Link to="/product/widget" className={LINK}>website voice widget</Link>{' '}
                    has different needs from one running follow-up calls.
                  </>
                ),
              },
              {
                icon: 'receipt_long',
                title: 'Remember the other costs',
                body: (
                  <>
                    Telephony (number rental and carrier minutes) is billed by your provider, and GST applies to plan
                    prices. The{' '}
                    <Link to="/ai-voice-bot-pricing-india" className={LINK}>voice bot pricing guide</Link>{' '}
                    and the article on{' '}
                    <Link to="/resources/blog/ai-voice-agent-pricing-india" className={LINK}>estimating AI voice agent cost</Link>{' '}
                    walk through a full budget. The help centre explains{' '}
                    <Link to="/help/billing/how-credits-work" className={LINK}>how credits are counted</Link>.
                  </>
                ),
              },
            ]}
          />
        </SplitRow>
      </section>

      <ObjectionCards route="/pricing" placement="pricing_objections" />

      {/* FAQ */}
      <FaqSection items={FAQ} />

      <div ref={endRef} />
      <section className="px-5 pb-20 md:px-8">
        <div className="bento-hero relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] px-6 py-12 text-center sm:px-10 lg:py-14">
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-cyan/25 blur-[100px]" />
          <span className="relative text-xs font-bold uppercase tracking-widest text-white/75">Custom plans</span>
          <h2 className="relative mt-3 font-display text-3xl font-bold text-white">Need something custom?</h2>
          <p className="relative mx-auto mt-2 max-w-md text-white/80">
            Discuss higher call volumes, supported telephony connections, and an agreed support scope.
          </p>
          <NavLink
            to="/contact"
            onClick={() => trackMarketingCta('talk_to_sales', 'pricing_custom')}
            className="relative mt-6 inline-block rounded-full bg-white px-6 py-3 text-sm font-bold text-[#4c1d95] transition-transform hover:-translate-y-0.5"
          >
            Talk to sales
          </NavLink>
        </div>
      </section>
      <StickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </MarketingLayout>
  )
}
