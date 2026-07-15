import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { BRAND } from '../lib/brand'
import { useAuth } from '../lib/auth'
import { AuthShell, SocialButtons } from './AuthShell'

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: "Something went wrong signing you in with Google. Please try again.",
  oauth_unverified_email: "That Google account's email isn't verified — verify it with Google first.",
}

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const from = (location.state as { from?: string } | null)?.from || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const oauthError = searchParams.get('error')
  const [error, setError] = useState<string | null>(
    oauthError ? OAUTH_ERROR_MESSAGES[oauthError] || 'Sign-in failed. Please try again.' : null
  )
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle={`Sign in to your ${BRAND.name} dashboard.`}
      headline={
        <>
          Welcome back to <span className="text-primary">{BRAND.name}.</span>
        </>
      }
      features={['Answer & qualify calls 24/7', '10 Indian languages', 'Every call logged & analyzed']}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border-l-[3px] border-destructive bg-surface-high px-3 py-2 text-sm text-text">
            <Icon name="error" className="text-[16px] text-destructive" />
            {error}
          </div>
        )}
        <Field label="Work email">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            placeholder="you@company.com"
            className="w-full rounded-lg border border-border bg-surface-high px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-muted">Password</span>
            <Link to="/forgot-password" className="text-xs font-semibold text-cyan hover:underline">
              Forgot password?
            </Link>
          </span>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
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
        </label>
        <button
          type="submit"
          disabled={busy}
          className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
        >
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-bg border-t-transparent" /> : 'Sign in'}
        </button>
      </form>
      <SocialButtons />
      <p className="mt-6 text-center text-sm text-text-muted">
        New to {BRAND.name}?{' '}
        <Link to="/signup" className="font-semibold text-cyan hover:underline">
          Create an account
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
