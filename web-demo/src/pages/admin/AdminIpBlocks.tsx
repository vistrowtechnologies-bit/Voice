import { useEffect, useId, useState } from 'react'
import { adminIpBlocks, adminRemoveIpBlock, type AdminIpBlock } from '../../lib/adminApi'
import { AdminCard, EmptyState, errMsg, ErrorState, fmtDateTime, PageHeader, Pill, timeAgo, useDialog } from '../../components/AdminUI'
import { AdminIpBlockDialog } from '../../components/AdminIpBlockDialog'

const MIN_REASON = 5

/** Admin IP blocklist: who is blocked, why, until when; add and remove. */
export function AdminIpBlocks() {
  const [blocks, setBlocks] = useState<AdminIpBlock[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<AdminIpBlock | null>(null)
  const [banner, setBanner] = useState('')

  const load = () => {
    setError(null)
    adminIpBlocks()
      .then((r) => setBlocks(r.blocks))
      .catch((e: unknown) => setError(errMsg(e)))
  }
  useEffect(load, [])

  return (
    <>
      <PageHeader
        title="Blocked IPs"
        subtitle="Visitors from these addresses can't start website or widget calls, sign up, use the contact form or load the widget."
        action={
          <button onClick={() => setAdding(true)} className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white">
            Block an IP
          </button>
        }
      />
      {banner && (
        <div className="mb-4 rounded-lg border border-success/40 bg-success/10 px-4 py-2 text-sm" role="status">
          {banner}
        </div>
      )}
      <AdminCard className="overflow-hidden">
        {error ? (
          <ErrorState message={`Couldn't load the blocklist: ${error}`} onRetry={load} />
        ) : blocks === null ? (
          <div className="px-4 py-6 text-center text-sm text-text-muted">Loading…</div>
        ) : blocks.length === 0 ? (
          <EmptyState icon="block" message="No IPs are blocked. Block one from a call's page or with the button above." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2.5 font-semibold">IP / range</th>
                  <th className="px-4 py-2.5 font-semibold">Reason</th>
                  <th className="px-4 py-2.5 font-semibold">Added</th>
                  <th className="px-4 py-2.5 font-semibold">Until</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {blocks.map((b) => (
                  <tr key={b.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">
                      {b.network}
                      {!b.active && <span className="ml-2"><Pill tone="neutral">Expired</Pill></span>}
                    </td>
                    <td className="px-4 py-3">{b.reason}</td>
                    <td className="px-4 py-3 text-text-muted" title={fmtDateTime(b.createdAt)}>
                      {timeAgo(b.createdAt)}
                      {b.createdBy && <span className="block text-[11px]">{b.createdBy}</span>}
                    </td>
                    <td className="px-4 py-3 text-text-muted">{b.expiresAt ? fmtDateTime(b.expiresAt) : 'Permanent'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setRemoving(b)}
                        className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold hover:border-primary"
                      >
                        Unblock
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      {adding && (
        <AdminIpBlockDialog
          onClose={() => setAdding(false)}
          onBlocked={(network) => {
            setAdding(false)
            setBanner(`Blocked ${network}.`)
            load()
          }}
        />
      )}
      {removing && (
        <UnblockDialog
          block={removing}
          onClose={() => setRemoving(null)}
          onDone={() => {
            setBanner(`Unblocked ${removing.network}.`)
            setRemoving(null)
            load()
          }}
        />
      )}
    </>
  )
}

function UnblockDialog({ block, onClose, onDone }: { block: AdminIpBlock; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useDialog(onClose)
  const titleId = useId()
  const valid = reason.trim().length >= MIN_REASON

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await adminRemoveIpBlock(block.id, reason.trim())
      onDone()
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
          <h2 id={titleId} className="mb-2 font-display text-lg font-semibold">Unblock {block.network}?</h2>
          <label className="mt-2 flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted">Reason (logged to the audit trail)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          {!valid && <p className="mt-1 text-[11px] text-text-muted">At least {MIN_REASON} characters.</p>}
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-semibold text-text-muted hover:text-text">
              Cancel
            </button>
            <button disabled={busy || !valid} onClick={submit} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {busy ? 'Unblocking…' : 'Unblock'}
            </button>
          </div>
        </AdminCard>
      </div>
    </div>
  )
}
