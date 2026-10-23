import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { apiAdminLogin, useAuth } from '../lib/auth'
import { SUPPORT_EMAIL } from '../lib/support'
import { AuthInput, AuthShell, PasswordVisibilityToggle, useShake } from './AuthShell'

/** Only a path on this host, never another site. */
function safeNext(path: string | null): string {
  return path && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\') ? path : ''
}

const errorBox = 'flex items-center gap-2 rounded-lg border-l-[3px] border-destructive bg-surface-high px-3 py-2 text-sm text-text'
const submitBtn =
  'mt-1 flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50'

/** Sign-in for admin.vistrowvoice.com: the platform owner's email, password
 * and authenticator code, every time. No Google/GitHub, no sign-up, no
 * password reset here: those belong to the customer app. */
export function AdminLogin() {
  const { verifyMfa } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const next = safeNext(searchParams.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [code, setCode] = useState('')
  const [codeStep, setCodeStep] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shake = useShake(error)

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await apiAdminLogin(email.trim(), password)
      setCodeStep(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed'
      // A server without the admin sign-in yet answers 404 "Not Found".
      setError(message === 'Not Found' ? 'Admin sign-in is not switched on for this server yet.' : message)
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await verifyMfa(code.trim())
      navigate(next.startsWith('/admin') || next.startsWith('/dashboard') ? next : '/admin', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code didn’t work.')
      if (err instanceof Error && /timed out|sign in again/i.test(err.message)) setCodeStep(false)
    } finally {
      setBusy(false)
    }
  }

  const shell = {
    headline: <>Vistrow <span className="text-primary">admin.</span></>,
    features: ['Platform owner only', 'Password and authenticator code, every time', 'Separate from the customer dashboard'],
  }

  if (codeStep) {
    return (
      <AuthShell title="Enter your code" subtitle="Open your authenticator app and type the 6-digit code for Vistrow Voice." {...shell}>
        <form onSubmit={submitCode} className={`flex flex-col gap-4 ${shake ? 'auth-shake' : ''}`}>
          {error && (
            <div className={errorBox}>
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
            No phone? Type one of your recovery codes instead. Lost both? Email {SUPPORT_EMAIL} from the owner address.
          </p>
          <button type="submit" disabled={busy || code.trim().length < 6} className={submitBtn}>
            {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-bg border-t-transparent" /> : 'Verify and open admin'}
          </button>
          <button
            type="button"
            onClick={() => { setCodeStep(false); setCode(''); setError(null) }}
            className="bg-transparent text-sm font-semibold text-text-muted hover:text-text"
          >
            Back
          </button>
        </form>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Admin sign-in" subtitle="For the Vistrow platform owner. Your password, then your authenticator code." {...shell}>
      <form onSubmit={submitPassword} className={`flex flex-col gap-4 ${shake ? 'auth-shake' : ''}`}>
        {error && (
          <div className={errorBox}>
            <Icon name="error" className="text-[16px] text-destructive" />
            {error}
          </div>
        )}
        <AuthInput label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus error={!!error} />
        <AuthInput
          label="Password"
          type={showPw ? 'text' : 'password'}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={!!error}
          trailing={<PasswordVisibilityToggle shown={showPw} onToggle={() => setShowPw((v) => !v)} />}
        />
        <button type="submit" disabled={busy} className={submitBtn}>
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-bg border-t-transparent" /> : 'Continue'}
        </button>
      </form>
    </AuthShell>
  )
}
