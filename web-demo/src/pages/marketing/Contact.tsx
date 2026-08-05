import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { trackQualifyLead } from '../../lib/analytics'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { SectionEyebrow } from '../../components/MarketingBits'

const BENEFITS = [
  'A live walkthrough tuned to your use case',
  'See Artha qualify a call in your language',
  'Pricing and rollout plan for your team',
]

export function Contact() {
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <MarketingLayout>
      <Seo
        title="Book a Demo - Vistrow Voice"
        description="See Vistrow Voice on a live call. Get a walkthrough tuned to your use case, watch Artha qualify a call in your language, and get a pricing and rollout plan."
        path="/contact"
      />
      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-5 py-16 md:px-8 lg:grid-cols-2 lg:py-20">
        {/* Left - pitch + demo card */}
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
        </div>

        {/* Right - form */}
        {/* w-full, not justify-self-end - same grid trap as PageHero: an
            end-justified item sizes to its content, so the form column
            narrowed to whatever the fields happened to measure instead of
            filling its half of the grid. */}
        <div className="w-full lg:pl-6">
          <div className="w-full rounded-3xl border border-border bg-surface p-7 sm:p-9">
            {sent ? (
              <div className="flex flex-col items-center py-16 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
                  <Icon name="check" className="text-[28px]" />
                </span>
                <h2 className="mt-5 font-display text-2xl font-semibold">Thanks - we’ll be in touch.</h2>
                <p className="mt-2 max-w-xs text-sm text-text-muted">
                  Our team will reach out shortly to set up your walkthrough.
                </p>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  setError(null)
                  const form = new FormData(e.currentTarget)
                  setBusy(true)
                  try {
                    const res = await fetch('/api/public/contact', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: form.get('name'),
                        email: form.get('email'),
                        company: form.get('company'),
                        team_size: form.get('team_size'),
                        use_case: form.get('use_case'),
                      }),
                    })
                    if (!res.ok) throw new Error('Could not send your request')
                    trackQualifyLead('contact_form')
                    setSent(true)
                  } catch {
                    setError('Something went wrong - please try again, or email us directly.')
                  } finally {
                    setBusy(false)
                  }
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
                  <select
                    name="team_size"
                    className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm text-text outline-none focus:border-primary"
                  >
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
                    name="use_case"
                    rows={3}
                    placeholder="e.g. inbound lead qualification for real estate"
                    className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm text-text outline-none focus:border-primary"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <button
                  type="submit"
                  disabled={busy}
                  className="mt-2 rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? 'Sending…' : 'Book my demo'}
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
