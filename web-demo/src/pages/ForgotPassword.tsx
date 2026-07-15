import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { apiRequestPasswordReset } from '../lib/auth'
import { AuthShell } from './AuthShell'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      // Always resolves — the endpoint never reveals whether the email exists.
      await apiRequestPasswordReset(email)
    } catch {
      // Ignore; we show the same neutral confirmation either way.
    } finally {
      setBusy(false)
      setSent(true)
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a secure link to set a new one."
      headline={
        <>
          Locked out? <span className="text-primary">No problem.</span>
        </>
      }
      features={['Answer & qualify calls 24/7', '10 Indian languages', 'Every call logged & analyzed']}
    >
      {sent ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-high p-4 text-sm">
            <Icon name="mark_email_read" className="text-[18px] text-cyan" />
            <span>
              If an account exists for <span className="font-semibold text-text">{email}</span>, a password-reset
              link is on its way. It's valid for one hour.
            </span>
          </div>
          <Link to="/login" className="text-center text-sm font-semibold text-cyan hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-text-muted">Work email</span>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-lg border border-border bg-surface-high px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="mt-1 flex items-center justify-center rounded-lg bg-primary py-2.5 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
            >
              {busy ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-bg border-t-transparent" />
              ) : (
                'Send reset link'
              )}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-text-muted">
            Remembered it?{' '}
            <Link to="/login" className="font-semibold text-cyan hover:underline">
              Sign in
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  )
}
