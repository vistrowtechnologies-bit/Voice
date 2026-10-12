import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, PageHero, SectionEyebrow } from '../../components/MarketingBits'
import { PLANS, TOPUP_PACKS, type Plan } from '../../lib/plans'

// Cost guide for the "AI voice bot pricing / voicebot cost" queries. Every
// number on this page is computed from the real billing constants, never typed
// in by hand:
//   - plans, included credits, concurrency, top-up packs: lib/plans.ts
//     (mirrors agent/plan_policy.py PLANS / TOPUP_PACKS)
//   - the constants below mirror server/calls_db.py. Keep them in sync by hand,
//     the same way plans.ts mirrors the server.
/** server/calls_db.py GST_RATE - added on top of every charge. */
const GST_RATE = 0.18
/** server/calls_db.py OVERAGE_RATE_MULTIPLIER - x the plan's per-credit rate. */
const OVERAGE_RATE_MULTIPLIER = 1.4
/** server/calls_db.py _VOICE_TIER_MULTIPLIERS (Lite is the "economy" key). */
const VOICE_TIERS: { name: string; mult: number; scaleOnly?: boolean; note: string }[] = [
  { name: 'Lite', mult: 0.75, note: 'Single-language voices: a male and a female voice for English and for nine of the ten Indian languages.' },
  { name: 'Standard', mult: 1, note: 'Voices that speak all ten Indian languages and English, and keep the same voice when the caller switches.' },
  { name: 'Premium', mult: 2, scaleOnly: true, note: 'Natural conversational voices, including ones that switch language mid-call. Scale plan only.' },
]
/** server/calls_db.py _MODEL_TIER_MULTIPLIERS for the two models offered in
 * the agent editor today (lib/agentOptions.ts MODEL_OPTIONS): Vistrow Bharat
 * (sarvam/...) and Vistrow Swift (gpt-4.1-mini) are both in the Premium (2x)
 * model tier. Update this if the offered list changes. */
const OFFERED_MODEL_MULT = 2
/** server/calls_db.py credit_rate_browser / _phone / _widget defaults. */
const CHANNEL_RATE = 1

const round2 = (n: number) => Math.round(n * 100) / 100
const inr = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`
const num = (n: number) => n.toLocaleString('en-IN')

// Same rounding as the server: top-ups use the per-credit rate rounded first
// (topup_quote); overage rounds the multiplied rate (billing_summary).
const perCredit = (plan: Plan) => round2(plan.priceInr / plan.creditsNum)
const overageRate = (plan: Plan) => round2((plan.priceInr / plan.creditsNum) * OVERAGE_RATE_MULTIPLIER)
const withGst = (base: number) => round2(base + round2(base * GST_RATE))

const growth = PLANS.find((p) => p.key === 'growth')!
const scale = PLANS.find((p) => p.key === 'scale')!
const biggestPack = TOPUP_PACKS[TOPUP_PACKS.length - 1]

// Worked example: 1,000 minutes of phone calls, Standard voice, default model.
const EX_MINUTES = 1000
const exCreditsPerMinute = CHANNEL_RATE * 1 * OFFERED_MODEL_MULT
const exCredits = EX_MINUTES * exCreditsPerMinute
const exExtra = Math.max(0, exCredits - growth.creditsNum)
const exPackBase = round2(biggestPack.credits * perCredit(growth))
const exPackBonus = Math.floor((biggestPack.credits * biggestPack.bonusPct) / 100)
const exWithPackBase = growth.priceInr + exPackBase
const exOverageBase = growth.priceInr + round2(exExtra * overageRate(growth))
const EXAMPLE_OPTIONS = [
  {
    title: `Growth + one ${num(biggestPack.credits)}-credit pack`,
    base: exWithPackBase,
    detail: `${inr(growth.priceInr)} plan + ${inr(exPackBase)} pack (${num(biggestPack.credits)} credits at ${inr(perCredit(growth))}, plus ${num(exPackBonus)} bonus credits).`,
  },
  {
    title: 'Growth + overage',
    base: exOverageBase,
    detail: `${inr(growth.priceInr)} plan + ${num(exExtra)} extra credits at ${inr(overageRate(growth))} on the next invoice.`,
  },
  {
    title: 'Scale on its own',
    base: scale.priceInr,
    detail: `${num(scale.creditsNum)} credits included, so ${num(exCredits)} fits with ${num(scale.creditsNum - exCredits)} to spare.`,
  },
]

const NOT_INCLUDED = [
  {
    icon: 'call',
    title: 'Carrier minutes and number rental',
    body: 'Phone calls travel over your telephony provider’s line. Their per-minute charges and number rental are billed by that provider, or as a separate line on your invoice if we provision the number for you. They never come out of AI credits.',
  },
  {
    icon: 'receipt_long',
    title: 'GST',
    body: `Plan prices, packs and overage are quoted before tax. GST at ${GST_RATE * 100}% is added to each charge, and the invoice shows it as its own line.`,
  },
  {
    icon: 'tune',
    title: 'Your own integrations',
    body: 'Sending leads to your CRM, Google Sheets, Slack or a webhook uses no credits, but any paid plan you hold with those tools stays your own bill.',
  },
]

const FAQ = [
  {
    q: 'How much does an AI voice bot cost per minute in India?',
    a: `On Vistrow Voice a minute costs credits, not a flat rupee price. With a Standard voice and either of the models offered today, a minute uses ${exCreditsPerMinute} credits. A credit is worth ${inr(perCredit(PLANS[0]))} on Starter, ${inr(perCredit(growth))} on Growth and ${inr(perCredit(scale))} on Scale, so a minute works out to roughly ${inr(exCreditsPerMinute * perCredit(scale))}–${inr(exCreditsPerMinute * perCredit(PLANS[0]))} before GST and carrier charges, depending on the plan.`,
  },
  {
    q: 'Do phone calls cost more credits than website calls?',
    a: 'No. Browser, website-widget and phone calls all use credits at the same rate. What changes the rate is the voice tier and the model tier. Carrier charges for phone calls are billed separately from credits.',
  },
  {
    q: 'What happens when I run out of credits?',
    a: `On an active subscription, calls keep going and the extra minutes are billed as overage at ${OVERAGE_RATE_MULTIPLIER}× your plan’s per-credit rate on the next invoice. Without an active subscription, for example on a trial, calls stop when the credits run out. A credit pack bought in advance costs less than overage.`,
  },
  {
    q: 'Is GST included in the plan price?',
    a: `No. Plan prices, credit packs and overage are shown before tax, and GST at ${GST_RATE * 100}% is added to each charge. For example, Growth is ${inr(growth.priceInr)} + ${inr(round2(growth.priceInr * GST_RATE))} GST = ${inr(withGst(growth.priceInr))} a month.`,
  },
  {
    q: 'How do I keep the cost per call down?',
    a: 'Most of the bill is minutes, so shorter calls matter more than anything else: a clear opening line, questions asked once, and a knowledge base that answers quickly. A Lite voice uses 25% fewer credits than a Standard one if a single-language voice suits your callers.',
  },
  {
    q: 'Can I see what each call cost?',
    a: 'Yes. Each call’s details show the exact credits it used, and the Usage page breaks credits down by day, channel, agent, voice tier, model tier and phone number, with the most expensive calls listed.',
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

export function AiVoiceBotPricing() {
  return (
    <MarketingLayout>
      <Seo
        title="AI Voice Bot Pricing in India: Cost per Minute"
        description="AI voice bot cost per minute in India, worked out: plans and included credits, credits per minute by voice and model, GST, overage and credit packs."
        path="/ai-voice-bot-pricing-india"
        jsonLd={FAQ_JSONLD}
      />

      <PageHero
        eyebrow="Pricing guide"
        title="AI voice bot pricing in India, worked out per minute."
        subhead="How Vistrow Voice turns call minutes into a monthly bill: the plans, what a minute costs in credits, what is charged on top, and a worked example you can redo with your own numbers."
      />

      {/* The short answer first, then the parts that make it up. */}
      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <div className="grid gap-6 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.10] via-surface to-surface p-7 sm:p-9 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
          <div>
            <SectionEyebrow>The short answer</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">You pay for minutes of conversation, in credits.</h2>
            <p className="mt-4 leading-relaxed text-text-muted">
              Each plan includes a monthly allowance of credits. Every minute of a call uses credits: call minutes ×
              channel rate × voice-tier multiplier × model-tier multiplier. With a Standard voice and the models offered
              today, that is {exCreditsPerMinute} credits a minute, which is {inr(exCreditsPerMinute * perCredit(growth))}{' '}
              a minute at the Growth plan’s credit rate, before GST. Carrier minutes and number rental for phone calls
              are separate.
            </p>
          </div>
          <ul className="space-y-3 text-sm leading-relaxed text-text-muted">
            {[
              'Same credit rate for phone, browser and website-widget calls',
              'Voice tier: Lite 0.75×, Standard 1×, Premium 2×',
              `Model tier: both models offered today bill at ${OFFERED_MODEL_MULT}×`,
              `GST at ${GST_RATE * 100}% on top of every charge`,
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <Icon name="check_circle" className="mt-0.5 shrink-0 text-[16px] text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-8 max-w-2xl">
          <SectionEyebrow>Plans</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">What each plan includes, and what a credit costs.</h2>
          <p className="mt-3 text-text-muted">
            The per-credit rate is the plan price divided by its credits. It is also the price of extra credit packs on
            that plan. Outbound campaigns need Growth or Scale; Premium voices need Scale.
          </p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-surface-high">
                <th scope="col" className="px-5 py-4 font-display font-semibold">Plan</th>
                <th scope="col" className="px-5 py-4 font-display font-semibold">Price / month</th>
                <th scope="col" className="px-5 py-4 font-display font-semibold">Credits / month</th>
                <th scope="col" className="px-5 py-4 font-display font-semibold">Per credit</th>
                <th scope="col" className="px-5 py-4 font-display font-semibold">Overage per credit</th>
                <th scope="col" className="px-5 py-4 font-display font-semibold">With GST</th>
              </tr>
            </thead>
            <tbody>
              {PLANS.map((plan) => (
                <tr key={plan.key} className="border-t border-border bg-surface">
                  <th scope="row" className="px-5 py-4 font-semibold text-text">{plan.name}</th>
                  <td className="px-5 py-4 text-text">{inr(plan.priceInr)}</td>
                  <td className="px-5 py-4 text-text">{num(plan.creditsNum)}</td>
                  <td className="px-5 py-4 text-text">{inr(perCredit(plan))}</td>
                  <td className="px-5 py-4 text-text">{inr(overageRate(plan))}</td>
                  <td className="px-5 py-4 text-text-muted">{inr(withGst(plan.priceInr))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-text-muted">
          Prices in INR, before GST unless marked. Full feature lists are on the{' '}
          <Link to="/pricing" className="font-semibold text-primary underline-offset-4 hover:underline">
            pricing page
          </Link>
          .
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-8 max-w-2xl">
          <SectionEyebrow>Credits per minute</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">The voice you pick sets the rate.</h2>
          <p className="mt-3 text-text-muted">
            The channel rate is {CHANNEL_RATE} for phone, browser and website-widget calls alike. The two models offered
            in the agent editor today, Vistrow Bharat and Vistrow Swift, are both in the {OFFERED_MODEL_MULT}× model
            tier, so the voice tier is what moves the number.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {VOICE_TIERS.map((tier) => {
            const cpm = CHANNEL_RATE * tier.mult * OFFERED_MODEL_MULT
            return (
              <div key={tier.name} className="rounded-2xl border border-border bg-surface p-7">
                <p className="text-xs font-bold uppercase tracking-widest text-text-muted">{tier.name} voice · {tier.mult}×</p>
                <p className="mt-3 font-display text-3xl font-bold text-text">
                  {cpm} <span className="text-base font-semibold text-text-muted">credits / minute</span>
                </p>
                <p className="mt-3 text-sm leading-relaxed text-text-muted">{tier.note}</p>
                <p className="mt-3 text-sm text-text">
                  {tier.scaleOnly
                    ? `${inr(round2(cpm * perCredit(scale)))} a minute on Scale`
                    : `${inr(round2(cpm * perCredit(growth)))} a minute on Growth · ${inr(round2(cpm * perCredit(scale)))} on Scale`}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="rounded-3xl border border-border bg-surface p-7 sm:p-9">
          <SectionEyebrow>Worked example</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">
            {num(EX_MINUTES)} minutes of phone calls a month, Standard voice.
          </h2>
          <ol className="mt-6 space-y-3 text-sm leading-relaxed text-text-muted">
            <li>
              <span className="font-semibold text-text">1. Credits used:</span> {num(EX_MINUTES)} minutes × {CHANNEL_RATE}{' '}
              (phone) × 1 (Standard voice) × {OFFERED_MODEL_MULT} (model) = {num(exCredits)} credits.
            </li>
            <li>
              <span className="font-semibold text-text">2. What the plan covers:</span> Growth includes{' '}
              {num(growth.creditsNum)} credits, leaving {num(exExtra)} to cover.
            </li>
            <li>
              <span className="font-semibold text-text">3. Ways to cover the rest</span>, before GST and carrier charges:
            </li>
          </ol>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {EXAMPLE_OPTIONS.map((option) => (
              <div key={option.title} className="rounded-2xl border border-border bg-surface-high/60 p-5">
                <h3 className="font-display text-base font-semibold">{option.title}</h3>
                <p className="mt-2 font-display text-2xl font-bold text-text">{inr(option.base)}</p>
                <p className="mt-1 text-xs text-text-muted">{inr(withGst(option.base))} with GST</p>
                <p className="mt-3 text-sm leading-relaxed text-text-muted">{option.detail}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm leading-relaxed text-text-muted">
            For this volume the Growth plan plus one credit pack comes out lowest, at about{' '}
            {inr(round2(exWithPackBase / EX_MINUTES))} a minute before GST. Above roughly{' '}
            {num(scale.creditsNum / exCreditsPerMinute)} minutes a month at this rate, Scale’s allowance runs out too, so
            compare packs against overage again. Swap in your own minutes and voice tier to redo the sum.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-2xl border border-border bg-surface p-7 sm:p-8">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-high text-cyan">
              <Icon name="savings" className="text-[22px]" />
            </span>
            <h2 className="mt-5 font-display text-2xl font-bold tracking-tight">Credit packs.</h2>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              Extra credits are sold in packs at your plan’s per-credit rate, plus GST. Larger packs add bonus credits
              that are granted but not invoiced. Self-serve checkout is not open yet, so for now our team adds packs on
              request.
            </p>
            <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {TOPUP_PACKS.map((pack) => (
                <li key={pack.key} className="rounded-xl border border-border bg-surface-high/60 px-4 py-3 text-center">
                  <p className="font-display text-xl font-bold text-text">{num(pack.credits)}</p>
                  <p className="text-xs text-text-muted">{pack.bonusPct ? `+${pack.bonusPct}% bonus` : 'no bonus'}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-7 sm:p-8">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-high text-cyan">
              <Icon name="receipt_long" className="text-[22px]" />
            </span>
            <h2 className="mt-5 font-display text-2xl font-bold tracking-tight">Overage.</h2>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              On an active subscription, calls are not cut off when the monthly credits run out. Usage past the
              allowance is billed at {OVERAGE_RATE_MULTIPLIER}× the plan’s per-credit rate, plus GST, on the following
              invoice once the period has closed. Without an active subscription, calls stop at the allowance instead.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              Billing shows credits left this cycle, and an email alert can warn you when they fall below 10%.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-8 max-w-2xl">
          <SectionEyebrow>Not in the credit price</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">What is billed separately.</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {NOT_INCLUDED.map((item) => (
            <div key={item.title} className="rounded-2xl border border-border bg-surface p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                <Icon name={item.icon} className="text-[22px]" />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="rounded-2xl border border-border bg-surface p-7 sm:p-8">
          <SectionEyebrow>Comparing vendors</SectionEyebrow>
          <h2 className="mt-3 font-display text-2xl font-bold tracking-tight">Compare like with like.</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-muted">
            A per-minute quote only compares with another one when both cover the same things: speech recognition, the
            language model, the voice, recordings and transcripts, CRM delivery, and the phone line. Ask each vendor what
            their minute includes, how unanswered calls and retries are billed, and what happens when the allowance runs
            out. Then compare cost per useful outcome, such as a qualified lead or a booked visit, not only per minute.
            The{' '}
            <Link to="/resources/blog/ai-voice-agent-pricing-india" className="font-semibold text-primary underline-offset-4 hover:underline">
              guide to comparing AI voice agent pricing
            </Link>{' '}
            has a worksheet for this.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-12 md:px-8">
        <div className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/[0.08] to-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <SectionEyebrow>Where the minutes go</SectionEyebrow>
            <h2 className="mt-2 font-display text-xl font-bold tracking-tight">See the calls behind the numbers.</h2>
            <p className="mt-1 max-w-2xl text-sm text-text-muted">
              Two common kinds of call to cost out: outbound payment reminders and inbound enquiry lines.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link
              to="/solutions/finance"
              className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-5 py-3 text-sm font-bold text-primary transition-colors hover:bg-primary/10"
            >
              Collections and EMI reminders
              <Icon name="arrow_forward" className="text-[16px]" />
            </Link>
            <Link
              to="/solutions/real-estate"
              className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-3 text-sm font-bold text-text transition-colors hover:border-primary"
            >
              Real estate enquiries
            </Link>
          </div>
        </div>
      </section>

      <FaqSection items={FAQ} title="Voice bot cost questions, answered." />

      <CTABand
        title="Estimate your own call volume with us."
        subtitle="Talk to Artha live in your browser, or book a walkthrough and we will size a plan from your expected minutes."
      />
    </MarketingLayout>
  )
}
