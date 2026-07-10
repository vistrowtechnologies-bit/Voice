import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { DemoOrbCard } from '../../components/DemoOrbCard'
import { SectionEyebrow } from '../../components/MarketingBits'
import { CONTACT_PHONE } from '../../lib/marketingContent'

const BENEFITS = [
  'A live walkthrough tuned to your use case',
  'See Artha qualify a call in your language',
  'Pricing and rollout plan for your team',
]

export function Contact() {
  const [sent, setSent] = useState(false)

  return (
    <MarketingLayout>
      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-5 py-16 md:px-8 lg:grid-cols-2 lg:py-20">
        {/* Left — pitch + demo card */}
        <div>
          <SectionEyebrow>Book a demo</SectionEyebrow>
          <h1 className="mt-4 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            See Vistrow Voice on a live call.
          </h1>
          <ul className="mt-6 flex flex-col gap-3">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-center gap-3 text-text">
                <Icon name="check_circle" className="text-[20px] text-cyan" />
                {b}
              </li>
            ))}
          </ul>
          <div className="mt-8 max-w-sm">
            <DemoOrbCard />
          </div>
          <p className="mt-6 text-sm text-text-muted">
            Prefer to call?{' '}
            <a href={`tel:${CONTACT_PHONE.replace(/\s/g, '')}`} className="text-primary hover:underline">
              {CONTACT_PHONE}
            </a>
          </p>
        </div>

        {/* Right — form */}
        <div className="lg:justify-self-end lg:pl-6">
          <div className="w-full rounded-3xl border border-border bg-surface p-7 sm:p-9">
            {sent ? (
              <div className="flex flex-col items-center py-16 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
                  <Icon name="check" className="text-[28px]" />
                </span>
                <h2 className="mt-5 font-display text-2xl font-semibold">Thanks — we’ll be in touch.</h2>
                <p className="mt-2 max-w-xs text-sm text-text-muted">
                  Our team will reach out shortly to set up your walkthrough.
                </p>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  setSent(true)
                }}
                className="flex flex-col gap-4"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Full name" name="name" placeholder="Your name" required />
                  <Field label="Work email" name="email" type="email" placeholder="you@company.com" required />
                </div>
                <Field label="Company" name="company" placeholder="Company name" />
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-text-muted">
                    Team size
                  </label>
                  <select className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm text-text outline-none focus:border-primary">
                    <option>1–10</option>
                    <option>11–50</option>
                    <option>51–200</option>
                    <option>200+</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-text-muted">
                    What do you want to use Artha for?
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. inbound lead qualification for real estate"
                    className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm text-text outline-none focus:border-primary"
                  />
                </div>
                <button
                  type="submit"
                  className="mt-2 rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
                >
                  Book my demo
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}

function Field({
  label,
  name,
  type = 'text',
  placeholder,
  required,
}: {
  label: string
  name: string
  type?: string
  placeholder?: string
  required?: boolean
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-text-muted">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm text-text outline-none placeholder:text-text-muted focus:border-primary"
      />
    </div>
  )
}
