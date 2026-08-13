import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminCard, EmptyState, PageHeader, Pill, timeAgo } from '../../components/AdminUI'
import { adminPrivacyRequests, adminUpdatePrivacyRequest, type AdminPrivacyRequest } from '../../lib/adminApi'

const FILTERS = ['', 'pending', 'in_progress', 'completed', 'rejected'] as const

export function AdminPrivacyRequests() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('')
  const [rows, setRows] = useState<AdminPrivacyRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    adminPrivacyRequests(filter).then((data) => setRows(data.requests)).finally(() => setLoading(false))
  }
  useEffect(load, [filter])

  const update = async (row: AdminPrivacyRequest, status: AdminPrivacyRequest['status']) => {
    const note = window.prompt('Internal note (optional)', row.admin_note || '')
    if (note === null) return
    setSaving(row.id)
    try { await adminUpdatePrivacyRequest(row.id, status, note); load() }
    finally { setSaving(null) }
  }

  return <>
    <PageHeader title="Privacy requests" subtitle="Track data exports and account-deletion requests across every tenant." />
    <AdminCard className="mb-4 flex flex-wrap gap-2 p-3">
      {FILTERS.map((value) => <button key={value || 'all'} onClick={() => setFilter(value)} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${filter === value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-muted'}`}>{value ? value.replace('_', ' ') : 'All'}</button>)}
    </AdminCard>
    <AdminCard className="overflow-hidden">
      {loading ? <p className="p-5 text-sm text-text-muted">Loading…</p> : rows.length === 0 ? <EmptyState icon="policy" message="No privacy requests. Requests submitted from tenant Settings will appear here." /> :
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-border bg-surface-high text-[11px] uppercase tracking-wide text-text-muted"><tr><th className="px-4 py-3">Request</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Workspace</th><th className="px-4 py-3">Received</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead>
        <tbody className="divide-y divide-border">{rows.map((row) => <tr key={row.id} className="hover:bg-surface-high/50"><td className="px-4 py-3"><p className="font-bold capitalize">{row.request_type}</p><p className="text-[11px] text-text-muted">Request #{row.id}{row.admin_note ? ` · ${row.admin_note}` : ''}</p></td><td className="px-4 py-3"><p className="font-semibold">{row.user_name}</p><p className="text-xs text-text-muted">{row.user_email}</p></td><td className="px-4 py-3"><Link to={`/admin/accounts/${row.account_id}`} className="font-semibold text-primary hover:underline">{row.account_name}</Link></td><td className="px-4 py-3 text-text-muted">{timeAgo(row.created_at)}</td><td className="px-4 py-3"><Pill tone={row.status === 'completed' ? 'active' : row.status === 'rejected' ? 'suspended' : row.status === 'pending' ? 'warning' : 'primary'}>{row.status.replace('_', ' ')}</Pill></td><td className="px-4 py-3"><select disabled={saving === row.id} value={row.status} onChange={(e) => update(row, e.target.value as AdminPrivacyRequest['status'])} className="rounded-lg border border-border bg-surface-high px-2 py-1.5 text-xs outline-none focus:border-primary"><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="rejected">Rejected</option></select></td></tr>)}</tbody></table></div>}
    </AdminCard>
  </>
}
