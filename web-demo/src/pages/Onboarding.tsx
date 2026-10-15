import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { BrowserTestModal } from '../components/AgentTestCall'
import { Icon } from '../components/Icon'
import { fetchAgents } from '../lib/api'
import { getAttribution } from '../lib/attribution'
import { apiAcceptConsent, apiCompleteOnboarding, apiUpdateAccount, useAuth } from '../lib/auth'
import { BRAND } from '../lib/brand'
import { COMMON_DIAL_CODES, countryForDialCode, dialCodeFor, guessCountry } from '../lib/phone'
import type { AgentConfig } from '../lib/types'
import vistrowMark from '../assets/vistrow-mark.png'

// Full-page onboarding every new workspace completes before the dashboard
// opens (RequireAuth sends un-onboarded users here). The answers land on the
// account (accounts.onboarding_profile) and show in the admin panel.
//
// Required: what we need to support and qualify the account (role, phone,
// company, industry, size, uses, languages, volume). Everything else sits in
// a collapsed "optional" block the customer can skip.

type StepId = 'you' | 'business' | 'goals' | 'finish'

const STEPS: { id: StepId; title: string }[] = [
  { id: 'you', title: 'About you' },
  { id: 'business', title: 'Business' },
  { id: 'goals', title: 'Goals' },
  { id: 'finish', title: 'Ready' },
]

type Option = { label: string; icon: string }

const ROLES: Option[] = [
  { label: 'Founder / Owner', icon: 'rocket_launch' },
  { label: 'Sales', icon: 'trending_up' },
  { label: 'Marketing', icon: 'campaign' },
  { label: 'Support / Operations', icon: 'support_agent' },
  { label: 'Developer / Technical', icon: 'code' },
  { label: 'Agency / Consultant', icon: 'hub' },
  { label: 'Other', icon: 'more_horiz' },
]
const INDUSTRIES: Option[] = [
  { label: 'Real estate', icon: 'apartment' },
  { label: 'Healthcare & clinics', icon: 'health_and_safety' },
  { label: 'Education', icon: 'menu_book' },
  { label: 'Banking & lending', icon: 'account_balance' },
  { label: 'Insurance', icon: 'verified_user' },
  { label: 'E-commerce & retail', icon: 'shopping_bag' },
  { label: 'Travel & hospitality', icon: 'travel_explore' },
  { label: 'Automotive & logistics', icon: 'local_shipping' },
  { label: 'Marketing / agency', icon: 'campaign' },
  { label: 'Other', icon: 'more_horiz' },
]
const USE_CASES: Option[] = [
  { label: 'Answer inbound calls', icon: 'call_received' },
  { label: 'Qualify leads', icon: 'trending_up' },
  { label: 'Follow-up & outbound calls', icon: 'call_made' },
  { label: 'Book appointments', icon: 'event' },
  { label: 'Customer support', icon: 'support_agent' },
  { label: 'Payment reminders', icon: 'payments' },
  { label: 'Website voice assistant', icon: 'widgets' },
  { label: 'Something else', icon: 'more_horiz' },
]
const REFERRAL_SOURCES = ['Google search', 'Google Ad', 'Facebook / Instagram', 'LinkedIn', 'YouTube', 'Friend / Colleague', 'Blog / Article', 'Twitter / X', 'Other']
const COMPANY_SIZES = ['Just me', '2–10', '11–50', '51–200', '201–1,000', '1,000+']
const LANGUAGES = ['Hindi', 'English', 'Marathi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Gujarati', 'Bengali', 'Punjabi', 'Odia', 'Other']
const CALL_VOLUMES = ['Under 500', '500–2K', '2K–10K', '10K–50K', '50K+', 'Not sure']
const CHANNELS = ['Phone calls', 'My website']
const CURRENT_SOLUTIONS = ['Our own team', 'Call centre / BPO', 'IVR / phone menu', 'Another AI tool', 'Not handling calls yet']
const TIMELINES = ['This week', 'This month', 'In 1–3 months', 'Just exploring']

interface Answers {
  role: string
  roleOther: string
  dialCode: string
  phoneNumber: string
  referralSource: string
  company: string
  website: string
  industry: string
  industryOther: string
  companySize: string
  country: string
  useCases: string[]
  useCaseOther: string
  channels: string[]
  languages: string[]
  callVolume: string
  currentSolution: string
  timeline: string
}

const draftKey = (userId: number) => `vv-onboarding-draft-${userId}`

const inputCls =
  'w-full rounded-xl border border-border bg-surface px-4 py-3 text-[15px] outline-none transition placeholder:text-text-muted focus:border-primary focus:ring-4 focus:ring-primary/10'

/** A large selectable card with an icon tile. */
function OptionCard({ option, selected, onClick, check }: { option: Option; selected: boolean; onClick: () => void; check?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`group flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition-all duration-150 sm:gap-3 sm:p-3.5 ${
        selected
          ? 'border-primary bg-primary/[0.07] shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_14%,transparent)]'
          : 'border-border bg-surface hover:-translate-y-px hover:border-primary/40 hover:shadow-sm'
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors sm:h-10 sm:w-10 sm:rounded-xl ${
          selected ? 'bg-primary text-white' : 'bg-surface-high text-primary group-hover:bg-primary/10'
        }`}
      >
        <Icon name={option.icon} className="text-[20px]" />
      </span>
      <span className={`min-w-0 flex-1 text-[13px] font-semibold leading-snug sm:text-sm ${selected ? 'text-text' : ''}`}>{option.label}</span>
      {check && (
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
            selected ? 'border-primary bg-primary text-white' : 'border-border'
          }`}
        >
          {selected && <Icon name="check" className="text-[14px]" />}
        </span>
      )}
    </button>
  )
}

/** Pill buttons for short single- or multi-select answers. */
function Pills({ options, value, onPick }: { options: string[]; value: string | string[]; onPick: (v: string) => void }) {
  const on = (v: string) => (Array.isArray(value) ? value.includes(v) : value === v)
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={on(o)}
          onClick={() => onPick(o)}
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-150 ${
            on(o)
              ? 'border-primary bg-primary text-white shadow-[0_6px_16px_-8px_var(--color-primary)]'
              : 'border-border bg-surface text-text-muted hover:border-primary/40 hover:text-text'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

/** A connected segmented control for ordered ranges (size, volume). */
function Segmented({ options, value, onPick }: { options: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-surface p-1 sm:grid-cols-6">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onPick(o)}
          className={`rounded-xl px-2 py-2.5 text-sm font-semibold transition-all duration-150 ${
            value === o ? 'bg-primary text-white shadow-sm' : 'bg-transparent text-text-muted hover:bg-surface-high hover:text-text'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

function Question({ label, hint, optional, error, children }: { label: string; hint?: string; optional?: boolean; error?: boolean; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={`text-[15px] font-bold ${error ? 'text-destructive' : ''}`}>
          {label}
          {optional && <span className="ml-2 text-xs font-medium text-text-muted">Optional</span>}
        </h2>
        {hint && <p className="text-xs text-text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

/** Live summary on the right that fills in as the customer answers. */
function WorkspacePreview({ a, agentName }: { a: Answers; agentName: string }) {
  const industry = a.industry === 'Other' ? a.industryOther : a.industry
  const initials = (a.company.trim() || 'Your company').split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const empty = 'rounded-md bg-surface-high text-transparent select-none'
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-[0_24px_60px_-30px_color-mix(in_srgb,var(--color-primary)_45%,transparent)]">
      <div className="relative h-24 bg-[radial-gradient(120%_140%_at_0%_0%,color-mix(in_srgb,var(--color-primary)_55%,transparent),transparent_60%),radial-gradient(120%_140%_at_100%_100%,color-mix(in_srgb,var(--color-cyan)_45%,transparent),transparent_55%)]">
        <span className="absolute -bottom-7 left-6 flex h-14 w-14 items-center justify-center rounded-2xl border-4 border-surface bg-primary font-display text-lg font-bold text-white">
          {initials}
        </span>
      </div>
      <div className="px-6 pb-6 pt-10">
        <p className="font-display text-xl font-semibold tracking-tight">{a.company.trim() || 'Your company'}</p>
        <p className="mt-1 text-sm text-text-muted">
          {industry || <span className={empty}>Industry here</span>}
          {a.companySize && <> · {a.companySize === 'Just me' ? 'Just you' : `${a.companySize} people`}</>}
        </p>

        <div className="mt-5 rounded-2xl border border-border bg-bg/60 p-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_30%,var(--color-primary),var(--color-cyan))]">
              <Icon name="graphic_eq" className="text-[20px] text-white" />
            </span>
            <div>
              <p className="text-sm font-bold">{agentName}</p>
              <p className="text-xs text-text-muted">Your AI voice agent</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {a.languages.length ? (
              a.languages.map((l) => (
                <span key={l} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">{l}</span>
              ))
            ) : (
              <span className="text-xs text-text-muted">Languages will show here</span>
            )}
          </div>
        </div>

        <p className="mt-5 text-[11px] font-bold uppercase tracking-widest text-text-muted">Will handle</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {a.useCases.length ? (
            a.useCases.map((u) => (
              <li key={u} className="flex items-center gap-2 text-sm">
                <Icon name="check_circle" className="text-[16px] text-success" /> {u}
              </li>
            ))
          ) : (
            <li className="text-xs text-text-muted">Pick what it should do in Goals</li>
          )}
        </ul>
        {a.callVolume && (
          <p className="mt-4 flex items-center gap-2 text-sm text-text-muted">
            <Icon name="call" className="text-[16px] text-primary" /> {a.callVolume} calls a month
          </p>
        )}
      </div>
    </div>
  )
}

export function Onboarding() {
  const { user, setUser, logout } = useAuth()
  const navigate = useNavigate()

  const needsPhone = !user?.phone
  // Password sign-ups answered "How did you hear about us?" on the signup
  // form; Google and GitHub sign-ups never saw it.
  const needsReferral = (user?.authProvider || 'password') !== 'password'
  const needsConsent = !!user && !user.consent.accepted

  const initial = useMemo<Answers>(() => {
    const fromPhone = user?.phone?.match(/^\+\d+/)?.[0]
    const base: Answers = {
      role: '', roleOther: '',
      dialCode: dialCodeFor(guessCountry()), phoneNumber: '',
      referralSource: '',
      company: user?.accountName ?? '', website: '',
      industry: '', industryOther: '', companySize: '',
      // The calling code they picked at signup beats any browser guess.
      country: (fromPhone && countryForDialCode(fromPhone)) || guessCountry(),
      useCases: [], useCaseOther: '', channels: [], languages: [],
      callVolume: '', currentSolution: '', timeline: '',
    }
    if (!user) return base
    try {
      const saved = localStorage.getItem(draftKey(user.id))
      return saved ? { ...base, ...(JSON.parse(saved) as Partial<Answers>) } : base
    } catch {
      return base
    }
  }, [user])

  const [a, setA] = useState<Answers>(initial)
  const [step, setStep] = useState<StepId>(() => {
    try {
      const saved = user ? localStorage.getItem(`${draftKey(user.id)}-step`) : null
      return STEPS.some((s) => s.id === saved) ? (saved as StepId) : 'you'
    } catch {
      return 'you'
    }
  })
  const [moreOpen, setMoreOpen] = useState(false)
  const [consent, setConsent] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [agent, setAgent] = useState<AgentConfig | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (!user) return
    try {
      localStorage.setItem(draftKey(user.id), JSON.stringify(a))
      localStorage.setItem(`${draftKey(user.id)}-step`, step)
    } catch {
      // A draft that cannot be saved only costs a reload's worth of typing.
    }
  }, [a, step, user])

  useEffect(() => {
    fetchAgents()
      .then((list) => setAgent(list[0] ?? null))
      .catch(() => setAgent(null))
  }, [])

  const set = <K extends keyof Answers>(key: K, value: Answers[K]) => setA((prev) => ({ ...prev, [key]: value }))
  const toggle = (key: 'useCases' | 'channels' | 'languages', value: string) =>
    setA((prev) => ({ ...prev, [key]: prev[key].includes(value) ? prev[key].filter((v) => v !== value) : [...prev[key], value] }))

  const phoneDigits = a.phoneNumber.replace(/\D/g, '')
  const missing: Record<StepId, string[]> = {
    you: [
      (!a.role || (a.role === 'Other' && !a.roleOther.trim())) && 'role',
      needsPhone && phoneDigits.length < 6 && 'phone',
      needsReferral && !a.referralSource && 'referral',
    ].filter(Boolean) as string[],
    business: [
      !a.company.trim() && 'company',
      (!a.industry || (a.industry === 'Other' && !a.industryOther.trim())) && 'industry',
      !a.companySize && 'size',
    ].filter(Boolean) as string[],
    goals: [
      a.useCases.length === 0 && 'uses',
      a.languages.length === 0 && 'languages',
      !a.callVolume && 'volume',
    ].filter(Boolean) as string[],
    finish: [needsConsent && !consent && 'consent'].filter(Boolean) as string[],
  }
  const err = (key: string) => showErrors && missing[step].includes(key)
  const index = STEPS.findIndex((s) => s.id === step)

  const next = () => {
    if (missing[step].length) {
      setShowErrors(true)
      return
    }
    setShowErrors(false)
    setStep(STEPS[index + 1].id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const back = () => {
    setShowErrors(false)
    setStep(STEPS[index - 1].id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const finish = async () => {
    if (!user) return
    if (missing.finish.length) {
      setShowErrors(true)
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      if (needsConsent) setUser((await apiAcceptConsent(user.consent.currentVersion)).user)
      // No separate country question: the phone's calling code already says it.
      const country = (needsPhone ? countryForDialCode(a.dialCode) : undefined) || a.country
      const accountChanges = {
        ...(a.company.trim() !== user.accountName ? { name: a.company.trim() } : {}),
        ...(country !== user.accountCountry ? { country } : {}),
      }
      if (Object.keys(accountChanges).length) await apiUpdateAccount(accountChanges)
      const { user: updated } = await apiCompleteOnboarding({
        profile: {
          role: a.role,
          roleOther: a.role === 'Other' ? a.roleOther.trim() : '',
          phone: needsPhone && phoneDigits ? `${a.dialCode} ${a.phoneNumber.trim()}` : '',
          referralSource: needsReferral ? a.referralSource : '',
          website: a.website.trim(),
          industry: a.industry,
          industryOther: a.industry === 'Other' ? a.industryOther.trim() : '',
          companySize: a.companySize,
          useCases: a.useCases,
          useCaseOther: a.useCases.includes('Something else') ? a.useCaseOther.trim() : '',
          channels: a.channels,
          languages: a.languages,
          callVolume: a.callVolume,
          currentSolution: a.currentSolution,
          timeline: a.timeline,
        },
        attribution: getAttribution(),
      })
      try {
        localStorage.removeItem(draftKey(user.id))
        localStorage.removeItem(`${draftKey(user.id)}-step`)
      } catch {
        // Nothing to clean up.
      }
      setUser(updated)
      navigate('/dashboard', { replace: true })
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Enter moves forward, like most premium onboarding flows.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || testing || saving) return
      if ((e.target as HTMLElement)?.tagName === 'BUTTON') return
      e.preventDefault()
      if (step === 'finish') void finish()
      else next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!user) return null
  if (user.onboarded) return <Navigate to="/dashboard" replace />

  const firstName = (user.name || '').split(' ')[0]
  const agentName = agent?.name || 'Artha'
  const heading: Record<StepId, { title: string; sub: string }> = {
    you: { title: `Welcome${firstName ? `, ${firstName}` : ''}`, sub: "Let's set up your workspace. It takes about two minutes." },
    business: { title: 'Tell us about your business', sub: 'So we understand who you serve and can help you set up.' },
    goals: { title: 'What should your agent do?', sub: 'Choose everything that applies. You can change it later.' },
    finish: { title: 'Your workspace is ready', sub: `Talk to ${agentName} now, right in your browser. No phone number needed.` },
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Top bar: brand, step progress, sign out */}
      <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-4 sm:px-8">
          <div className="flex shrink-0 items-center gap-2">
            <img src={vistrowMark} alt="" className="h-8 w-8 rounded-lg" />
            <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">{BRAND.name}</span>
          </div>
          <ol className="flex flex-1 items-center justify-center gap-2" aria-label="Onboarding progress">
            {STEPS.map((s, i) => (
              <li key={s.id} className="flex flex-1 max-w-[150px] flex-col gap-1.5">
                <span className="h-1.5 overflow-hidden rounded-full bg-border">
                  <span
                    className="block h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: i < index ? '100%' : i === index ? '50%' : '0%' }}
                  />
                </span>
                <span className={`hidden text-[11px] font-bold uppercase tracking-wider md:block ${i <= index ? 'text-text' : 'text-text-muted'}`}>
                  {s.title}
                </span>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => void logout()} className="shrink-0 bg-transparent text-xs font-semibold text-text-muted hover:text-text">
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:py-14">
        <main key={step} className="auth-panel-in flex min-w-0 flex-col gap-9">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              Step {index + 1} of {STEPS.length}
            </p>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight sm:text-[44px] sm:leading-[1.08]">{heading[step].title}</h1>
            <p className="mt-3 text-lg text-text-muted">{heading[step].sub}</p>
          </div>

          {step === 'you' && (
            <>
              <Question label="What's your role?" error={err('role')}>
                <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                  {ROLES.map((r) => (
                    <OptionCard key={r.label} option={r} selected={a.role === r.label} onClick={() => set('role', r.label)} />
                  ))}
                </div>
                {a.role === 'Other' && (
                  <input className={inputCls} placeholder="Your role" value={a.roleOther} onChange={(e) => set('roleOther', e.target.value)} autoFocus />
                )}
              </Question>
              {needsPhone && (
                <Question label="Phone number" hint="For setup help and account alerts" error={err('phone')}>
                  <div className="flex gap-2">
                    <select
                      value={a.dialCode}
                      onChange={(e) => set('dialCode', e.target.value)}
                      aria-label="Country code"
                      className="rounded-xl border border-border bg-surface px-3 text-[15px] outline-none focus:border-primary"
                    >
                      {COMMON_DIAL_CODES.map((c) => (
                        <option key={c.dial} value={c.dial}>{c.code} {c.dial}</option>
                      ))}
                    </select>
                    <input
                      className={inputCls}
                      type="tel"
                      inputMode="numeric"
                      placeholder="98765 43210"
                      value={a.phoneNumber}
                      onChange={(e) => set('phoneNumber', e.target.value)}
                    />
                  </div>
                </Question>
              )}
              {needsReferral && (
                <Question label="How did you hear about us?" error={err('referral')}>
                  <Pills options={REFERRAL_SOURCES} value={a.referralSource} onPick={(v) => set('referralSource', v)} />
                </Question>
              )}
            </>
          )}

          {step === 'business' && (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <Question label="Company name" error={err('company')}>
                  <input className={inputCls} value={a.company} onChange={(e) => set('company', e.target.value)} placeholder="Sunrise Realty" />
                </Question>
                <Question label="Website" optional>
                  <input className={inputCls} value={a.website} onChange={(e) => set('website', e.target.value)} placeholder="sunriserealty.in" />
                </Question>
              </div>
              <Question label="Industry" error={err('industry')}>
                <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                  {INDUSTRIES.map((i) => (
                    <OptionCard key={i.label} option={i} selected={a.industry === i.label} onClick={() => set('industry', i.label)} />
                  ))}
                </div>
                {a.industry === 'Other' && (
                  <input className={inputCls} placeholder="Your industry" value={a.industryOther} onChange={(e) => set('industryOther', e.target.value)} autoFocus />
                )}
              </Question>
              <Question label="Team size" error={err('size')}>
                <Segmented options={COMPANY_SIZES} value={a.companySize} onPick={(v) => set('companySize', v)} />
              </Question>
            </>
          )}

          {step === 'goals' && (
            <>
              <Question label="What should it do?" hint="Pick one or more" error={err('uses')}>
                <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                  {USE_CASES.map((u) => (
                    <OptionCard key={u.label} option={u} check selected={a.useCases.includes(u.label)} onClick={() => toggle('useCases', u.label)} />
                  ))}
                </div>
                {a.useCases.includes('Something else') && (
                  <input className={inputCls} placeholder="What else should it do?" value={a.useCaseOther} onChange={(e) => set('useCaseOther', e.target.value)} />
                )}
              </Question>
              <Question label="Languages your callers speak" hint="Pick one or more" error={err('languages')}>
                <Pills options={LANGUAGES} value={a.languages} onPick={(v) => toggle('languages', v)} />
              </Question>
              <Question label="Calls per month" error={err('volume')}>
                <Segmented options={CALL_VOLUMES} value={a.callVolume} onPick={(v) => set('callVolume', v)} />
              </Question>

              {/* Nice-to-have details: collapsed, and skippable. */}
              <div className="rounded-2xl border border-dashed border-border">
                <button
                  type="button"
                  onClick={() => setMoreOpen((o) => !o)}
                  aria-expanded={moreOpen}
                  className="flex w-full items-center justify-between gap-3 bg-transparent px-5 py-4 text-left"
                >
                  <span>
                    <span className="block text-sm font-bold">A few more details</span>
                    <span className="block text-xs text-text-muted">Optional. Helps us tailor your setup. Skip if you like.</span>
                  </span>
                  <Icon name={moreOpen ? 'expand_less' : 'expand_more'} className="text-[22px] text-text-muted" />
                </button>
                {moreOpen && (
                  <div className="flex flex-col gap-7 border-t border-dashed border-border px-5 py-5">
                    <Question label="Where will it talk to customers?" optional>
                      <Pills options={CHANNELS} value={a.channels} onPick={(v) => toggle('channels', v)} />
                    </Question>
                    <Question label="How do you handle these calls today?" optional>
                      <Pills options={CURRENT_SOLUTIONS} value={a.currentSolution} onPick={(v) => set('currentSolution', a.currentSolution === v ? '' : v)} />
                    </Question>
                    <Question label="When do you want to go live?" optional>
                      <Pills options={TIMELINES} value={a.timeline} onPick={(v) => set('timeline', a.timeline === v ? '' : v)} />
                    </Question>
                  </div>
                )}
              </div>
            </>
          )}

          {step === 'finish' && (
            <>
              <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-surface p-6">
                <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
                <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
                  <span className="glow-pulse flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_30%,var(--color-primary),var(--color-cyan))]">
                    <Icon name="graphic_eq" className="text-[30px] text-white" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg font-semibold">Meet {agentName}</p>
                    <p className="text-sm text-text-muted">
                      Speaks {a.languages.slice(0, 3).join(', ') || 'Hindi and English'} and switches language mid-call.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTesting(true)}
                    disabled={!agent}
                    className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-[0_10px_24px_-10px_var(--color-primary)] hover:brightness-105 disabled:opacity-50"
                  >
                    <Icon name="mic" className="text-[18px]" /> Talk to {agentName}
                  </button>
                </div>
              </div>
              <ul className="grid gap-2.5 sm:grid-cols-3">
                {[
                  ['auto_awesome', 'Personalise your agent', 'Voice, language and script'],
                  ['menu_book', 'Add your knowledge', 'Website, PDFs and FAQs'],
                  ['call', 'Go live', 'Phone number or website'],
                ].map(([icon, t, s]) => (
                  <li key={t} className="rounded-2xl border border-border bg-surface p-4">
                    <Icon name={icon} className="text-[20px] text-primary" />
                    <p className="mt-2 text-sm font-bold">{t}</p>
                    <p className="text-xs text-text-muted">{s}</p>
                  </li>
                ))}
              </ul>
              {needsConsent && (
                <label
                  className={`flex items-start gap-3 rounded-2xl border p-4 text-sm text-text-muted ${
                    err('consent') ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-surface'
                  }`}
                >
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]" />
                  <span>
                    I agree to the{' '}
                    <Link to="/terms" target="_blank" className="font-semibold text-primary hover:underline">Terms of Service</Link> and{' '}
                    <Link to="/privacy" target="_blank" className="font-semibold text-primary hover:underline">Privacy Policy</Link>, including that
                    calls may be transcribed and recorded to provide the service.
                  </span>
                </label>
              )}
            </>
          )}

          {showErrors && missing[step].length > 0 && (
            <p role="alert" className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <Icon name="error" className="text-[18px]" /> Please answer the questions marked in red.
            </p>
          )}
          {saveError && (
            <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{saveError}</p>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border pt-6">
            {index > 0 ? (
              <button type="button" onClick={back} className="flex items-center gap-1.5 bg-transparent text-sm font-bold text-text-muted hover:text-text">
                <Icon name="arrow_back" className="text-[18px]" /> Back
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-4">
              <span className="hidden text-xs text-text-muted sm:inline">
                Press <kbd className="rounded-md border border-border bg-surface px-1.5 py-0.5 font-sans font-bold">Enter</kbd>
              </span>
              {step === 'finish' ? (
                <button
                  type="button"
                  onClick={() => void finish()}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-sm font-extrabold text-white shadow-[0_12px_28px_-12px_var(--color-primary)] hover:brightness-105 disabled:opacity-60"
                >
                  {saving ? 'Setting up…' : 'Go to my dashboard'} <Icon name="arrow_forward" className="text-[18px]" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={next}
                  className="flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-sm font-extrabold text-white shadow-[0_12px_28px_-12px_var(--color-primary)] hover:brightness-105"
                >
                  Continue <Icon name="arrow_forward" className="text-[18px]" />
                </button>
              )}
            </div>
          </div>
        </main>

        <aside className="hidden lg:block">
          <div className="sticky top-28 flex flex-col gap-4">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Your workspace</p>
            <WorkspacePreview a={a} agentName={agentName} />
            <p className="flex items-center gap-2 text-xs text-text-muted">
              <Icon name="lock" className="text-[14px]" /> Your answers are private and only used to set up and support your account.
            </p>
          </div>
        </aside>
      </div>

      {testing && agent && <BrowserTestModal agent={agent} onClose={() => setTesting(false)} />}
    </div>
  )
}

export default Onboarding
