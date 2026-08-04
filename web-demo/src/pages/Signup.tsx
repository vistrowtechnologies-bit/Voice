import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useAuth } from '../lib/auth'
import { AuthInput, AuthShell, PasswordVisibilityToggle, SocialButtons, useShake } from './AuthShell'

// Cheap client-side password strength: length + character-class variety.
// Purely for the meter/feedback — the server enforces the 8-char minimum.
function passwordStrength(pw: string): { score: number; label: string } {
  if (!pw) return { score: 0, label: '' }
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  score = Math.min(4, score)
  return { score, label: ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][score] }
}

const STRENGTH_COLORS = ['bg-border', 'bg-destructive', 'bg-amber', 'bg-cyan', 'bg-success']

// Pure marketing attribution, but required — matches the competitor field
// set + validation this was modeled on.
const REFERRAL_SOURCES = [
  'Google Ad',
  'Facebook Ad',
  'LinkedIn',
  'Twitter / X',
  'Friend / Colleague',
  'YouTube',
  'Blog / Article',
  'Product Hunt',
  'Other',
]

// Common dial codes, India first since that's this product's core market.
// Phone is plain data collection only — email is the verified identity here,
// so there's no OTP flow attached to this field.
const DIAL_CODES = [
  { code: 'IN', dial: '+91' },
  { code: 'US', dial: '+1' },
  { code: 'GB', dial: '+44' },
  { code: 'AE', dial: '+971' },
  { code: 'SG', dial: '+65' },
  { code: 'AU', dial: '+61' },
  { code: 'CA', dial: '+1' },
]

export function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    name: '',
    company: '',
    email: '',
    password: '',
    referral_source: '',
    phoneNumber: '',
  })
  const [dialCode, setDialCode] = useState('+91')
  const [agreed, setAgreed] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [referralError, setReferralError] = useState(false)
  const [busy, setBusy] = useState(false)
  const shake = useShake(error)

  const strength = passwordStrength(form.password)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setReferralError(false)
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (!form.referral_source) {
      setReferralError(true)
      return
    }
    if (!agreed) {
      setError('Please agree to the Terms of Service and Privacy Policy.')
      return
    }
    setBusy(true)
    try {
      const { phoneNumber, ...rest } = form
      await signup({ ...rest, phone: phoneNumber ? `${dialCode} ${phoneNumber}` : '' })
      // DashboardLayout shows the onboarding modal automatically for any
      // account that hasn't completed it yet — no special-case route here.
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start your free trial — no credit card required."
      headline={
        <>
          Intelligence in the <span className="text-primary">Dark.</span>
        </>
      }
      features={['Go live in minutes', '11 Indian languages', 'Every call logged & analyzed']}
    >
      <form onSubmit={submit} className={`flex flex-col gap-4 ${shake ? 'auth-shake' : ''}`}>
        {error && (
          <div className="flex items-center gap-2 rounded-lg border-l-[3px] border-destructive bg-surface-high px-3 py-2 text-sm text-text">
            <Icon name="error" className="text-[16px] text-destructive" />
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <AuthInput label="Your name" required value={form.name} onChange={set('name')} autoFocus error={!!error} />
          <AuthInput label="Company" required value={form.company} onChange={set('company')} error={!!error} />
        </div>
        <AuthInput label="Work email" type="email" required value={form.email} onChange={set('email')} error={!!error} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone-number" className="text-xs font-medium text-text-muted">
            Phone Number
          </label>
          <div className="flex gap-2">
            <select
              value={dialCode}
              onChange={(e) => setDialCode(e.target.value)}
              aria-label="Country dial code"
              className="rounded-lg border border-border bg-surface-high px-2 text-sm text-text outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
            >
              {DIAL_CODES.map((c) => (
                <option key={c.code} value={c.dial}>
                  {c.code} {c.dial}
                </option>
              ))}
            </select>
            <input
              id="phone-number"
              type="tel"
              inputMode="numeric"
              placeholder="9876543210"
              value={form.phoneNumber}
              onChange={set('phoneNumber')}
              className="w-full rounded-lg border border-border bg-surface-high px-3 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
        </div>
        <div>
          <AuthInput
            label="Password"
            type={showPw ? 'text' : 'password'}
            required
            value={form.password}
            onChange={set('password')}
            error={!!error}
            trailing={<PasswordVisibilityToggle shown={showPw} onToggle={() => setShowPw((v) => !v)} />}
          />
          {form.password && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${i < strength.score ? STRENGTH_COLORS[strength.score] : 'bg-border'}`}
                  />
                ))}
              </div>
              <span className="text-[10px] text-text-muted">{strength.label}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="referral-source" className="text-xs font-medium text-text-muted">
            How did you hear about us?
          </label>
          <select
            id="referral-source"
            value={form.referral_source}
            onChange={(e) => {
              setReferralError(false)
              set('referral_source')(e)
            }}
            className={`w-full rounded-lg border bg-surface-high px-3 py-2.5 text-sm text-text outline-none transition-colors focus:ring-2 ${
              referralError ? 'border-destructive focus:ring-destructive/20' : 'border-border focus:border-primary focus:ring-primary/15'
            }`}
          >
            <option value="">Select an option</option>
            {REFERRAL_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {referralError && <span className="text-xs text-destructive">Please tell us how you heard about us.</span>}
        </div>
        <label className="flex items-start gap-2 text-xs text-text-muted">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
          <span>
            I agree to the{' '}
            <Link to="/terms" className="text-cyan hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="text-cyan hover:underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
        >
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-bg border-t-transparent" /> : 'Get started'}
        </button>
      </form>
      <SocialButtons />
      <p className="mt-6 text-center text-sm text-text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-cyan hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  )
}
