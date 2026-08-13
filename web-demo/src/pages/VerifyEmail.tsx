import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthShell, useShake } from './AuthShell'
import { apiResendEmailVerification, apiVerifyEmail, useAuth } from '../lib/auth'

export function VerifyEmail() {
  const [params] = useSearchParams()
  const email = (params.get('email') || '').trim().toLowerCase()
  const navigate = useNavigate()
  const { setUser } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [seconds, setSeconds] = useState(60)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState(
    params.get('sent') === '0'
      ? 'We could not deliver the first email. Use resend below in a moment.'
      : 'We sent a 6-digit code to your inbox.',
  )
  const shake = useShake(error)

  useEffect(() => {
    if (seconds <= 0) return
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [seconds])

  const verify = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!email) return setError('Return to signup and enter your email address.')
    if (code.length !== 6) return setError('Enter the 6-digit code from your email.')
    setBusy(true)
    try {
      const result = await apiVerifyEmail(email, code)
      setUser(result.user)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify this code')
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setError(null)
    setNotice('')
    setBusy(true)
    try {
      const result = await apiResendEmailVerification(email)
      setSeconds(result.resendAfter || 60)
      setNotice('A fresh code has been sent. Check spam if it does not arrive shortly.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the code')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Verify your email"
      subtitle={email ? `Enter the code sent to ${email}` : 'Finish securing your new account.'}
      headline={<>One quick step, then <span className="text-primary">you’re in.</span></>}
      features={['Stops disposable-email abuse', 'Protects your CRM data', 'Code expires in 10 minutes']}
    >
      <form onSubmit={verify} className={`flex flex-col gap-4 ${shake ? 'auth-shake' : ''}`}>
        {error && <div className="rounded-lg border-l-[3px] border-destructive bg-surface-high px-3 py-2 text-sm text-text">{error}</div>}
        {notice && <div className="rounded-lg border border-cyan/30 bg-cyan/5 px-3 py-2 text-sm text-text-muted">{notice}</div>}
        <label htmlFor="verification-code" className="text-xs font-semibold uppercase tracking-wider text-text-muted">Verification code</label>
        <input
          id="verification-code"
          autoFocus
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          className="w-full rounded-xl border border-border bg-surface-high px-4 py-4 text-center font-mono text-3xl font-bold tracking-[0.45em] text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          aria-label="Six-digit verification code"
        />
        <button disabled={busy || code.length !== 6} className="rounded-lg bg-primary py-3 text-sm font-bold text-bg disabled:opacity-50">
          {busy ? 'Checking…' : 'Verify and continue'}
        </button>
        <button type="button" onClick={resend} disabled={busy || seconds > 0 || !email} className="text-sm font-semibold text-cyan disabled:text-text-muted">
          {seconds > 0 ? `Resend code in ${seconds}s` : 'Resend code'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-text-muted"><Link to="/signup" className="text-cyan hover:underline">Use a different email</Link></p>
    </AuthShell>
  )
}
