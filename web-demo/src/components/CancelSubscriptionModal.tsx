import { useState } from 'react'
import { cancelSubscription } from '../lib/api'
import { Icon } from './Icon'

const REASONS = [
  'Too expensive for what I use',
  'I am not using it enough',
  'It is missing a feature I need',
  'I am moving to another provider',
  'I was only testing',
  'Something else',
]

/** Two steps: why (optional), then exactly what happens, then confirm. The cancellation is for the END of
 * the paid period, so nothing is lost today and nothing is hidden behind a support request. */
export function CancelSubscriptionModal({
  planName,
  endsOn,
  onClose,
  onDone,
}: {
  planName: string
  endsOn: string | null
  onClose: () => void
  onDone: () => void
}) {
  const [step, setStep] = useState<'reason' | 'confirm' | 'done'>('reason')
  const [reason, setReason] = useState('')
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const date = endsOn ? new Date(endsOn).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : 'the end of this billing period'

  const confirm = async () => {
    setBusy(true); setError('')
    try {
      await cancelSubscription(reason === 'Something else' && other.trim() ? `Other: ${other.trim()}` : reason)
      setStep('done')
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel. Nothing was changed.')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Cancel subscription">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        {step === 'reason' && (
          <>
            <h2 className="text-lg font-bold">Cancel your {planName} plan?</h2>
            <p className="mt-1 text-sm text-text-muted">We are sorry to see you go. What is the main reason? This is optional and helps us improve.</p>
            <div className="mt-4 flex flex-col gap-2">
              {REASONS.map((r) => (
                <label key={r} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm hover:border-primary">
                  <input type="radio" name="cancel-reason" checked={reason === r} onChange={() => setReason(r)} className="accent-primary" />
                  {r}
                </label>
              ))}
              {reason === 'Something else' && (
                <textarea value={other} onChange={(e) => setOther(e.target.value)} rows={2} maxLength={300} placeholder="Tell us more (optional)" className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary" />
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">Keep my plan</button>
              <button onClick={() => setStep('confirm')} className="rounded-lg border border-border px-4 py-2 text-sm font-bold text-text-muted hover:text-text">Continue</button>
            </div>
          </>
        )}
        {step === 'confirm' && (
          <>
            <h2 className="text-lg font-bold">Here is what happens</h2>
            <ul className="mt-3 flex flex-col gap-2.5 text-sm">
              <li className="flex gap-2"><Icon name="check_circle" className="mt-0.5 shrink-0 text-[17px] text-cyan" /><span>You keep your {planName} plan until <b>{date}</b>. Nothing changes before then.</span></li>
              <li className="flex gap-2"><Icon name="check_circle" className="mt-0.5 shrink-0 text-[17px] text-cyan" /><span>You will not be charged again.</span></li>
              <li className="flex gap-2"><Icon name="info" className="mt-0.5 shrink-0 text-[17px] text-text-muted" /><span>After that your workspace goes back to the Starter plan&apos;s limits. Agents beyond those limits pause, and nothing is deleted.</span></li>
              <li className="flex gap-2"><Icon name="info" className="mt-0.5 shrink-0 text-[17px] text-text-muted" /><span>You can choose a plan again from Plan &amp; billing at any time.</span></li>
            </ul>
            {error && <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">Keep my plan</button>
              <button onClick={() => void confirm()} disabled={busy} className="rounded-lg border border-destructive/50 px-4 py-2 text-sm font-bold text-destructive hover:bg-destructive/10 disabled:opacity-60">
                {busy ? 'Cancelling…' : 'Cancel subscription'}
              </button>
            </div>
          </>
        )}
        {step === 'done' && (
          <>
            <h2 className="flex items-center gap-2 text-lg font-bold"><Icon name="check_circle" className="text-[22px] text-cyan" />Cancellation scheduled</h2>
            <p className="mt-2 text-sm text-text-muted">Your {planName} plan will not renew. Everything stays available until <b className="text-text">{date}</b>. We have emailed you a confirmation.</p>
            <div className="mt-5 flex justify-end"><button onClick={onClose} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">Done</button></div>
          </>
        )}
      </div>
    </div>
  )
}
