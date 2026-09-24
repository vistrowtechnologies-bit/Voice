import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { AdminCard, EmptyState, PageHeader } from '../../components/AdminUI'
import { PriorityChip, StatusChip, TicketThread } from '../../components/SupportTicketParts'
import { CATEGORY_LABELS, ticketTime, toUploads } from '../../lib/support'
import { Icon } from '../../components/Icon'
import {
  adminAddSupportNote,
  adminAssignSupportTicket,
  adminImpersonate,
  rememberSupportReturn,
  adminReplySupportTicket,
  adminSupportTeam,
  adminSupportTicket,
  adminSupportTickets,
  adminUpdateSupportTicket,
} from '../../lib/adminApi'
import type { SupportTicket } from '../../lib/types'

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
] as const

// Internal target only — shown to the team, never promised to customers.
const FIRST_RESPONSE_TARGET_HOURS = 24

const utcMs = (text: string | null) => (text ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text.replace(' ', 'T')}Z`) : NaN)

function hoursLabel(ms: number) {
  const h = ms / 3_600_000
  return h < 1 ? `${Math.max(1, Math.round(h * 60))}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`
}

/** "Answered in 2h", or "Overdue 26h" when nobody has replied past the target. */
function FirstResponse({ ticket }: { ticket: SupportTicket }) {
  const opened = utcMs(ticket.createdAt)
  if (ticket.firstResponseAt) {
    return <span className="text-[11px] text-text-muted">Answered in {hoursLabel(utcMs(ticket.firstResponseAt) - opened)}</span>
  }
  if (ticket.status === 'resolved' || ticket.status === 'closed') return null
  const waited = Date.now() - opened
  const overdue = waited > FIRST_RESPONSE_TARGET_HOURS * 3_600_000
  return (
    <span className={`text-[11px] font-semibold ${overdue ? 'text-destructive' : 'text-amber'}`}>
      {overdue ? 'Overdue' : 'Waiting'} {hoursLabel(waited)}
    </span>
  )
}

/** Every workspace's tickets in one inbox. A reply here is emailed to the
 * person who raised the ticket and shows in their Help & Support page. */
export function AdminSupport() {
  const [params, setParams] = useSearchParams()
  const selectedId = Number(params.get('ticket')) || null
  const [filter, setFilter] = useState<string>('open')
  const [rows, setRows] = useState<SupportTicket[] | null>(null)
  const [selected, setSelected] = useState<SupportTicket | null>(null)
  const [saving, setSaving] = useState(false)
  const [team, setTeam] = useState<{ id: number; name: string; email: string }[]>([])
  useEffect(() => {
    adminSupportTeam().then(setTeam).catch(() => setTeam([]))
  }, [])

  const load = useCallback(() => {
    setRows(null)
    adminSupportTickets(filter).then(setRows).catch(() => setRows([]))
  }, [filter])
  useEffect(load, [load])

  useEffect(() => {
    if (!selectedId) {
      setSelected(null)
      return
    }
    adminSupportTicket(selectedId).then(setSelected).catch(() => setSelected(null))
  }, [selectedId])

  const applyUpdate = (t: SupportTicket) => {
    setSelected(t)
    setRows((r) => (r ?? []).map((x) => (x.id === t.id ? { ...x, ...t } : x)))
  }

  const change = async (patch: { status?: string; priority?: string }) => {
    if (!selected) return
    setSaving(true)
    try {
      applyUpdate(await adminUpdateSupportTicket(selected.id, patch))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Support inbox" subtitle="Tickets from every workspace. Replies are emailed to the customer and shown in their dashboard." />
      <AdminCard className="mb-4 flex flex-wrap gap-2 p-3">
        {FILTERS.map((f) => (
          <button
            key={f.id || 'all'}
            onClick={() => setFilter(f.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${filter === f.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-muted'}`}
          >
            {f.label}
          </button>
        ))}
      </AdminCard>
      <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_1fr]">
        <AdminCard className="overflow-hidden">
          {rows === null ? (
            <p className="p-5 text-sm text-text-muted">Loading…</p>
          ) : rows.length === 0 ? (
            <EmptyState icon="support_agent" message="No tickets here. New tickets from any workspace land in this inbox and in the support email." />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setParams({ ticket: String(t.id) })}
                    className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors ${selectedId === t.id ? 'bg-surface-high' : 'hover:bg-surface-high/50'}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-text-muted">{t.ref}</span>
                      <StatusChip status={t.status} />
                      <PriorityChip priority={t.priority} />
                      {t.lastAuthor === 'customer' && t.status !== 'resolved' && t.status !== 'closed' && (
                        <span className="ml-auto text-[11px] font-semibold text-amber">Awaiting us</span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <FirstResponse ticket={t} />
                      {t.assigneeName && <span className="text-[11px] text-text-muted">· {t.assigneeName}</span>}
                      {t.rating && <Icon name={t.rating === 'good' ? 'thumb_up' : 'thumb_down'} className={`text-[14px] ${t.rating === 'good' ? 'text-success' : 'text-destructive'}`} />}
                    </span>
                    <span className="truncate text-sm font-semibold">{t.subject}</span>
                    <span className="truncate text-[11px] text-text-muted">
                      {t.accountName || `Account ${t.accountId}`} · {t.userEmail} · {ticketTime(t.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
        <AdminCard className="p-5">
          {selected ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    <span className="font-mono">{selected.ref}</span>
                    <span>{CATEGORY_LABELS[selected.category] ?? selected.category}</span>
                    {selected.currentPage && <span>from {selected.currentPage}</span>}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">{selected.subject}</h2>
                  <p className="text-xs text-text-muted">
                    <Link to={`/admin/accounts/${selected.accountId}`} className="font-semibold text-primary hover:underline">
                      {selected.accountName || `Account ${selected.accountId}`}
                    </Link>{' '}
                    · {selected.userEmail} · opened {ticketTime(selected.createdAt)}
                  </p>
                  <ViewAsCustomer ticket={selected} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="flex flex-col gap-1 text-[11px] font-semibold text-text-muted">
                    Assignee
                    <select
                      disabled={saving}
                      value={selected.assignedUserId ?? ''}
                      onChange={async (e) => {
                        setSaving(true)
                        try {
                          applyUpdate(await adminAssignSupportTicket(selected.id, e.target.value ? Number(e.target.value) : null))
                        } finally {
                          setSaving(false)
                        }
                      }}
                      className="rounded-lg border border-border bg-surface-high px-2 py-1.5 text-xs outline-none focus:border-primary"
                    >
                      <option value="">Unassigned</option>
                      {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] font-semibold text-text-muted">
                    Status
                    <select disabled={saving} value={selected.status} onChange={(e) => change({ status: e.target.value })} className="rounded-lg border border-border bg-surface-high px-2 py-1.5 text-xs outline-none focus:border-primary">
                      <option value="open">Open</option>
                      <option value="in_progress">In progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] font-semibold text-text-muted">
                    Priority
                    <select disabled={saving} value={selected.priority} onChange={(e) => change({ priority: e.target.value })} className="rounded-lg border border-border bg-surface-high px-2 py-1.5 text-xs outline-none focus:border-primary">
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <FirstResponse ticket={selected} />
                {selected.rating && (
                  <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${selected.rating === 'good' ? 'border-success/40 bg-success/10 text-success' : 'border-destructive/40 bg-destructive/10 text-destructive'}`}>
                    <Icon name={selected.rating === 'good' ? 'thumb_up' : 'thumb_down'} className="text-[14px]" />
                    Customer rated it {selected.rating === 'good' ? 'good' : 'not good'}{selected.ratingComment ? `: "${selected.ratingComment}"` : ''}
                  </span>
                )}
              </div>
              <TicketThread
                ticket={selected}
                viewer="support"
                onNote={async (body) => applyUpdate(await adminAddSupportNote(selected.id, body))}
                replyPlaceholder="Reply to the customer — they get it by email and in their dashboard…"
                onReply={async (body, files) => applyUpdate(await adminReplySupportTicket(selected.id, body, await toUploads(files)))}
              />
            </div>
          ) : (
            <EmptyState icon="forum" message="Pick a ticket to read and reply." />
          )}
        </AdminCard>
      </div>
    </>
  )
}

/** Opens the customer's dashboard as them (an audited support session),
 * on the page the ticket was raised from, to reproduce and fix the issue.
 * Exit in the red banner comes back to this ticket. */
function ViewAsCustomer({ ticket }: { ticket: SupportTicket }) {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [busy, setBusy] = useState(false)
  const landOn = ticket.currentPage.startsWith('/dashboard') ? ticket.currentPage : '/dashboard'
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            rememberSupportReturn(`/admin/support?ticket=${ticket.id}`)
            await adminImpersonate(ticket.accountId)
            await refresh()
            navigate(landOn)
          } finally {
            setBusy(false)
          }
        }}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-bg hover:opacity-90 disabled:opacity-50"
      >
        <Icon name="visibility" className="text-[15px]" /> {busy ? 'Opening…' : `View as customer on ${landOn}`}
      </button>
      <Link
        to={`/admin/accounts/${ticket.accountId}`}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-primary"
      >
        <Icon name="monitor_heart" className="text-[15px]" /> Account health
      </Link>
    </div>
  )
}
