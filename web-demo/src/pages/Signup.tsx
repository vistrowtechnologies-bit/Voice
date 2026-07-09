import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { BRAND } from '../lib/brand'
import { useAuth } from '../lib/auth'
import { AuthShell } from './AuthShell'

export function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ name: '', company: '', email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
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
    <AuthShell title={`Start with ${BRAND.name}`} subtitle="Create your workspace — no credit card required.">
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
          <input
            type="password"
            required
            value={form.password}
            onChange={set('password')}
            placeholder="At least 8 characters"
            className="w-full rounded-lg border border-border bg-surface-high px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
        <button
          type="submit"
          disabled={busy}
          className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
        >
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-bg border-t-transparent" /> : 'Create account'}
        </button>
      </form>
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
