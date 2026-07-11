import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useAuth } from '../lib/auth'
import { AuthShell, SocialButtons } from './AuthShell'

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

export function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ name: '', company: '', email: '', password: '' })
  const [agreed, setAgreed] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const strength = passwordStrength(form.password)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (!agreed) {
      setError('Please agree to the Terms of Service and Privacy Policy.')
      return
    }
    setBusy(true)
    try {
      await signup(form)
      // Phase 4 will route new signups through onboarding first.
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
      features={['Go live in minutes', '30+ Indian languages', 'Every call logged & analyzed']}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border-l-[3px] border-destructive bg-surface-high px-3 py-2 text-sm text-text">
            <Icon name="error" className="text-[16px] text-destructive" />
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Your name">
            <input
              required
              value={form.name}
              onChange={set('name')}
              autoFocus
              placeholder="Abhi Sharma"
              className="w-full rounded-lg border border-border bg-surface-high px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="Company">
            <input
              required
              value={form.company}
              onChange={set('company')}
              placeholder="Acme Realty"
              className="w-full rounded-lg border border-border bg-surface-high px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
        </div>
        <Field label="Work email">
          <input
            type="email"
            required
            value={form.email}
            onChange={set('email')}
            placeholder="you@company.com"
            className="w-full rounded-lg border border-border bg-surface-high px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
        <Field label="Password">
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              required
              value={form.password}
              onChange={set('password')}
              placeholder="At least 8 characters"
              className="w-full rounded-lg border border-border bg-surface-high px-3 py-2.5 pr-10 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              title={showPw ? 'Hide password' : 'Show password'}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:text-text"
            >
              <Icon name={showPw ? 'visibility_off' : 'visibility'} className="text-[18px]" />
            </button>
          </div>
          {form.password && (
            <div className="mt-1 flex items-center gap-2">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`h-1 flex-1 rounded-full ${i < strength.score ? STRENGTH_COLORS[strength.score] : 'bg-border'}`}
                  />
                ))}
              </div>
              <span className="text-[10px] text-text-muted">{strength.label}</span>
            </div>
          )}
        </Field>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-text-muted">{label}</span>
      {children}
    </label>
  )
}
