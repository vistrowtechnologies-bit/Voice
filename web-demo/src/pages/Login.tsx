import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { BRAND } from '../lib/brand'
import { useAuth } from '../lib/auth'
import { AuthInput, AuthShell, PasswordVisibilityToggle, SocialButtons, useShake } from './AuthShell'

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: 'Something went wrong with social sign-in. Please try again.',
  oauth_unverified_email: "That account's email isn't verified. Verify it with your sign-in provider first.",
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
  const shake = useShake(error)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed'
      if (message.startsWith('Verify your email')) {
        navigate(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}&sent=0`)
      } else {
        setError(message)
      }
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
      features={['Answer & qualify calls 24/7', '10 Indian languages + English', 'Every call logged & analyzed']}
    >
      <form onSubmit={submit} className={`flex flex-col gap-4 ${shake ? 'auth-shake' : ''}`}>
        {error && (
          <div className="flex items-center gap-2 rounded-lg border-l-[3px] border-destructive bg-surface-high px-3 py-2 text-sm text-text">
            <Icon name="error" className="text-[16px] text-destructive" />
            {error}
          </div>
        )}
        <AuthInput
          label="Work email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          error={!!error}
        />
        <AuthInput
          label="Password"
          type={showPw ? 'text' : 'password'}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={!!error}
          topRight={
            <Link to="/forgot-password" className="text-xs font-semibold text-cyan hover:underline">
              Forgot password?
            </Link>
          }
          trailing={<PasswordVisibilityToggle shown={showPw} onToggle={() => setShowPw((v) => !v)} />}
        />
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
