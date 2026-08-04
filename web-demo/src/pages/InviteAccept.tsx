import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { apiAcceptInvite, apiGetInvite, useAuth, type InviteInfo } from '../lib/auth'
import { AuthInput, AuthShell, PasswordVisibilityToggle, useShake } from './AuthShell'

const ROLE_LABELS: Record<string, string> = { admin: 'an Admin', member: 'a Member', viewer: 'a Viewer' }

export function InviteAccept() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { refresh } = useAuth()

  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shake = useShake(error)

  useEffect(() => {
    if (!token) {
      setInvalid(true)
      return
    }
    apiGetInvite(token)
      .then(setInvite)
      .catch(() => setInvalid(true))
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setBusy(true)
    try {
      await apiAcceptInvite(token, password)
      await refresh()
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept this invite.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="You're invited"
      subtitle={invite ? `Join ${invite.accountName} on Vistrow Voice.` : 'Loading your invite…'}
      headline={
        <>
          Join the <span className="text-primary">team.</span>
        </>
      }
      features={['Answer & qualify calls 24/7', '11 Indian languages', 'Every call logged & analyzed']}
    >
      {invalid ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2 rounded-lg border-l-[3px] border-destructive bg-surface-high px-3 py-2 text-sm">
            <Icon name="error" className="text-[16px] text-destructive" />
            This invite link is invalid or has expired. Ask whoever invited you to send a new one.
          </div>
          <Link to="/login" className="text-center text-sm font-semibold text-cyan hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : !invite ? (
        <div className="flex justify-center py-8">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <form onSubmit={submit} className={`flex flex-col gap-4 ${shake ? 'auth-shake' : ''}`}>
          <div className="rounded-lg border border-border bg-surface-high px-3 py-2.5 text-sm">
            <span className="font-semibold">{invite.name}</span> · {invite.email}
            <div className="mt-1 text-xs text-text-muted">
              Joining <span className="font-semibold text-text">{invite.accountName}</span> as {ROLE_LABELS[invite.role] || invite.role}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border-l-[3px] border-destructive bg-surface-high px-3 py-2 text-sm text-text">
              <Icon name="error" className="text-[16px] text-destructive" />
              {error}
            </div>
          )}

          <AuthInput
            label="Set a password"
            type={showPw ? 'text' : 'password'}
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={!!error}
            trailing={<PasswordVisibilityToggle shown={showPw} onToggle={() => setShowPw((v) => !v)} />}
          />

          <button
            type="submit"
            disabled={busy}
            className="mt-1 flex items-center justify-center rounded-lg bg-primary py-2.5 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
          >
            {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-bg border-t-transparent" /> : 'Accept & join'}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
