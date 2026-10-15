import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminCard, EmptyState, errMsg, ErrorState, PageHeader, Pill, timeAgo, useDialog } from '../../components/AdminUI'
import { adminPrivacyRequests, adminUpdatePrivacyRequest, type AdminPrivacyRequest } from '../../lib/adminApi'

const FILTERS = ['', 'pending', 'in_progress', 'completed', 'rejected'] as const

type Pending = { row: AdminPrivacyRequest; status: AdminPrivacyRequest['status'] }

export function AdminPrivacyRequests() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('')
  const [rows, setRows] = useState<AdminPrivacyRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    adminPrivacyRequests(filter)
      .then((data) => setRows(data.requests))
      .catch((e: unknown) => setError(errMsg(e)))
      .finally(() => setLoading(false))
  }
  useEffect(load, [filter])

  return <>
    <PageHeader title="Privacy requests" subtitle="Track data exports and account-deletion requests across every tenant." />
    <AdminCard className="mb-4 flex flex-wrap gap-2 p-3">
      {FILTERS.map((value) => <button key={value || 'all'} onClick={() => setFilter(value)} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${filter === value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-transparent text-text-muted'}`}>{value ? value.replace('_', ' ') : 'All'}</button>)}
    </AdminCard>
    <AdminCard className="overflow-hidden">
      {error ? <ErrorState message={`Couldn't load privacy requests: ${error}`} onRetry={load} /> : loading ? <p className="p-5 text-sm text-text-muted">Loading…</p> : rows.length === 0 ? <EmptyState icon="policy" message="No privacy requests. Requests submitted from tenant Settings will appear here." /> :
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-border bg-surface-high text-[11px] uppercase tracking-wide text-text-muted"><tr><th className="px-4 py-3">Request</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Workspace</th><th className="px-4 py-3">Received</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead>
        <tbody className="divide-y divide-border">{rows.map((row) => <tr key={row.id} className="hover:bg-surface-high/50"><td className="px-4 py-3"><p className="font-bold capitalize">{row.request_type}</p><p className="text-[11px] text-text-muted">Request #{row.id}{row.admin_note ? ` · ${row.admin_note}` : ''}</p></td><td className="px-4 py-3"><p className="font-semibold">{row.user_name}</p><p className="text-xs text-text-muted">{row.user_email}</p></td><td className="px-4 py-3"><Link to={`/admin/accounts/${row.account_id}`} className="font-semibold text-primary hover:underline">{row.account_name}</Link></td><td className="px-4 py-3 text-text-muted">{timeAgo(row.created_at)}</td><td className="px-4 py-3"><Pill tone={row.status === 'completed' ? 'active' : row.status === 'rejected' ? 'suspended' : row.status === 'pending' ? 'warning' : 'primary'}>{row.status.replace('_', ' ')}</Pill></td><td className="px-4 py-3"><select aria-label={`Change status of request #${row.id}`} value={row.status} onChange={(e) => setPending({ row, status: e.target.value as AdminPrivacyRequest['status'] })} className="rounded-lg border border-border bg-surface-high px-2 py-1.5 text-xs outline-none focus:border-primary"><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="rejected">Rejected</option></select></td></tr>)}</tbody></table></div>}
    </AdminCard>
    {pending && (
      <StatusDialog
        pending={pending}
        onClose={() => setPending(null)}
        onSaved={() => {
          setPending(null)
          load()
        }}
      />
    )}
  </>
}

/** Replaces window.prompt: an optional internal note, plus an explicit confirm
 * before a deletion/export request is recorded as completed. */
function StatusDialog({ pending, onClose, onSaved }: { pending: Pending; onClose: () => void; onSaved: () => void }) {
  const { row, status } = pending
  const [note, setNote] = useState(row.admin_note || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const dialogRef = useDialog(onClose)
  const titleId = useId()
  const completing = status === 'completed'

  const save = async () => {
    setBusy(true)
    setErr(null)
    try {
      await adminUpdatePrivacyRequest(row.id, status, note)
      onSaved()
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md">
        <AdminCard className="p-6">
          <h2 id={titleId} className="mb-1 font-display text-lg font-semibold">
            Mark request #{row.id} {status.replace('_', ' ')}
          </h2>
          <p className="mb-4 text-xs text-text-muted">
            <span className="capitalize">{row.request_type}</span> request from {row.user_email} ({row.account_name})
          </p>
          {completing && (
            <p className="mb-3 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
              {row.request_type === 'deletion'
                ? 'Only mark this completed once the account data has actually been deleted.'
                : 'Only mark this completed once the export has actually been delivered to the user.'}
            </p>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted">Internal note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[80px] resize-y rounded-lg border border-border bg-surface-high p-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
          {err && <p role="alert" className="mt-2 text-xs text-destructive">Couldn't update the request: {err}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-semibold text-text-muted hover:text-text">
              Cancel
            </button>
            <button disabled={busy} onClick={save} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg disabled:opacity-50">
              {busy ? 'Saving…' : completing ? `Confirm ${row.request_type} completed` : 'Update status'}
            </button>
          </div>
        </AdminCard>
      </div>
    </div>
  )
}
