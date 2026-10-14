import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { BrowserTestModal } from '../components/AgentTestCall'
import { Icon } from '../components/Icon'
import { fetchAgents } from '../lib/api'
import { getAttribution } from '../lib/attribution'
import { apiAcceptConsent, apiCompleteOnboarding, apiUpdateAccount, useAuth } from '../lib/auth'
import { BRAND } from '../lib/brand'
import { COMMON_DIAL_CODES, COUNTRY_OPTIONS, countryForDialCode, dialCodeFor, guessCountry } from '../lib/phone'
import type { AgentConfig } from '../lib/types'
import vistrowMark from '../assets/vistrow-mark.png'

// Full-page onboarding every new workspace completes before the dashboard
// opens (RequireAuth sends un-onboarded users here). The answers land on the
// account (accounts.onboarding_profile) and show in the admin panel.

type StepId = 'you' | 'business' | 'goals' | 'finish'

const STEPS: { id: StepId; title: string; hint: string }[] = [
  { id: 'you', title: 'About you', hint: 'Your role and how to reach you' },
  { id: 'business', title: 'Your business', hint: 'Company, industry and size' },
  { id: 'goals', title: 'Your goals', hint: 'What your AI agent should do' },
  { id: 'finish', title: 'Ready to go', hint: 'Meet your agent' },
]

const ROLES = ['Founder / Owner', 'Sales', 'Marketing', 'Customer support / Operations', 'Developer / Technical', 'Agency / Consultant', 'Other']
const REFERRAL_SOURCES = ['Google search', 'Google Ad', 'Facebook / Instagram Ad', 'LinkedIn', 'YouTube', 'Friend / Colleague', 'Blog / Article', 'Twitter / X', 'Product Hunt', 'Other']
const INDUSTRIES = [
  'Real estate', 'Healthcare & clinics', 'Education', 'Banking, finance & lending', 'Insurance',
  'E-commerce & retail', 'Travel & hospitality', 'Automotive', 'Marketing / agency', 'Other',
]
const COMPANY_SIZES = ['Just me', '2–10', '11–50', '51–200', '201–1,000', '1,000+']
const USE_CASES: { label: string; icon: string }[] = [
  { label: 'Answer inbound calls', icon: 'call_received' },
  { label: 'Qualify leads', icon: 'trending_up' },
  { label: 'Follow-up & outbound calls', icon: 'call_made' },
  { label: 'Book appointments', icon: 'event' },
  { label: 'Customer support', icon: 'support_agent' },
  { label: 'Payment reminders', icon: 'payments' },
  { label: 'Website voice assistant', icon: 'widgets' },
  { label: 'Something else', icon: 'more_horiz' },
]
const CHANNELS = ['Phone calls', 'My website']
const LANGUAGES = ['Hindi', 'English', 'Marathi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Gujarati', 'Bengali', 'Punjabi', 'Odia', 'Other']
const CALL_VOLUMES = ['Under 500', '500–2,000', '2,000–10,000', '10,000–50,000', '50,000+', 'Not sure yet']
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

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${
        selected ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface text-text-muted hover:border-primary/50 hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}

function Question({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <p className="text-sm font-bold">
          {label}
          {!required && <span className="ml-1.5 text-xs font-medium text-text-muted">(optional)</span>}
        </p>
        {hint && <p className="mt-0.5 text-xs text-text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

const inputCls =
  'w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/15'

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
  const [step, setStep] = useState<StepId>('you')
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
    } catch {
      // A draft that cannot be saved only costs a reload's worth of typing.
    }
  }, [a, user])

  useEffect(() => {
    fetchAgents()
      .then((list) => setAgent(list[0] ?? null))
      .catch(() => setAgent(null))
  }, [])

  if (!user) return null
  if (user.onboarded) return <Navigate to="/dashboard" replace />

  const set = <K extends keyof Answers>(key: K, value: Answers[K]) => setA((prev) => ({ ...prev, [key]: value }))
  const toggle = (key: 'useCases' | 'channels' | 'languages', value: string) =>
    setA((prev) => ({ ...prev, [key]: prev[key].includes(value) ? prev[key].filter((v) => v !== value) : [...prev[key], value] }))

  const phoneDigits = a.phoneNumber.replace(/\D/g, '')
  const missing: Record<StepId, string[]> = {
    you: [
      !a.role && 'your role',
      a.role === 'Other' && !a.roleOther.trim() && 'your role',
      needsPhone && phoneDigits.length < 6 && 'a phone number',
      needsReferral && !a.referralSource && 'how you heard about us',
    ].filter(Boolean) as string[],
    business: [
      !a.company.trim() && 'your company name',
      !a.industry && 'your industry',
      a.industry === 'Other' && !a.industryOther.trim() && 'your industry',
      !a.companySize && 'your company size',
    ].filter(Boolean) as string[],
    goals: [
      a.useCases.length === 0 && 'at least one use',
      a.channels.length === 0 && 'where calls happen',
      a.languages.length === 0 && 'at least one language',
      !a.callVolume && 'your call volume',
      !a.timeline && 'when you want to go live',
    ].filter(Boolean) as string[],
    finish: [needsConsent && !consent && 'agreement to the Terms'].filter(Boolean) as string[],
  }
  const index = STEPS.findIndex((s) => s.id === step)

  const next = () => {
    if (missing[step].length) {
      setShowErrors(true)
      return
    }
    setShowErrors(false)
    setStep(STEPS[index + 1].id)
    window.scrollTo({ top: 0 })
  }
  const back = () => {
    setShowErrors(false)
    setStep(STEPS[index - 1].id)
    window.scrollTo({ top: 0 })
  }

  const finish = async () => {
    if (missing.finish.length) {
      setShowErrors(true)
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      if (needsConsent) setUser((await apiAcceptConsent(user.consent.currentVersion)).user)
      const accountChanges = {
        ...(a.company.trim() !== user.accountName ? { name: a.company.trim() } : {}),
        ...(a.country !== user.accountCountry ? { country: a.country } : {}),
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

  const firstName = (user.name || '').split(' ')[0]

  return (
    <div className="flex min-h-screen bg-bg text-text">
      {/* Step rail - desktop */}
      <aside className="sticky top-0 hidden h-screen w-[340px] shrink-0 flex-col justify-between overflow-hidden border-r border-border bg-surface p-8 lg:flex">
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <img src={vistrowMark} alt="" className="h-9 w-9 rounded-lg" />
            <span className="text-lg font-semibold tracking-tight">{BRAND.name}</span>
          </div>
          <p className="mt-10 text-xs font-bold uppercase tracking-widest text-text-muted">Set up your workspace</p>
          <ol className="mt-5 flex flex-col gap-1">
            {STEPS.map((s, i) => {
              const done = i < index
              const active = i === index
              return (
                <li key={s.id} className={`flex items-start gap-3 rounded-xl px-3 py-3 ${active ? 'bg-primary/10' : ''}`}>
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      done ? 'bg-success text-white' : active ? 'bg-primary text-white' : 'border border-border text-text-muted'
                    }`}
                  >
                    {done ? <Icon name="check" className="text-[16px]" /> : i + 1}
                  </span>
                  <span>
                    <span className={`block text-sm font-bold ${active ? 'text-primary' : done ? 'text-text' : 'text-text-muted'}`}>{s.title}</span>
                    <span className="block text-xs text-text-muted">{s.hint}</span>
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
        <div className="relative z-10 rounded-2xl border border-border bg-bg/60 p-4 text-sm text-text-muted">
          <p className="font-bold text-text">Why we ask</p>
          <p className="mt-1">Your answers set up your first agent and tell our team how to help. It takes about two minutes.</p>
        </div>
        <div
          className="pointer-events-none absolute -bottom-32 -left-16 h-[26rem] w-[26rem] rounded-full opacity-30 blur-[110px]"
          style={{ background: 'radial-gradient(circle, #a855f7, transparent 70%)' }}
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-10">
          <div className="flex items-center gap-2 lg:hidden">
            <img src={vistrowMark} alt="" className="h-8 w-8 rounded-lg" />
            <span className="text-sm font-semibold">{BRAND.name}</span>
          </div>
          <p className="hidden text-sm text-text-muted lg:block">
            Step {index + 1} of {STEPS.length}
          </p>
          <button type="button" onClick={() => void logout()} className="bg-transparent text-xs font-semibold text-text-muted hover:text-text">
            Sign out
          </button>
        </header>
        {/* Progress - mobile */}
        <div className="flex gap-1.5 px-5 pt-4 lg:hidden">
          {STEPS.map((s, i) => (
            <span key={s.id} className={`h-1 flex-1 rounded-full ${i <= index ? 'bg-primary' : 'bg-border'}`} />
          ))}
        </div>

        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-8 sm:px-10 sm:py-12">
          {step === 'you' && (
            <>
              <div>
                <h1 className="font-display text-3xl font-bold tracking-tight">Welcome{firstName ? `, ${firstName}` : ''}!</h1>
                <p className="mt-2 text-text-muted">Tell us a little about yourself.</p>
              </div>
              <Question label="What's your role?" required>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map((r) => (
                    <Chip key={r} selected={a.role === r} onClick={() => set('role', r)}>{r}</Chip>
                  ))}
                </div>
                {a.role === 'Other' && (
                  <input className={inputCls} placeholder="Your role" value={a.roleOther} onChange={(e) => set('roleOther', e.target.value)} />
                )}
              </Question>
              {needsPhone && (
                <Question label="Your phone number" hint="For setup help and important account alerts." required>
                  <div className="flex gap-2">
                    <select
                      value={a.dialCode}
                      onChange={(e) => set('dialCode', e.target.value)}
                      aria-label="Country code"
                      className="rounded-xl border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
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
                <Question label="How did you hear about us?" required>
                  <div className="flex flex-wrap gap-2">
                    {REFERRAL_SOURCES.map((r) => (
                      <Chip key={r} selected={a.referralSource === r} onClick={() => set('referralSource', r)}>{r}</Chip>
                    ))}
                  </div>
                </Question>
              )}
            </>
          )}

          {step === 'business' && (
            <>
              <div>
                <h1 className="font-display text-3xl font-bold tracking-tight">About your business</h1>
                <p className="mt-2 text-text-muted">We use this to tailor your agent and its sample scripts.</p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Question label="Company name" required>
                  <input className={inputCls} value={a.company} onChange={(e) => set('company', e.target.value)} placeholder="Sunrise Realty" />
                </Question>
                <Question label="Website">
                  <input className={inputCls} value={a.website} onChange={(e) => set('website', e.target.value)} placeholder="sunriserealty.in" />
                </Question>
              </div>
              <Question label="Industry" required>
                <div className="flex flex-wrap gap-2">
                  {INDUSTRIES.map((i) => (
                    <Chip key={i} selected={a.industry === i} onClick={() => set('industry', i)}>{i}</Chip>
                  ))}
                </div>
                {a.industry === 'Other' && (
                  <input className={inputCls} placeholder="Your industry" value={a.industryOther} onChange={(e) => set('industryOther', e.target.value)} />
                )}
              </Question>
              <Question label="Company size" required>
                <div className="flex flex-wrap gap-2">
                  {COMPANY_SIZES.map((s) => (
                    <Chip key={s} selected={a.companySize === s} onClick={() => set('companySize', s)}>{s}</Chip>
                  ))}
                </div>
              </Question>
              <Question label="Country" hint="Phone numbers you type without a country code are read as this country." required>
                <select className={inputCls} value={a.country} onChange={(e) => set('country', e.target.value)}>
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>{c.name} ({c.dial})</option>
                  ))}
                </select>
              </Question>
            </>
          )}

          {step === 'goals' && (
            <>
              <div>
                <h1 className="font-display text-3xl font-bold tracking-tight">What should your AI agent do?</h1>
                <p className="mt-2 text-text-muted">Pick everything that applies.</p>
              </div>
              <Question label="Main uses" required>
                <div className="grid gap-2 sm:grid-cols-2">
                  {USE_CASES.map((u) => {
                    const on = a.useCases.includes(u.label)
                    return (
                      <button
                        key={u.label}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle('useCases', u.label)}
                        className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                          on ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface hover:border-primary/50'
                        }`}
                      >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${on ? 'bg-primary text-white' : 'bg-surface-high text-primary'}`}>
                          <Icon name={u.icon} className="text-[19px]" />
                        </span>
                        <span className="flex-1">{u.label}</span>
                        {on && <Icon name="check_circle" className="text-[18px]" />}
                      </button>
                    )
                  })}
                </div>
                {a.useCases.includes('Something else') && (
                  <input className={inputCls} placeholder="What else should it do?" value={a.useCaseOther} onChange={(e) => set('useCaseOther', e.target.value)} />
                )}
              </Question>
              <Question label="Where will it talk to customers?" required>
                <div className="flex flex-wrap gap-2">
                  {CHANNELS.map((c) => (
                    <Chip key={c} selected={a.channels.includes(c)} onClick={() => toggle('channels', c)}>{c}</Chip>
                  ))}
                </div>
              </Question>
              <Question label="Languages your callers speak" required>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map((l) => (
                    <Chip key={l} selected={a.languages.includes(l)} onClick={() => toggle('languages', l)}>{l}</Chip>
                  ))}
                </div>
              </Question>
              <Question label="Calls per month" required>
                <div className="flex flex-wrap gap-2">
                  {CALL_VOLUMES.map((v) => (
                    <Chip key={v} selected={a.callVolume === v} onClick={() => set('callVolume', v)}>{v}</Chip>
                  ))}
                </div>
              </Question>
              <Question label="How do you handle these calls today?">
                <div className="flex flex-wrap gap-2">
                  {CURRENT_SOLUTIONS.map((c) => (
                    <Chip key={c} selected={a.currentSolution === c} onClick={() => set('currentSolution', a.currentSolution === c ? '' : c)}>{c}</Chip>
                  ))}
                </div>
              </Question>
              <Question label="When do you want to go live?" required>
                <div className="flex flex-wrap gap-2">
                  {TIMELINES.map((t) => (
                    <Chip key={t} selected={a.timeline === t} onClick={() => set('timeline', t)}>{t}</Chip>
                  ))}
                </div>
              </Question>
            </>
          )}

          {step === 'finish' && (
            <>
              <div>
                <h1 className="font-display text-3xl font-bold tracking-tight">You're ready, {firstName || 'welcome'}</h1>
                <p className="mt-2 text-text-muted">
                  Your workspace <span className="font-bold text-text">{a.company}</span> comes with a ready-to-call agent. Talk to it now in your
                  browser, no phone number needed.
                </p>
              </div>
              <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-center">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon name="smart_toy" className="text-[28px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{agent?.name || 'Your agent'}</p>
                  <p className="text-sm text-text-muted">Speaks {a.languages.slice(0, 3).join(', ') || 'Hindi and English'} and switches language mid-call.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setTesting(true)}
                  disabled={!agent}
                  className="flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-bold text-primary hover:bg-primary/20 disabled:opacity-50"
                >
                  <Icon name="mic" className="text-[18px]" /> Talk to it now
                </button>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-5">
                <p className="text-sm font-bold">Your setup</p>
                <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {[
                    ['Industry', a.industry === 'Other' ? a.industryOther : a.industry],
                    ['Company size', a.companySize],
                    ['Uses', a.useCases.join(', ')],
                    ['Languages', a.languages.join(', ')],
                    ['Calls per month', a.callVolume],
                    ['Go live', a.timeline],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <dt className="w-32 shrink-0 text-text-muted">{k}</dt>
                      <dd className="min-w-0 font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              {needsConsent && (
                <label className="flex items-start gap-2.5 text-sm text-text-muted">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
                  <span>
                    I agree to the{' '}
                    <Link to="/terms" target="_blank" className="font-semibold text-primary hover:underline">Terms of Service</Link> and{' '}
                    <Link to="/privacy" target="_blank" className="font-semibold text-primary hover:underline">Privacy Policy</Link>, including
                    that calls may be transcribed and recorded to provide the service.
                  </span>
                </label>
              )}
            </>
          )}

          {showErrors && missing[step].length > 0 && (
            <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Please add {missing[step].join(', ')}.
            </p>
          )}
          {saveError && (
            <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{saveError}</p>
          )}

          <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-6">
            {index > 0 ? (
              <button type="button" onClick={back} className="flex items-center gap-1.5 bg-transparent text-sm font-bold text-text-muted hover:text-text">
                <Icon name="arrow_back" className="text-[18px]" /> Back
              </button>
            ) : (
              <span />
            )}
            {step === 'finish' ? (
              <button
                type="button"
                onClick={() => void finish()}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-extrabold text-white hover:brightness-105 disabled:opacity-60"
              >
                {saving ? 'Setting up…' : 'Open my dashboard'} <Icon name="rocket_launch" className="text-[18px]" />
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-extrabold text-white hover:brightness-105"
              >
                Continue <Icon name="arrow_forward" className="text-[18px]" />
              </button>
            )}
          </div>
        </div>
      </main>

      {testing && agent && <BrowserTestModal agent={agent} onClose={() => setTesting(false)} />}
    </div>
  )
}

export default Onboarding
