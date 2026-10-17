import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { BRAND } from '../lib/brand'
import { SUPPORT_EMAIL } from '../lib/support'
import { useAuth } from '../lib/auth'
import { AuthInput, AuthShell, PasswordVisibilityToggle, SocialButtons, useShake } from './AuthShell'

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: 'Something went wrong with social sign-in. Please try again.',
  oauth_unverified_email: "That account's email isn't verified. Verify it with your sign-in provider first.",
}

const NEXT_KEY = 'vv-login-next'

/** Only a path inside this app ("/admin"), never another site: a crafted
 * link must not be able to send someone elsewhere after they sign in. */
function safeNext(path: unknown): string {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\') ? path : ''
}

export function Login() {
  const { login, verifyMfa } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  // Where to land after signing in: the page that sent them here, or ?next=
  // (e.g. /login?next=/admin). Kept for this tab so it survives the Google
  // round-trip and the two-step code step.
  const requested = safeNext((location.state as { from?: string } | null)?.from) || safeNext(searchParams.get('next'))
  useEffect(() => {
    if (!requested) return
    try { sessionStorage.setItem(NEXT_KEY, requested) } catch { /* storage blocked: this page load still knows it */ }
  }, [requested])
  const goNext = () => {
    let next = requested
    try {
      next = next || safeNext(sessionStorage.getItem(NEXT_KEY))
      sessionStorage.removeItem(NEXT_KEY)
    } catch { /* storage blocked */ }
    navigate(next || '/dashboard', { replace: true })
  }

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const oauthError = searchParams.get('error')
  const [error, setError] = useState<string | null>(
    oauthError ? OAUTH_ERROR_MESSAGES[oauthError] || 'Sign-in failed. Please try again.' : null
  )
  const [busy, setBusy] = useState(false)
  // Two-step login: after the password (or ?mfa=1 back from Google/GitHub).
  const [mfaStep, setMfaStep] = useState(searchParams.get('mfa') === '1')
  const [code, setCode] = useState('')
  const notice = searchParams.get('reset') === '1'
    ? 'Your password is changed. Sign in with it and your two-step code.'
    : null
  const shake = useShake(error)

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await verifyMfa(code.trim())
      goNext()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code didn’t work.')
      if (err instanceof Error && /timed out|sign in again/i.test(err.message)) setMfaStep(false)
    } finally {
      setBusy(false)
    }
  }

  if (mfaStep) {
    return (
      <AuthShell
        title="Enter your code"
        subtitle="Open your authenticator app and type the 6-digit code for Vistrow Voice."
        headline={<>One more step to <span className="text-primary">stay safe.</span></>}
        features={['Codes change every 30 seconds', 'Lost your phone? Use a recovery code', 'Each code works only once']}
      >
        <form onSubmit={submitCode} className={`flex flex-col gap-4 ${shake ? 'auth-shake' : ''}`}>
          {error && (
            <div className="flex items-center gap-2 rounded-lg border-l-[3px] border-destructive bg-surface-high px-3 py-2 text-sm text-text">
              <Icon name="error" className="text-[16px] text-destructive" />
              {error}
            </div>
          )}
          <AuthInput
            label="Authentication code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            autoComplete="one-time-code"
            inputMode={/[a-z]/i.test(code) ? 'text' : 'numeric'}
            maxLength={12}
            error={!!error}
          />
          <p className="-mt-2 text-xs text-text-muted">
            No phone? Type one of your recovery codes instead (like abcd-efgh). Lost both?{' '}
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Lost access to two-step login')}`}
              className="font-semibold text-primary hover:underline"
            >
              Email {SUPPORT_EMAIL}
            </a>{' '}
            from your account email and we'll reset it after checking it's you.
          </p>
          <button
            type="submit"
            disabled={busy || code.trim().length < 6}
            className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
          >
            {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-bg border-t-transparent" /> : 'Verify and sign in'}
          </button>
          <button type="button" onClick={() => { setMfaStep(false); setCode(''); setError(null) }} className="bg-transparent text-sm font-semibold text-text-muted hover:text-text">
            Back to sign in
          </button>
        </form>
      </AuthShell>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await login(email, password)
      if (result.mfaRequired) {
        setMfaStep(true)
        return
      }
      goNext()
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
        {notice && !error && (
          <div className="flex items-center gap-2 rounded-lg border-l-[3px] border-success bg-surface-high px-3 py-2 text-sm text-text">
            <Icon name="check_circle" className="text-[16px] text-success" />
            {notice}
          </div>
        )}
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
