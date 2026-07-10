import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { SectionEyebrow } from '../../components/MarketingBits'
import { PLANS } from '../../lib/plans'

const FAQ = [
  {
    q: 'What is a credit?',
    a: 'One credit covers roughly one minute of AI conversation. Browser (web widget) calls and phone calls draw from the same monthly credit pool.',
  },
  {
    q: 'Which languages are supported?',
    a: 'Artha speaks 30+ Indian languages including Hindi, Hinglish, Tamil, Telugu, Bengali, Marathi and more — switching mid-call to match the caller.',
  },
  {
    q: 'Can I bring my own phone number?',
    a: 'Yes. Point your existing number at Vistrow for inbound, or get one from us. The web call widget needs no number at all.',
  },
  {
    q: 'Is there a free way to try it?',
    a: 'Yes — talk to Artha live in your browser right now, no signup or credit card required.',
  },
]

export function Pricing() {
  const [annual, setAnnual] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  return (
    <MarketingLayout>
      <section className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8 lg:py-20">
        <SectionEyebrow>Pricing</SectionEyebrow>
        <h1 className="mt-4 font-display text-5xl font-bold leading-[1.05] tracking-tight">
          Simple, credit-based plans.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-text-muted">
          Every plan includes the web call widget, call history, and analytics. Scale up as your call volume grows.
        </p>
        <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-border bg-surface p-1 text-sm">
          <button
            onClick={() => setAnnual(false)}
            className={`rounded-full px-4 py-1.5 font-semibold transition-colors ${!annual ? 'bg-primary text-white' : 'text-text-muted'}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`rounded-full px-4 py-1.5 font-semibold transition-colors ${annual ? 'bg-primary text-white' : 'text-text-muted'}`}
          >
            Annual <span className="text-cyan">−15%</span>
          </button>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-8 md:px-8">
        <div className="grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`flex flex-col rounded-2xl border bg-surface p-7 ${
                plan.tag === 'Recommended'
                  ? 'border-primary shadow-[0_0_40px_-10px_rgba(168,85,247,0.5)]'
                  : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold">{plan.name}</h3>
                {plan.tag && (
                  <span className="rounded-full bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                    {plan.tag}
                  </span>
                )}
              </div>
              <p className="mt-4 font-display text-4xl font-bold">
                {plan.price}
                <span className="text-base font-normal text-text-muted">/mo</span>
              </p>
              <p className="mt-1 text-sm text-text-muted">{plan.credits}</p>
              {annual && <p className="mt-1 text-xs font-semibold text-cyan">Billed annually — 15% off</p>}
              <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-sm text-text-muted">
                    <Icon name="check_circle" className="mt-0.5 text-[16px] text-cyan" />
                    {feat}
                  </li>
                ))}
              </ul>
              <Link
                to="/signup"
                className={`mt-7 rounded-full px-5 py-2.5 text-center text-sm font-bold transition-opacity hover:opacity-90 ${
                  plan.tag === 'Recommended'
                    ? 'bg-gradient-to-br from-primary to-primary-dark text-white'
                    : 'border border-border text-text'
                }`}
              >
                Start free
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-text-muted">
          A credit ≈ one minute of conversation. Web and phone calls share the same pool.
        </p>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 py-20 md:px-8">
        <div className="mb-10 text-center">
          <SectionEyebrow>FAQ</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Questions, answered.</h2>
        </div>
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

      <section className="mx-auto max-w-7xl px-5 pb-20 md:px-8">
        <div className="rounded-3xl border border-border bg-surface p-10 text-center">
          <h2 className="font-display text-2xl font-bold">Need something custom?</h2>
          <p className="mx-auto mt-2 max-w-md text-text-muted">
            High call volumes, on-prem, or a dedicated success manager — let’s talk.
          </p>
          <Link
            to="/contact"
            className="mt-6 inline-block rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            Talk to sales
          </Link>
        </div>
      </section>
    </MarketingLayout>
  )
}
