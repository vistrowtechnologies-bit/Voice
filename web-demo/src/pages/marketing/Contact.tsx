import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { trackQualifyLead } from '../../lib/analytics'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { SectionEyebrow } from '../../components/MarketingBits'
import { CONTACT_EMAIL, CONTACT_PHONE } from '../../lib/marketingContent'
import { DemoOrbCard } from '../../components/DemoOrbCard'

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
          <div className="mt-8 flex flex-col gap-2.5">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="flex items-center gap-2 text-sm font-semibold text-text-muted hover:text-primary"
            >
              <Icon name="mail" className="text-[18px]" />
              Or email us directly at {CONTACT_EMAIL}
            </a>
            <a
              href={`tel:${CONTACT_PHONE.replace(/\s/g, '')}`}
              className="flex items-center gap-2 text-sm font-semibold text-text-muted hover:text-primary"
            >
              <Icon name="call" className="text-[18px]" />
              Or call us at {CONTACT_PHONE}
            </a>
          </div>
        </div>

        {/* Right - form */}
        {/* w-full, not justify-self-end - same grid trap as PageHero: an
            end-justified item sizes to its content, so the form column
            narrowed to whatever the fields happened to measure instead of
            filling its half of the grid. */}
        <div className="w-full lg:pl-6">
          {sent ? (
            // DemoOrbCard supplies its own card chrome (rounded corners,
            // border, glow) - it isn't nested inside the form's wrapper div,
            // it replaces it. A static "we'll be in touch" card left a
            // visitor doing nothing for however long email takes; a voice
            // product's own best pitch is letting them actually hear Artha
            // right now instead of just reading that someone will call.
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-3 rounded-2xl border border-success/30 bg-success/5 px-5 py-3.5 text-left">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                  <Icon name="check" className="text-[18px]" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Thanks - we’ll be in touch.</p>
                  <p className="text-xs text-text-muted">Our team will reach out shortly to set up your walkthrough.</p>
                </div>
              </div>
              <p className="text-center text-sm font-semibold text-text-muted">
                While you wait, talk to Artha yourself -
              </p>
              <DemoOrbCard />
            </div>
          ) : (
            <div className="w-full rounded-3xl border border-border bg-surface p-7 sm:p-9">
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
                        phone: form.get('phone'),
                        company: form.get('company'),
                        team_size: form.get('team_size'),
                        call_volume: form.get('call_volume'),
                        timeline: form.get('timeline'),
                        use_case: form.get('use_case'),
                        hp: form.get('hp'),
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
                {/* Honeypot - real visitors never see this field (off-screen, not
                    display:none, since some bots specifically skip display:none
                    inputs). tabIndex -1 and autoComplete off so it's never reachable
                    by keyboard nav or autofill either. */}
                <input
                  type="text"
                  name="hp"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden"
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Full name" name="name" placeholder="Your name" required />
                  <Field label="Work email" name="email" type="email" placeholder="you@company.com" required />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Phone number" name="phone" type="tel" placeholder="+91 98765 43210" />
                  <Field label="Company" name="company" placeholder="Company name" />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                      Monthly call volume
                    </label>
                    <select
                      name="call_volume"
                      className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm text-text outline-none focus:border-primary"
                    >
                      <option>Under 500</option>
                      <option>500–2,000</option>
                      <option>2,000–10,000</option>
                      <option>10,000+</option>
                      <option>Not sure yet</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-text-muted">
                    When do you want to go live?
                  </label>
                  <select
                    name="timeline"
                    className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm text-text outline-none focus:border-primary"
                  >
                    <option>Immediately</option>
                    <option>Within 30 days</option>
                    <option>1–3 months</option>
                    <option>Just researching</option>
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
            </div>
          )}
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
