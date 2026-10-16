import { useId, useState } from 'react'
import { adminAddIpBlock } from '../lib/adminApi'
import { AdminCard, errMsg, useDialog } from './AdminUI'

const MIN_REASON = 5
const EXPIRY_OPTIONS: { label: string; days: number | null }[] = [
  { label: '1 day', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: 'Permanent', days: null },
]

/** Mobile networks hand out a new IPv6 address inside the same /64 all the
 *  time, so blocking only the exact address rarely holds; offer the /64. */
function ipv6Prefix64(ip: string): string | null {
  if (!ip.includes(':')) return null
  const groups = ip.split('::')
  const head = groups[0] ? groups[0].split(':') : []
  const tail = groups.length > 1 && groups[1] ? groups[1].split(':') : []
  const full = groups.length > 1 ? [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail] : head
  if (full.length !== 8) return null
  return `${full.slice(0, 4).join(':')}::/64`
}

/** Block an IP (or its /64 for IPv6) with an audited reason and an expiry.
 *  `initialIp` prefills it (from a call); leave empty to type one. */
export function AdminIpBlockDialog({
  initialIp = '',
  context = '',
  onClose,
  onBlocked,
}: {
  initialIp?: string
  context?: string
  onClose: () => void
  onBlocked: (network: string) => void
}) {
  const [ip, setIp] = useState(initialIp)
  const [wholeRange, setWholeRange] = useState(Boolean(ipv6Prefix64(initialIp)))
  const [reason, setReason] = useState(context)
  const [days, setDays] = useState<number | null>(30)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useDialog(onClose)
  const titleId = useId()
  const range = ipv6Prefix64(ip.trim())
  const target = wholeRange && range ? range : ip.trim()
  const valid = ip.trim().length > 0 && reason.trim().length >= MIN_REASON

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await adminAddIpBlock(target, reason.trim(), days)
      onBlocked(res.network)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md">
        <AdminCard className="p-6">
          <h2 id={titleId} className="mb-2 font-display text-lg font-semibold">Block an IP address</h2>
          <p className="text-sm text-text-muted">
            A blocked visitor can't start website or widget calls, sign up, send the contact form or load the widget. Sign-in and
            this admin panel stay reachable.
          </p>
          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted">IP address or range (CIDR)</span>
            <input
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              placeholder="203.0.113.7 or 203.0.113.0/24"
              className="rounded-lg border border-border bg-surface-high px-3 py-2 font-mono text-sm outline-none focus:border-primary"
            />
          </label>
          {range && (
            <label className="mt-2 flex items-start gap-2 text-sm">
              <input type="checkbox" checked={wholeRange} onChange={(e) => setWholeRange(e.target.checked)} className="mt-1" />
              <span>
                Block the whole range <span className="font-mono text-xs">{range}</span>
                <span className="block text-[11px] text-text-muted">Recommended for IPv6: phones change address inside it.</span>
              </span>
            </label>
          )}
          <fieldset className="mt-4">
            <legend className="text-xs font-semibold text-text-muted">For how long</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {EXPIRY_OPTIONS.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => setDays(o.days)}
                  aria-pressed={days === o.days}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    days === o.days ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-surface text-text-muted'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted">Reason (logged to the audit trail)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. kept the demo busy with junk calls"
              className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          {reason.trim().length < MIN_REASON && <p className="mt-1 text-[11px] text-text-muted">At least {MIN_REASON} characters.</p>}
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-semibold text-text-muted hover:text-text">
              Cancel
            </button>
            <button
              disabled={busy || !valid}
              onClick={submit}
              className="rounded-lg bg-destructive px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? 'Blocking…' : `Block ${target || 'IP'}`}
            </button>
          </div>
        </AdminCard>
      </div>
    </div>
  )
}
