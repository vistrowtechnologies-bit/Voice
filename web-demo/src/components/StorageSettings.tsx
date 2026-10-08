import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteOldRecordings, fetchStorage, type StorageSummary } from '../lib/api'
import { formatBytes } from '../lib/format'
import { Icon } from './Icon'
import { Card } from './ui/Card'

const AGE_CHOICES = [30, 90, 180, 365]

/** Settings > Storage: what the recordings use, why a workspace might be full, and the ways out:
 * delete old audio (transcripts and summaries stay) or move to a plan with more space. */
export function StorageSettings({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<StorageSummary | null>(null)
  const [error, setError] = useState(false)
  const [confirming, setConfirming] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const load = () => fetchStorage().then((d) => { setData(d); setError(false) }).catch(() => setError(true))
  useEffect(() => { void load() }, [])

  const run = async (days: number) => {
    setBusy(true); setMessage(null)
    try {
      const r = await deleteOldRecordings(days)
      const freed = r.freedBytes ? ` ${formatBytes(r.freedBytes)} freed.` : ''
      setMessage(r.failed
        ? { type: 'error', text: `Deleted ${r.deleted} recordings, but ${r.failed} could not be removed. Try again in a moment.${freed}` }
        : { type: 'ok', text: `Deleted ${r.deleted} recordings.${freed}` })
      setConfirming(null)
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not delete the recordings.' })
    } finally { setBusy(false) }
  }

  if (error) return <Card variant="flat"><p className="text-sm text-text-muted">Could not load your storage right now. Try again in a moment.</p></Card>
  if (!data) return <Card variant="flat"><p className="text-sm text-text-muted">Loading storage…</p></Card>

  const { usedBytes, limitBytes } = data
  const known = usedBytes != null
  const ratio = known && limitBytes ? usedBytes / limitBytes : 0
  const pct = Math.min(100, Math.floor(ratio * 100))
  const full = !!limitBytes && ratio >= 1
  const near = !!limitBytes && ratio >= 0.8
  const bar = full ? 'bg-destructive' : near ? 'bg-amber' : 'bg-primary'

  return (
    <div className="flex flex-col gap-4">
      <Card variant="flat" className="flex flex-col gap-4">
        <div>
          <p className="text-base font-bold">Recording storage</p>
          <p className="text-xs text-text-muted">Call audio stored for your workspace. Transcripts, summaries and lead details do not count.</p>
        </div>
        {!known ? (
          <p className="text-sm text-text-muted">Usage could not be read right now.</p>
        ) : (
          <>
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-2xl font-bold tabular-nums">{formatBytes(usedBytes)}</p>
                <p className="text-sm text-text-muted">
                  {limitBytes ? `of ${formatBytes(limitBytes)} on your plan · ${pct}%` : 'no storage limit on your plan'}
                </p>
              </div>
              {limitBytes ? (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Storage used">
                  <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                </div>
              ) : null}
              <p className="mt-2 text-xs text-text-muted">{data.files ?? 0} recordings</p>
            </div>
            {full && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <Icon name="warning" className="mt-0.5 shrink-0 text-[18px] text-destructive" />
                <p>Your storage is full. New calls are still answered and transcribed, but their audio is <span className="font-semibold">not stored</span> until you free space or upgrade.</p>
              </div>
            )}
            {!full && near && (
              <div className="flex items-start gap-2 rounded-lg border border-amber/40 bg-amber/10 p-3 text-sm">
                <Icon name="warning" className="mt-0.5 shrink-0 text-[18px] text-amber" />
                <p>You have used {pct}% of your storage. When it is full, new calls keep working but their audio is not stored.</p>
              </div>
            )}
          </>
        )}
      </Card>

      <Card variant="flat" className="flex flex-col gap-4">
        <div>
          <p className="text-base font-bold">Free up space</p>
          <p className="text-xs text-text-muted">Delete old call audio. The transcript, summary and lead details of each call stay. Download any recordings you want to keep first, from the call itself. Deleting cannot be undone.</p>
        </div>
        {message && (
          <p className={`rounded-lg px-3 py-2 text-sm ${message.type === 'ok' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-destructive/10 text-destructive'}`}>{message.text}</p>
        )}
        <ul className="divide-y divide-border rounded-lg border border-border">
          {AGE_CHOICES.map((days) => {
            const bucket = data.olderThan?.[String(days)] ?? { bytes: 0, files: 0 }
            const empty = bucket.files === 0
            return (
              <li key={days} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">Older than {days} days</p>
                  <p className="text-xs text-text-muted">{empty ? 'Nothing to delete' : `${bucket.files} recordings · ${formatBytes(bucket.bytes)}`}</p>
                </div>
                {confirming === days ? (
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={busy} onClick={() => void run(days)} className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
                      <Icon name={busy ? 'progress_activity' : 'delete'} className={`text-[15px] ${busy ? 'animate-spin' : ''}`} />
                      Delete {bucket.files} recordings
                    </button>
                    <button type="button" disabled={busy} onClick={() => setConfirming(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">Cancel</button>
                  </div>
                ) : (
                  <button type="button" disabled={empty || !canManage} onClick={() => { setMessage(null); setConfirming(days) }} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50">
                    Delete…
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        {!canManage && <p className="text-xs text-text-muted">Only workspace admins can delete recordings.</p>}
      </Card>

      <Card variant="flat" className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-base font-bold">Need more space?</p>
          <p className="text-xs text-text-muted">Higher plans include more recording storage.</p>
        </div>
        <Link to="/dashboard/billing" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">
          See plans <Icon name="arrow_forward" className="text-[16px]" />
        </Link>
      </Card>
    </div>
  )
}
