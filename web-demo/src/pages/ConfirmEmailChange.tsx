import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { apiConfirmEmailChange, useAuth } from '../lib/auth'
import { AuthShell } from './AuthShell'

export function ConfirmEmailChange() {
  const [params] = useSearchParams()
  const { setUser } = useAuth()
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    const token = params.get('token')
    if (!token) { setState('error'); setError('This confirmation link is incomplete.'); return }
    apiConfirmEmailChange(token)
      .then(({ user }) => { setUser(user); setState('success') })
      .catch((err) => { setError(err instanceof Error ? err.message : 'Could not confirm your new email.'); setState('error') })
  }, [params, setUser])

  return <AuthShell title="Confirming your email" subtitle="We’re securing your account details." headline={<>A safer <span className="text-primary">sign-in.</span></>} features={['Your original sign-in method still works', 'Other sessions are signed out for safety', 'Use the new email on your next login']}>
    {state === 'loading' && <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-high p-4 text-sm text-text-muted"><span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />Confirming your new email…</div>}
    {state === 'success' && <div className="flex flex-col gap-4"><div className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/10 p-4 text-sm"><Icon name="mark_email_read" className="text-[19px] text-success" /><span><b>Your new sign-in email is confirmed.</b><br />For security, other sessions were signed out.</span></div><Link to="/dashboard/settings?tab=profile" className="rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-bold text-bg">Back to profile</Link></div>}
    {state === 'error' && <div className="flex flex-col gap-4"><div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"><Icon name="error" className="text-[19px]" />{error}</div><Link to="/login" className="text-center text-sm font-semibold text-cyan hover:underline">Back to sign in</Link></div>}
  </AuthShell>
}
