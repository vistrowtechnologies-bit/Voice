import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchEntitlements } from '../lib/api'
import { Icon } from './Icon'

const WARN_AT = 0.8
const CRITICAL_AT = 0.95

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Sidebar warning shown only when the workspace has used 80% or more of its plan's
 * storage. Below that it renders nothing. It reads `storage` from /entitlements; a
 * plan with no storage limit (limitBytes null) or an API that does not report storage
 * yet never shows it. */
export function StorageWarning({ compact = false }: { compact?: boolean }) {
  const [storage, setStorage] = useState<{ usedBytes: number; limitBytes: number | null } | null>(null)

  useEffect(() => {
    let live = true
    fetchEntitlements()
      .then((e) => { if (live) setStorage(e.storage ?? null) })
      .catch(() => { /* a failed lookup must never put a warning on screen */ })
    return () => { live = false }
  }, [])

  if (!storage || !storage.limitBytes || storage.limitBytes <= 0) return null
  const ratio = storage.usedBytes / storage.limitBytes
  if (ratio < WARN_AT) return null

  const pct = Math.min(100, Math.floor(ratio * 100))
  const critical = ratio >= CRITICAL_AT
  const tone = critical
    ? { box: 'border-destructive/40 bg-destructive/10', text: 'text-destructive', bar: 'bg-destructive' }
    : { box: 'border-amber/40 bg-amber/10', text: 'text-amber', bar: 'bg-amber' }
  const title = ratio >= 1 ? 'Storage full' : `Storage ${pct}% full`

  if (compact) {
    return (
      <Link to="/dashboard/billing" className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${tone.box} ${tone.text}`}>
        <Icon name="warning" className="text-[18px]" />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <Icon name="arrow_forward" className="text-[15px]" />
      </Link>
    )
  }
  return (
    <div className="mb-2 shrink-0 border-t border-border pt-2">
    <Link to="/dashboard/billing" className={`block rounded-xl border p-3 [@media(max-height:800px)]:p-2 ${tone.box}`}>
      <div className="flex items-center gap-2">
        <Icon name="warning" className={`shrink-0 text-[18px] ${tone.text}`} />
        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-text">{title}</p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Storage used">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-text-muted">
        {formatBytes(storage.usedBytes)} of {formatBytes(storage.limitBytes)} used.{' '}
        <span className={`font-semibold ${critical ? 'text-destructive' : 'text-text'}`}>Upgrade for more space</span>
      </p>
    </Link>
    </div>
  )
}
