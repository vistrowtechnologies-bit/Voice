import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout, NavLink } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { SectionEyebrow } from '../../components/MarketingBits'
import { trackMarketingCta } from '../../lib/analytics'
import { PLANS, SHARED_PLAN_FEATURES, planHighlights } from '../../lib/plans'

const FAQ = [
  {
    q: 'What is a credit?',
    a: 'A credit pays for conversation time. With the AI model you can choose today (Vistrow Bharat) and a Standard or HD voice, one minute of a call uses 2 credits, on the browser widget and on phone calls alike. Telephony is billed separately by whichever provider you connect. A Vistrow Native voice uses 1 credit a minute, and a Premium voice uses twice the Standard rate. Both channels draw from the same monthly pool.',
  },
  {
    q: 'Which languages are supported?',
    a: 'Artha speaks 10 Indian languages plus English, including Hindi, Tamil, Telugu, Bengali, Marathi, and Odia - switching mid-call to match the caller.',
  },
  {
    q: 'Can I bring my own phone number?',
    a: 'You can use a compatible provider and number after we confirm the connection setup. Carrier usage and number rental are separate from AI credits. The web call widget needs no phone number.',
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
          Choose the plan for your business.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-text-muted">
          Start with one knowledgeable agent. Add campaign automation, integrations, and API access as you grow.
        </p>
        <p className="mx-auto mt-3 max-w-xl text-sm text-text-muted">
          All plans include voice conversations, your website widget, and call insights. Choose the agent capacity and automation your team needs.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-8 md:px-8">
        <div className="grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div key={plan.key} className="flex flex-col rounded-2xl border border-border bg-surface p-7">
              <h3 className="font-display text-lg font-semibold">{plan.name}</h3>
              <p className="mt-3 text-3xl font-bold">{plan.price}<span className="text-sm font-normal text-text-muted"> / month</span></p>
              <p className="mt-3 font-semibold text-cyan">{plan.credits}</p>
              <p className="mt-2 text-sm text-text-muted">{plan.description}</p>
              <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                {planHighlights(plan).map((feat) => <li key={feat} className="flex items-start gap-2 text-sm text-text-muted"><Icon name="check_circle" className="mt-0.5 text-[16px] text-cyan" />{feat}</li>)}
              </ul>
              <p className="mt-5 text-xs text-text-muted">{plan.key === 'starter' ? 'Need campaigns, CRM integration, or a live catalog? Choose Growth.' : plan.key === 'growth' ? 'Need API access or premium voices? Choose Scale.' : 'Need more agents or capacity? Talk to us about a custom plan.'}</p>
              <NavLink
                to="/contact"
                onClick={() => trackMarketingCta('talk_to_sales', `pricing_plan_${plan.key}`)}
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
          <p className="mt-4 text-sm text-text-muted">Basic inbound calling requires a configured, supported number. Advanced inbound routing and outbound campaigns require Growth or Scale. Telephony is billed separately.</p>
        </details>
        <p className="mt-5 text-center text-sm text-text-muted">Prices are in INR per month, excluding applicable taxes and telephony. Voice and model choices affect credits per minute.</p>
        <p className="mt-3 text-center text-sm text-text-muted">Not sure which plan fits? Our team can help estimate your usage and arrange setup.</p>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8">
        <SectionEyebrow>Estimate your plan</SectionEyebrow>
        <h2 className="mt-3 max-w-2xl font-display text-2xl font-bold sm:text-3xl">How far a month of credits goes</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-muted">
          Credits pay for the minutes an agent spends in conversation. On Vistrow Bharat, the model every new agent uses,
          a Standard or HD voice uses 2 credits a minute and a Vistrow Native voice uses 1. The table divides each plan's
          monthly credits by those rates. It is arithmetic, not a promise of results: count only connected conversation
          time, and leave room for test calls.
        </p>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Credits / month</th>
                <th className="px-4 py-3 font-semibold">Minutes, Standard or HD voice</th>
                <th className="px-4 py-3 font-semibold">Minutes, Native voice</th>
              </tr>
            </thead>
            <tbody>
              {PLANS.map((plan) => (
                <tr key={plan.key} className="border-t border-border">
                  <td className="px-4 py-3 font-semibold">{plan.name}</td>
                  <td className="px-4 py-3 text-text-muted">{plan.creditsNum.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-text-muted">about {(plan.creditsNum / 2).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-text-muted">about {plan.creditsNum.toLocaleString('en-IN')}</td>
                </tr>
              ))}
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
              Telephony (number rental and carrier minutes) is billed by your provider, and GST applies to plan
              prices. The{' '}
              <Link to="/ai-voice-bot-pricing-india" className="font-semibold text-primary hover:underline">voice bot pricing guide</Link>{' '}
              and the article on{' '}
              <Link to="/resources/blog/ai-voice-agent-pricing-india" className="font-semibold text-primary hover:underline">estimating AI voice agent cost</Link>{' '}
              walk through a full budget. The help centre explains{' '}
              <Link to="/help/billing/how-credits-work" className="font-semibold text-primary hover:underline">how credits are counted</Link>.
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
