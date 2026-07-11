import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useAuth } from '../lib/auth'
import { apiResetPassword } from '../lib/auth'
import { AuthShell } from './AuthShell'

export function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const navigate = useNavigate()
  const { refresh } = useAuth()

  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setBusy(true)
    try {
      await apiResetPassword(token, password)
      // The endpoint signs us in on success; refresh the auth state, go home.
      await refresh()
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset your password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Almost done — set a new password for your account."
      headline={
        <>
          A fresh <span className="text-primary">start.</span>
        </>
      }
      features={['Answer & qualify calls 24/7', '30+ Indian languages', 'Every call logged & analyzed']}
    >
      {!token ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2 rounded-lg border-l-[3px] border-destructive bg-surface-high px-3 py-2 text-sm">
            <Icon name="error" className="text-[16px] text-destructive" />
            This reset link is missing its token. Request a new one.
          </div>
          <Link to="/forgot-password" className="text-center text-sm font-semibold text-cyan hover:underline">
            Request a new link
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border-l-[3px] border-destructive bg-surface-high px-3 py-2 text-sm text-text">
              <Icon name="error" className="text-[16px] text-destructive" />
              {error}
            </div>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted">New password</span>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-lg border border-border bg-surface-high px-3 py-2.5 pr-10 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:text-text"
              >
                <Icon name={showPw ? 'visibility_off' : 'visibility'} className="text-[18px]" />
              </button>
            </div>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-1 flex items-center justify-center rounded-lg bg-primary py-2.5 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
          >
            {busy ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-bg border-t-transparent" />
            ) : (
              'Set new password'
            )}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
