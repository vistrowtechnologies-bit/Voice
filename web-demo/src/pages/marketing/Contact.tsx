import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { trackQualifyLead } from '../../lib/analytics'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { SectionEyebrow } from '../../components/MarketingBits'
import { CONTACT_EMAIL, CONTACT_PHONE, CONTACT_WHATSAPP_URL } from '../../lib/marketingContent'
import { FeatureList, Reveal, SectionHead, ShowcaseStyles, SplitRow } from '../../components/showcase'
import { CONTACT_CALL } from './premium-w5/visuals'

// What happens after the form, worded from the benefits above and the
// confirmation message the form shows.
const NEXT_STEPS = [
  { icon: 'edit_note', title: '1. Tell us about your calls', body: 'Share your team size, monthly call volume, when you want to go live and what you want Artha to handle.' },
  { icon: 'forum', title: '2. A person from our team replies', body: 'Our team reaches out to set up your walkthrough, by email, phone or WhatsApp.' },
  { icon: 'record_voice_over', title: '3. See it on a live call', body: 'A live walkthrough tuned to your use case, with Artha qualifying a call in your language.' },
]

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
        description="Book a Vistrow Voice demo or contact Vistrow Technologies Pvt. Ltd. by email, phone or WhatsApp. See Artha qualify a call in your language."
        path="/contact"
      />
      <div className="relative overflow-hidden">
      <ShowcaseStyles />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-32 top-0 h-[520px] w-[620px] rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute right-[18%] top-[45%] h-[300px] w-[380px] rounded-full bg-magenta/15 blur-[110px]" />
      </div>
      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-5 pb-14 pt-10 md:px-8 lg:grid-cols-2 lg:pb-16 lg:pt-14">
        {/* Left - pitch + demo card */}
        <div>
          <SectionEyebrow>Book a demo</SectionEyebrow>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight text-balance sm:text-5xl lg:text-[52px]">
            See Vistrow Voice on a live call.
          </h1>
          <ul className="mt-6 flex flex-col gap-3">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-center gap-3 text-text">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                  <Icon name="check_circle" className="text-[18px]" />
                </span>
                {b}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col gap-2.5">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="flex min-h-11 items-center gap-2 text-sm font-semibold text-text-muted hover:text-primary sm:min-h-0"
            >
              <Icon name="mail" className="text-[18px]" />
              Or email us directly at {CONTACT_EMAIL}
            </a>
            <a
              href={`tel:${CONTACT_PHONE.replace(/\s/g, '')}`}
              className="flex min-h-11 items-center gap-2 text-sm font-semibold text-text-muted hover:text-primary sm:min-h-0"
            >
              <Icon name="call" className="text-[18px]" />
              Or call us at {CONTACT_PHONE}
            </a>
            <a
              href={CONTACT_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center gap-2 text-sm font-semibold text-text-muted hover:text-primary sm:min-h-0"
            >
              <Icon name="chat" className="text-[18px]" />
              Or message us on WhatsApp at {CONTACT_PHONE}
            </a>
          </div>
          <div className="mt-8 rounded-3xl border border-border bg-surface/80 p-5 backdrop-blur">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-text-muted">
              <Icon name="business" className="text-[18px]" />
              The company behind Vistrow Voice
            </p>
            <p className="mt-3 text-sm leading-relaxed text-text">
              Vistrow Voice is a product of <strong>Vistrow Technologies Pvt. Ltd.</strong>, part of{' '}
              <a href="https://vistrow.com" target="_blank" rel="noopener" className="font-semibold text-primary hover:underline">
                Vistrow
              </a>
              . Write to us at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-primary hover:underline">{CONTACT_EMAIL}</a>
              , call or WhatsApp {CONTACT_PHONE}, and a person from our team replies.
            </p>
          </div>
        </div>

        {/* Right - form */}
        {/* w-full, not justify-self-end - same grid trap as PageHero: an
            end-justified item sizes to its content, so the form column
            narrowed to whatever the fields happened to measure instead of
            filling its half of the grid. */}
        <div className="w-full lg:pl-6">
          {sent ? (
            // The live tap-to-talk demo is homepage-only (owner, 2026-10-24),
            // so the form is replaced by the confirmation alone.
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
            </div>
          ) : (
            <div className="w-full rounded-[2rem] border border-border bg-surface p-7 shadow-[0_40px_80px_-48px_rgba(76,29,149,0.7)] sm:p-9">
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
                      className="w-full min-h-11 rounded-xl border border-border bg-bg px-4 py-2.5 sm:min-h-0 text-sm text-text outline-none focus:border-primary"
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
                      className="w-full min-h-11 rounded-xl border border-border bg-bg px-4 py-2.5 sm:min-h-0 text-sm text-text outline-none focus:border-primary"
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
                    className="w-full min-h-11 rounded-xl border border-border bg-bg px-4 py-2.5 sm:min-h-0 text-sm text-text outline-none focus:border-primary"
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
                    className="w-full min-h-11 rounded-xl border border-border bg-bg px-4 py-2.5 sm:min-h-0 text-sm text-text outline-none focus:border-primary"
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
      </div>

      {/* What happens after the form, beside the call view the walkthrough shows. */}
      <section className="mx-auto max-w-7xl px-5 pb-20 pt-6 md:px-8">
        <SplitRow figure={CONTACT_CALL} className="">
          <Reveal>
            <SectionHead eyebrow="What happens next" title="From this form to a live call." />
          </Reveal>
          <FeatureList items={NEXT_STEPS} />
        </SplitRow>
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
        className="w-full min-h-11 rounded-xl border border-border bg-bg px-4 py-2.5 sm:min-h-0 text-sm text-text outline-none placeholder:text-text-muted focus:border-primary"
      />
    </div>
  )
}
