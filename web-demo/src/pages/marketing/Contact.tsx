import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { getAttribution } from '../../lib/attribution'
import { looksLikeRealPhone } from '../../lib/demoVisitor'
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
  // Move focus to the confirmation so screen readers announce it.
  const doneRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (sent) doneRef.current?.focus()
  }, [sent])

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
        <div className="order-first w-full lg:order-none lg:pl-6">
          {sent ? (
            // The live tap-to-talk demo is homepage-only (owner, 2026-10-24),
            // so the form is replaced by the confirmation alone.
            <div className="flex flex-col gap-5">
              <div
                ref={doneRef}
                tabIndex={-1}
                role="status"
                className="flex items-center gap-3 rounded-2xl border border-success/30 bg-success/5 px-5 py-3.5 text-left outline-none"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                  <Icon name="check" className="text-[18px]" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Thanks - we’ll be in touch.</p>
                  <p className="text-xs text-text-muted">
                    A person from our team will call or WhatsApp you on the number you gave to set up your walkthrough.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full rounded-[2rem] border border-border bg-surface p-7 shadow-[0_40px_80px_-48px_rgba(76,29,149,0.7)] sm:p-9">
              <form
                noValidate
                onSubmit={async (e) => {
                  e.preventDefault()
                  setError(null)
                  const form = new FormData(e.currentTarget)
                  const value = (key: string) => String(form.get(key) ?? '').trim()
                  const phone = `${value('code')}${value('phone').replace(/\D/g, '').replace(/^0+/, '')}`
                  if (value('name').length < 2) return setError('Please enter your name.')
                  if (!/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(value('email'))) return setError('Please enter a valid email address.')
                  if (!looksLikeRealPhone(phone)) return setError('Please enter a valid mobile number so we can call you back.')
                  setBusy(true)
                  const controller = new AbortController()
                  const timer = window.setTimeout(() => controller.abort(), 15_000)
                  try {
                    const query = new URLSearchParams(window.location.search)
                    const res = await fetch('/api/public/contact', {
                      method: 'POST',
                      signal: controller.signal,
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: value('name'),
                        email: value('email'),
                        phone,
                        company: value('company'),
                        team_size: value('team_size'),
                        call_volume: value('call_volume'),
                        timeline: value('timeline'),
                        use_case: value('use_case'),
                        hp: value('hp'),
                        // Which page and button sent them here, plus how they
                        // first reached the site, so sales can see the source.
                        page: window.location.pathname,
                        cta: query.get('from') || query.get('plan') || '',
                        attribution: getAttribution(),
                      }),
                    })
                    if (!res.ok) {
                      const detail = await res
                        .json()
                        .then((j) => (typeof j?.detail === 'string' ? j.detail : ''))
                        .catch(() => '')
                      throw new Error(detail || 'Something went wrong - please try again, or WhatsApp us.')
                    }
                    trackQualifyLead('contact_form')
                    setSent(true)
                  } catch (err) {
                    setError(
                      controller.signal.aborted
                        ? 'This is taking too long - please try again, or WhatsApp us.'
                        : err instanceof Error
                          ? err.message
                          : 'Something went wrong - please try again, or WhatsApp us.',
                    )
                  } finally {
                    window.clearTimeout(timer)
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
                  <Field label="Full name" name="name" placeholder="Your name" autoComplete="name" required />
                  <Field label="Work email" name="email" type="email" placeholder="you@company.com" autoComplete="email" required />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="phone" className={LABEL}>
                      Mobile number <span className="text-destructive">*</span>
                    </label>
                    <div className="flex gap-2">
                      <select name="code" aria-label="Country code" defaultValue="+91" className={`${INPUT} w-[5.5rem] shrink-0 px-2`}>
                        {COUNTRY_CODES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                      <input
                        id="phone"
                        name="phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel-national"
                        placeholder="98765 43210"
                        maxLength={14}
                        required
                        className={`${INPUT} w-full min-w-0 px-4`}
                      />
                    </div>
                  </div>
                  <Field label="Company" name="company" placeholder="Company name" autoComplete="organization" />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Choice label="Team size" name="team_size" options={['1–10', '11–50', '51–200', '200+']} />
                  <Choice
                    label="Monthly call volume"
                    name="call_volume"
                    options={['Under 500', '500–2,000', '2,000–10,000', '10,000+', 'Not sure yet']}
                  />
                </div>
                <Choice
                  label="When do you want to go live?"
                  name="timeline"
                  options={['Immediately', 'Within 30 days', '1–3 months', 'Just researching']}
                />
                <div>
                  <label htmlFor="use_case" className={LABEL}>
                    What do you want to use Artha for?
                  </label>
                  <textarea
                    id="use_case"
                    name="use_case"
                    rows={3}
                    maxLength={2000}
                    placeholder="e.g. inbound lead qualification for real estate"
                    className={`${INPUT} w-full px-4`}
                  />
                </div>
                {error && (
                  <p role="alert" className="text-sm font-semibold text-destructive">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className="mt-2 rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? 'Sending…' : 'Book my demo'}
                </button>
                <p className="text-xs leading-relaxed text-text-muted">
                  By booking, you agree that Vistrow may call, WhatsApp or email you about your demo. Read our{' '}
                  <Link to="/privacy" className="text-primary underline">
                    privacy policy
                  </Link>
                  .
                </p>
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

const LABEL = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-text-muted'
const INPUT =
  'min-h-11 rounded-xl border border-border bg-bg py-2.5 text-sm text-text outline-none placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 sm:min-h-0'
const COUNTRY_CODES = ['+91', '+971', '+1', '+44', '+65', '+61']

function Field({
  label,
  name,
  type = 'text',
  placeholder,
  required,
  autoComplete,
}: {
  label: string
  name: string
  type?: string
  placeholder?: string
  required?: boolean
  autoComplete?: string
}) {
  return (
    <div>
      <label htmlFor={name} className={LABEL}>
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        maxLength={200}
        className={`${INPUT} w-full px-4`}
      />
    </div>
  )
}

// Starts empty, so a visitor who skips it is not reported as "1–10" or
// "Immediately" (the first option used to be the silent default).
function Choice({ label, name, options }: { label: string; name: string; options: string[] }) {
  return (
    <div>
      <label htmlFor={name} className={LABEL}>
        {label}
      </label>
      <select id={name} name={name} defaultValue="" className={`${INPUT} w-full px-4`}>
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  )
}
