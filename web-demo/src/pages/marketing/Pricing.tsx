import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout, NavLink } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { SectionEyebrow } from '../../components/MarketingBits'
import { trackMarketingCta } from '../../lib/analytics'
import { SEO_ORIGIN } from '../../lib/seoPages'
import {
  ANNUAL_MONTHS_PAID,
  LIVE_MINUTE_MULTIPLIER,
  MINUTE_PLANS,
  PLANS,
  SHARED_PLAN_FEATURES,
  planHighlights,
  type MinutePlan,
} from '../../lib/plans'

type Billing = 'monthly' | 'annual'

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const num = (n: number) => n.toLocaleString('en-IN')
const perMonth = (plan: MinutePlan) => Math.round(plan.annualPriceInr / 12)
const ratePerMinute = (plan: MinutePlan, billing: Billing) =>
  billing === 'monthly'
    ? plan.monthlyPriceInr / plan.monthlyMinutes
    : plan.annualPriceInr / (plan.annualMinutesPerMonth * 12)

const PLAN_ROWS = PLANS.map((plan) => ({ plan, minutes: MINUTE_PLANS.find((m) => m.key === plan.key)! }))
const [starter, growth, scale] = MINUTE_PLANS

const FAQ = [
  {
    q: 'Why are plans in minutes and not credits?',
    a: 'Minutes are easier to plan with. The number on each plan is the conversation time you get each month, so you can compare it straight with your call volume.',
  },
  {
    q: 'What counts as a minute?',
    a: `Time your agent spends in conversation, on phone calls and on your website widget alike. Every standard voice uses 1 plan minute per minute of conversation: Vistrow Bharat, Native and HD voices, and cloned voices when they launch. Vistrow Live, our realtime voice, uses ${LIVE_MINUTE_MULTIPLIER} plan minutes per minute.`,
  },
  {
    q: 'What happens if I use more minutes than my plan includes?',
    a: `Extra minutes are charged at ${inr(starter.overageInr)} a minute on Starter, ${inr(growth.overageInr)} on Growth and ${inr(scale.overageInr)} on Scale.`,
  },
  {
    q: 'How does annual billing work?',
    a: `You pay for the year upfront at the price of ${ANNUAL_MONTHS_PAID} months, so one month is free. Each month of an annual plan also includes more minutes than the monthly plan: ${num(starter.annualMinutesPerMonth)}, ${num(growth.annualMinutesPerMonth)} and ${num(scale.annualMinutesPerMonth)} for Starter, Growth and Scale.`,
  },
  {
    q: 'When can I use a cloned voice?',
    a: `Cloned voices are coming soon. Once they launch, Growth includes ${growth.clonedVoices} and Scale includes ${scale.clonedVoices}, and a cloned voice counts the same as any standard voice: 1 plan minute per minute.`,
  },
  {
    q: 'Which languages are supported?',
    a: 'Artha speaks 10 Indian languages plus English, including Hindi, Tamil, Telugu, Bengali, Marathi, and Odia, switching mid-call to match the caller.',
  },
  {
    q: 'Can I bring my own phone number?',
    a: 'Yes. You connect your own numbers through a compatible telephony provider after we confirm the setup. Phone line charges and number rental are billed by your provider, separately from your plan. The web call widget needs no phone number.',
  },
  {
    q: 'Is there a free way to try it?',
    a: 'Yes. Talk to Artha live in your browser right now, no signup or credit card required.',
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

// One Offer per plan and billing period. Prices exclude GST, so
// valueAddedTaxIncluded is false on every price specification.
const PRODUCT_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Vistrow Voice',
  description: 'AI voice agents for phone calls and website conversations, sold as monthly or annual plans with included conversation minutes.',
  brand: { '@type': 'Brand', name: 'Vistrow Voice' },
  url: `${SEO_ORIGIN}/pricing`,
  offers: PLAN_ROWS.flatMap(({ plan, minutes }) => [
    {
      '@type': 'Offer',
      name: `${plan.name} monthly: ${num(minutes.monthlyMinutes)} minutes a month`,
      url: `${SEO_ORIGIN}/pricing`,
      price: String(minutes.monthlyPriceInr),
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: String(minutes.monthlyPriceInr),
        priceCurrency: 'INR',
        valueAddedTaxIncluded: false,
        referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' },
      },
    },
    {
      '@type': 'Offer',
      name: `${plan.name} annual: ${num(minutes.annualMinutesPerMonth)} minutes a month, billed yearly`,
      url: `${SEO_ORIGIN}/pricing`,
      price: String(minutes.annualPriceInr),
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: String(minutes.annualPriceInr),
        priceCurrency: 'INR',
        valueAddedTaxIncluded: false,
        referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'ANN' },
      },
    },
  ]),
}

const NEXT_STEP: Record<string, string> = {
  starter: 'Need campaigns, CRM integration, or a live catalog? Choose Growth.',
  growth: 'Need API access or premium voices? Choose Scale.',
  scale: 'Need more agents or capacity? Talk to us about a custom plan.',
}

export function Pricing() {
  const [billing, setBilling] = useState<Billing>('monthly')
  const annual = billing === 'annual'

  return (
    <MarketingLayout>
      <Seo
        title="Pricing - Vistrow Voice"
        description="Minute-based plans for AI voice agents, billed monthly or yearly. Every plan includes the web call widget, call history, and analytics."
        path="/pricing"
        jsonLd={[PRODUCT_JSONLD, FAQ_JSONLD]}
      />
      <section className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8 lg:py-20">
        <SectionEyebrow>Pricing</SectionEyebrow>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
          Choose the plan for your business.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-text-muted">
          Every plan comes with a set number of conversation minutes each month. Pick the one that matches your call volume.
        </p>
        <p className="mx-auto mt-3 max-w-xl text-sm text-text-muted">
          All plans include voice conversations, your website widget, and call insights. Higher plans add agents, campaigns, and integrations.
        </p>

        <div role="group" aria-label="Billing period" className="mt-8 inline-flex rounded-full border border-border bg-surface p-1">
          {(['monthly', 'annual'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={billing === option}
              onClick={() => setBilling(option)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${billing === option ? 'bg-primary text-white' : 'text-text-muted hover:text-text'}`}
            >
              {option === 'monthly' ? 'Monthly' : 'Annual'}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-text-muted" aria-live="polite">
          {annual ? 'Billed yearly upfront. 1 month free and more minutes every month.' : 'Billed monthly. Switch to annual for 1 month free and more minutes.'}
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-8 md:px-8">
        <div className="grid gap-5 lg:grid-cols-3">
          {PLAN_ROWS.map(({ plan, minutes }) => (
            <div key={plan.key} className="flex flex-col rounded-2xl border border-border bg-surface p-7">
              <h3 className="font-display text-lg font-semibold">{plan.name}</h3>
              <p className="mt-4 font-display text-4xl font-bold text-cyan">
                {num(annual ? minutes.annualMinutesPerMonth : minutes.monthlyMinutes)}
                <span className="text-base font-semibold text-text"> minutes / month</span>
              </p>
              {annual ? (
                <>
                  <p className="mt-3 text-2xl font-bold">
                    {inr(perMonth(minutes))}<span className="text-sm font-normal text-text-muted"> / month</span>
                  </p>
                  <p className="mt-1 text-sm text-text-muted">Billed {inr(minutes.annualPriceInr)} a year</p>
                  <p className="mt-2 text-xs font-semibold text-primary">1 month free + more minutes</p>
                </>
              ) : (
                <p className="mt-3 text-2xl font-bold">
                  {inr(minutes.monthlyPriceInr)}<span className="text-sm font-normal text-text-muted"> / month</span>
                </p>
              )}
              <p className="mt-2 text-xs text-text-muted">
                About ₹{ratePerMinute(minutes, billing).toFixed(2)} a minute. Extra minutes {inr(minutes.overageInr)} each.
              </p>
              <p className="mt-4 text-sm text-text-muted">{plan.description}</p>
              <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                <li className="flex items-start gap-2 text-sm text-text-muted">
                  <Icon name={minutes.clonedVoices ? 'check_circle' : 'lock'} className={`mt-0.5 text-[16px] ${minutes.clonedVoices ? 'text-cyan' : 'text-text-muted'}`} />
                  <span>
                    {minutes.clonedVoices
                      ? `${minutes.clonedVoices} cloned ${minutes.clonedVoices === 1 ? 'voice' : 'voices'}: your voice, on every call`
                      : 'No cloned voices on Starter'}
                    {minutes.clonedVoices > 0 && (
                      <span className="ml-2 inline-block rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">Coming soon</span>
                    )}
                  </span>
                </li>
                {planHighlights(plan).map((feat) => <li key={feat} className="flex items-start gap-2 text-sm text-text-muted"><Icon name="check_circle" className="mt-0.5 text-[16px] text-cyan" />{feat}</li>)}
              </ul>
              <p className="mt-5 text-xs text-text-muted">{NEXT_STEP[plan.key]}</p>
              <NavLink
                to="/contact"
                onClick={() => trackMarketingCta('talk_to_sales', `pricing_plan_${plan.key}_${billing}`)}
                className="mt-6 rounded-full border border-primary px-5 py-3 text-center text-sm font-bold text-primary"
              >
                Discuss {plan.name}
              </NavLink>
            </div>
          ))}
        </div>
        <details className="mt-6 rounded-2xl border border-border bg-surface p-6">
          <summary className="cursor-pointer font-semibold">Included in every plan</summary>
          <ul className="mt-4 grid gap-3 text-sm text-text-muted sm:grid-cols-2">
            {SHARED_PLAN_FEATURES.map((feature) => <li key={feature}>{feature}</li>)}
          </ul>
          <p className="mt-4 text-sm text-text-muted">Basic inbound calling requires a configured, supported number. Advanced inbound routing and outbound campaigns require Growth or Scale.</p>
        </details>
        <p className="mt-5 text-center text-sm text-text-muted">
          Prices are in INR and exclude GST. Every standard voice uses 1 plan minute per minute; Vistrow Live uses {LIVE_MINUTE_MULTIPLIER}.
        </p>
        <p className="mt-2 text-center text-sm text-text-muted">Phone line charges from your telephony provider are separate.</p>
        <p className="mt-3 text-center text-sm text-text-muted">Not sure which plan fits? Our team can help estimate your usage and arrange setup.</p>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8">
        <SectionEyebrow>Estimate your plan</SectionEyebrow>
        <h2 className="mt-3 max-w-2xl font-display text-2xl font-bold sm:text-3xl">How far a month of minutes goes</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-muted">
          A standard voice uses one plan minute for each minute of conversation. Vistrow Live, the realtime voice, uses
          {' '}{LIVE_MINUTE_MULTIPLIER}. The table shows the conversation time each plan gives you with each. It is arithmetic,
          not a promise of results: leave room for test calls.
        </p>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Standard voices, per month</th>
                <th className="px-4 py-3 font-semibold">Vistrow Live, per month</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_ROWS.map(({ plan, minutes }) => {
                const m = annual ? minutes.annualMinutesPerMonth : minutes.monthlyMinutes
                return (
                  <tr key={plan.key} className="border-t border-border">
                    <td className="px-4 py-3 font-semibold">{plan.name} <span className="font-normal text-text-muted">({annual ? 'annual' : 'monthly'})</span></td>
                    <td className="px-4 py-3 text-text-muted">{num(m)} minutes</td>
                    <td className="px-4 py-3 text-text-muted">about {num(Math.floor(m / LIVE_MINUTE_MULTIPLIER))} minutes</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <div>
            <h3 className="font-display text-base font-semibold">Start from your call volume</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              Multiply the calls you expect each month by their average length. A short enquiry that ends in a
              booking might take two or three minutes; a qualification call with several questions takes longer.
              Your own{' '}
              <Link to="/help/calls/find-a-call" className="font-semibold text-primary hover:underline">call history</Link>{' '}
              shows real durations once the agent is live.
            </p>
          </div>
          <div>
            <h3 className="font-display text-base font-semibold">Check capacity as well as minutes</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              Plans also differ in the number of agents, concurrent calls and features such as{' '}
              <Link to="/product/outbound" className="font-semibold text-primary hover:underline">outbound campaigns</Link>,{' '}
              <Link to="/product/integrations" className="font-semibold text-primary hover:underline">CRM integrations</Link>{' '}
              and API access. A team that only needs a{' '}
              <Link to="/product/widget" className="font-semibold text-primary hover:underline">website voice widget</Link>{' '}
              has different needs from one running follow-up calls.
            </p>
          </div>
          <div>
            <h3 className="font-display text-base font-semibold">Remember the other costs</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              You use your own numbers, so number rental and phone line minutes are billed by your telephony provider,
              and GST applies to plan prices. The{' '}
              <Link to="/ai-voice-bot-pricing-india" className="font-semibold text-primary hover:underline">voice bot pricing guide</Link>{' '}
              and the article on{' '}
              <Link to="/resources/blog/ai-voice-agent-pricing-india" className="font-semibold text-primary hover:underline">estimating AI voice agent cost</Link>{' '}
              walk through a full budget.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FaqSection items={FAQ} />

      <section className="mx-auto max-w-7xl px-5 pb-20 md:px-8">
        <div className="rounded-3xl border border-border bg-surface p-10 text-center">
          <h2 className="font-display text-2xl font-bold">Need something custom?</h2>
          <p className="mx-auto mt-2 max-w-md text-text-muted">
            Discuss higher call volumes, supported telephony connections, and an agreed support scope.
          </p>
          <NavLink
            to="/contact"
            onClick={() => trackMarketingCta('talk_to_sales', 'pricing_custom')}
            className="mt-6 inline-block rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            Talk to sales
          </NavLink>
        </div>
      </section>
    </MarketingLayout>
  )
}
