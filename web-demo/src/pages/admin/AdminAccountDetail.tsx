import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import {
  adminAccountDetail,
  adminImpersonate,
  adminResetPassword,
  adminSetCredits,
  adminSetNotes,
  adminSetPlan,
  adminSetStatus,
  PLAN_LABELS,
  type AdminAccountDetail as Detail,
} from '../../lib/adminApi'
import { AdminCard, EmptyState, fmtDate, fmtDuration, Pill, PlanPill, StatusPill, timeAgo } from '../../components/AdminUI'
import { Icon } from '../../components/Icon'

type Tab = 'users' | 'agents' | 'calls' | 'knowledge' | 'numbers' | 'integrations' | 'notes'
const TABS: { id: Tab; label: string }[] = [
  { id: 'users', label: 'Users' },
  { id: 'agents', label: 'Agents' },
  { id: 'calls', label: 'Calls' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'numbers', label: 'Numbers' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'notes', label: 'Notes & Audit' },
]

export function AdminAccountDetail() {
  const { id } = useParams()
  const accountId = Number(id)
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<Tab>('users')
  const [modal, setModal] = useState<null | 'credits' | 'plan' | 'status' | 'reset'>(null)
  const [banner, setBanner] = useState<string | null>(null)

  const load = () => adminAccountDetail(accountId).then(setD).catch(() => setError(true))
  useEffect(() => {
    load()
  }, [accountId])

  if (error) return <EmptyState icon="error" message="Account not found." />
  if (!d) return <div className="h-40 animate-pulse rounded-xl border border-border bg-surface" />

  const a = d.account
  const suspended = a.status === 'suspended'

  const impersonate = async () => {
    await adminImpersonate(accountId)
    await refresh()
    navigate('/dashboard')
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <button onClick={() => navigate('/admin/accounts')} className="mb-1 flex items-center gap-1 text-xs text-text-muted hover:text-text">
            <Icon name="chevron_left" className="text-[16px]" /> Accounts
          </button>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight">{a.name}</h1>
            <PlanPill plan={a.plan} />
            <StatusPill status={a.status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={impersonate} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-bg hover:opacity-90">
            <Icon name="visibility" className="text-[16px]" /> View as
          </button>
          <ActionBtn onClick={() => setModal('credits')}>Adjust credits</ActionBtn>
          <ActionBtn onClick={() => setModal('plan')}>Change plan</ActionBtn>
          <ActionBtn onClick={() => setModal('reset')}>Reset password</ActionBtn>
          <button
            onClick={() => setModal('status')}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
              suspended ? 'border-success/40 text-success hover:bg-success/10' : 'border-destructive/40 text-destructive hover:bg-destructive/10'
            }`}
          >
            {suspended ? 'Reactivate' : 'Suspend'}
          </button>
        </div>
      </div>

      {banner && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          <Icon name="check_circle" className="text-[16px]" /> {banner}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <MetaCard label="Account owner" value={d.owner?.email || '—'} />
        <MetaCard label="Onboarded" value={fmtDate(a.created_at)} />
        <MetaCard label="Capacity" value={`${d.users.length} users · ${d.agents.length} agents`} />
        <AdminCard className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Credit utilization</div>
          <div className="mt-2 flex items-center justify-between text-xs text-text-muted">
            <span className="tabular-nums">{Math.round(d.billing.creditsUsed)} used</span>
            <span className="tabular-nums">
              {Math.round(d.billing.creditsUsed)}/{Math.round(d.billing.creditsTotal)}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-high">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, (d.billing.creditsUsed / (d.billing.creditsTotal || 1)) * 100)}%` }}
            />
          </div>
        </AdminCard>
      </div>

      <div className="mt-6 flex gap-5 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap border-b-2 pb-2.5 text-sm font-semibold transition-colors ${
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'users' && <UsersTab d={d} />}
        {tab === 'agents' && <AgentsTab d={d} />}
        {tab === 'calls' && <CallsTab d={d} navigate={navigate} />}
        {tab === 'knowledge' && <KnowledgeTab d={d} />}
        {tab === 'numbers' && <NumbersTab d={d} />}
        {tab === 'integrations' && <IntegrationsTab d={d} />}
        {tab === 'notes' && <NotesTab d={d} onSaved={load} />}
      </div>

      {modal === 'credits' && (
        <ReasonModal
          title="Adjust credits"
          field={{ label: 'New credit total', type: 'number', initial: String(Math.round(d.billing.creditsTotal)) }}
          confirmLabel="Update credits"
          onClose={() => setModal(null)}
          onConfirm={async (val, reason) => {
            const updated = await adminSetCredits(accountId, Number(val), reason)
            setD(updated)
            setModal(null)
            setBanner(`Credits set to ${Number(val).toLocaleString()}.`)
          }}
        />
      )}
      {modal === 'plan' && (
        <ReasonModal
          title="Change plan"
          field={{ label: 'Plan', type: 'select', options: Object.keys(PLAN_LABELS), initial: a.plan }}
          confirmLabel="Change plan"
          onClose={() => setModal(null)}
          onConfirm={async (val, reason) => {
            const updated = await adminSetPlan(accountId, val, reason)
            setD(updated)
            setModal(null)
            setBanner(`Plan changed to ${PLAN_LABELS[val] || val}.`)
          }}
        />
      )}
      {modal === 'status' && (
        <ReasonModal
          title={suspended ? 'Reactivate account' : 'Suspend account'}
          danger={!suspended}
          confirmLabel={suspended ? 'Reactivate' : 'Suspend'}
          onClose={() => setModal(null)}
          onConfirm={async (_v, reason) => {
            const updated = await adminSetStatus(accountId, suspended ? 'active' : 'suspended', reason)
            setD(updated)
            setModal(null)
            setBanner(suspended ? 'Account reactivated.' : 'Account suspended.')
          }}
        />
      )}
      {modal === 'reset' && (
        <ResetModal
          accountId={accountId}
          ownerEmail={d.owner?.email || ''}
          onClose={() => setModal(null)}
          onDone={(msg) => {
            setModal(null)
            setBanner(msg)
          }}
        />
      )}
    </>
  )
}

function ActionBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-primary">
      {children}
    </button>
  )
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <AdminCard className="p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 truncate font-semibold">{value}</div>
    </AdminCard>
  )
}

function TabTable({ head, children, empty }: { head: string[]; children: React.ReactNode; empty: boolean }) {
  if (empty) return <EmptyState icon="inbox" message="Nothing here yet." />
  return (
    <AdminCard className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
              {head.map((h) => (
                <th key={h} className="px-4 py-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </AdminCard>
  )
}

function UsersTab({ d }: { d: Detail }) {
  return (
    <TabTable head={['User', 'Role', 'Auth', 'Last login', 'Joined']} empty={d.users.length === 0}>
      {d.users.map((u) => (
        <tr key={u.id} className="border-b border-border/60 last:border-0">
          <td className="px-4 py-3">
            <div className="font-semibold">{u.name}</div>
            <div className="text-xs text-text-muted">{u.email}</div>
          </td>
          <td className="px-4 py-3">
            <Pill tone={u.role === 'owner' ? 'primary' : 'neutral'}>{u.role}</Pill>
          </td>
          <td className="px-4 py-3 capitalize text-text-muted">{u.auth_provider || 'password'}</td>
          <td className="px-4 py-3 text-text-muted">{timeAgo(u.last_login_at)}</td>
          <td className="px-4 py-3 text-text-muted">{fmtDate(u.created_at)}</td>
        </tr>
      ))}
    </TabTable>
  )
}

function AgentsTab({ d }: { d: Detail }) {
  return (
    <TabTable head={['Agent', 'Status', 'Voice', 'Model', 'Updated']} empty={d.agents.length === 0}>
      {d.agents.map((a) => (
        <tr key={a.id} className="border-b border-border/60 last:border-0">
          <td className="px-4 py-3 font-semibold">{a.name}</td>
          <td className="px-4 py-3">
            <Pill tone={a.status === 'live' ? 'active' : 'neutral'}>{a.status}</Pill>
          </td>
          <td className="px-4 py-3 capitalize text-text-muted">{a.voice}</td>
          <td className="px-4 py-3 text-text-muted">{a.model}</td>
          <td className="px-4 py-3 text-text-muted">{timeAgo(a.updated_at)}</td>
        </tr>
      ))}
    </TabTable>
  )
}

function CallsTab({ d, navigate }: { d: Detail; navigate: (p: string) => void }) {
  return (
    <TabTable head={['Time', 'Channel', 'Duration', 'Lead', 'Language']} empty={d.calls.length === 0}>
      {d.calls.map((c) => (
        <tr key={c.id} onClick={() => navigate(`/admin/calls/${c.id}`)} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-high">
          <td className="px-4 py-3 text-text-muted">{timeAgo(c.started_at)}</td>
          <td className="px-4 py-3 capitalize">{c.call_type}</td>
          <td className="px-4 py-3 tabular-nums">{fmtDuration(c.duration_seconds)}</td>
          <td className="px-4 py-3">{c.lead_name || <span className="text-text-muted">—</span>}</td>
          <td className="px-4 py-3 text-text-muted">{c.reply_language || '—'}</td>
        </tr>
      ))}
    </TabTable>
  )
}

function KnowledgeTab({ d }: { d: Detail }) {
  return (
    <TabTable head={['Knowledge base', 'Sources', 'Strict mode']} empty={d.knowledgeBases.length === 0}>
      {d.knowledgeBases.map((k) => (
        <tr key={k.id} className="border-b border-border/60 last:border-0">
          <td className="px-4 py-3 font-semibold">{k.name}</td>
          <td className="px-4 py-3 tabular-nums text-text-muted">{k.sources}</td>
          <td className="px-4 py-3">{k.strict ? <Pill tone="primary">On</Pill> : <Pill tone="neutral">Off</Pill>}</td>
        </tr>
      ))}
    </TabTable>
  )
}

function NumbersTab({ d }: { d: Detail }) {
  return (
    <TabTable head={['Number', 'Label', 'Status']} empty={d.numbers.length === 0}>
      {d.numbers.map((n) => (
        <tr key={n.id} className="border-b border-border/60 last:border-0">
          <td className="px-4 py-3 font-mono">{n.number}</td>
          <td className="px-4 py-3 text-text-muted">{n.label || '—'}</td>
          <td className="px-4 py-3">
            <Pill tone={n.status === 'active' ? 'active' : 'neutral'}>{n.status}</Pill>
          </td>
        </tr>
      ))}
    </TabTable>
  )
}

function IntegrationsTab({ d }: { d: Detail }) {
  return (
    <TabTable head={['Integration', 'Category', 'Status']} empty={d.integrations.length === 0}>
      {d.integrations.map((it) => (
        <tr key={it.key} className="border-b border-border/60 last:border-0">
          <td className="px-4 py-3 font-semibold">{it.name}</td>
          <td className="px-4 py-3 capitalize text-text-muted">{it.category}</td>
          <td className="px-4 py-3">
            <Pill tone={it.status === 'connected' ? 'active' : 'neutral'}>{it.status}</Pill>
          </td>
        </tr>
      ))}
    </TabTable>
  )
}

function NotesTab({ d, onSaved }: { d: Detail; onSaved: () => void }) {
  const [notes, setNotes] = useState(d.account.notes || '')
  const [saving, setSaving] = useState(false)
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <AdminCard className="p-5 lg:col-span-2">
        <h3 className="mb-2 flex items-center gap-2 font-display text-base font-semibold">
          <Icon name="edit_note" className="text-[18px] text-primary" /> Internal notes
        </h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Administrative notes about this account — only visible to platform admins."
          className="min-h-[140px] w-full resize-y rounded-lg border border-border bg-surface-high p-3 text-sm outline-none focus:border-primary"
        />
        <div className="mt-2 flex justify-end">
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              await adminSetNotes(d.account.id, notes).finally(() => setSaving(false))
              onSaved()
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save note'}
          </button>
        </div>
      </AdminCard>
      <AdminCard className="p-5">
        <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">Audit stream</h3>
        {d.audit.length === 0 ? (
          <p className="text-sm text-text-muted">No admin actions on this account yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {d.audit.map((e, i) => (
              <div key={i} className="border-l-2 border-primary/40 pl-3">
                <div className="text-sm">
                  <span className="font-semibold capitalize">{e.action.replace(/_/g, ' ')}</span> — {e.detail}
                </div>
                <div className="text-[11px] text-text-muted">
                  {e.actor_email} · {timeAgo(e.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminCard>
    </div>
  )
}

// -------------------------------------------------------------- modals

function ReasonModal({
  title,
  field,
  confirmLabel,
  danger,
  onClose,
  onConfirm,
}: {
  title: string
  field?: { label: string; type: 'number' | 'select'; initial: string; options?: string[] }
  confirmLabel: string
  danger?: boolean
  onClose: () => void
  onConfirm: (value: string, reason: string) => Promise<void>
}) {
  const [value, setValue] = useState(field?.initial || '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <AdminCard className="w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {field && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-text-muted">{field.label}</span>
              {field.type === 'select' ? (
                <select value={value} onChange={(e) => setValue(e.target.value)} className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm capitalize outline-none focus:border-primary">
                  {field.options!.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input type="number" value={value} onChange={(e) => setValue(e.target.value)} className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary" />
              )}
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted">Reason (logged to the audit trail)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you making this change?" className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <div className="mt-1 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-muted hover:text-text">
              Cancel
            </button>
            <button
              disabled={busy || !reason.trim()}
              onClick={async () => {
                setBusy(true)
                setErr('')
                try {
                  await onConfirm(value, reason.trim())
                } catch {
                  setErr('Something went wrong. Please try again.')
                } finally {
                  setBusy(false)
                }
              }}
              className={`rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${danger ? 'bg-destructive' : 'bg-primary'}`}
            >
              {busy ? 'Working…' : confirmLabel}
            </button>
          </div>
          {!reason.trim() && <p className="text-[11px] text-text-muted">A reason is required — every action is audit-logged.</p>}
        </div>
      </AdminCard>
    </div>
  )
}

function ResetModal({ accountId, ownerEmail, onClose, onDone }: { accountId: number; ownerEmail: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)

  const run = async () => {
    setBusy(true)
    const res = await adminResetPassword(accountId).finally(() => setBusy(false))
    setLink(res.resetLink)
    setEmailSent(res.emailSent)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <AdminCard className="w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Reset owner password</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        {!link ? (
          <>
            <p className="text-sm text-text-muted">
              Generate a password-reset link for <span className="font-semibold text-text">{ownerEmail}</span>. This is logged to the audit trail.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-muted hover:text-text">
                Cancel
              </button>
              <button disabled={busy} onClick={run} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg disabled:opacity-50">
                {busy ? 'Generating…' : 'Generate link'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-2 text-sm">
              {emailSent ? 'Reset email sent. You can also copy the link:' : 'Email is not configured — copy this link and send it to the user:'}
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-high p-2">
              <input readOnly value={link} className="flex-1 bg-transparent text-xs outline-none" />
              <button onClick={() => navigator.clipboard.writeText(link)} className="rounded-md bg-primary px-2 py-1 text-xs font-bold text-bg">
                Copy
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => onDone('Password reset link generated.')} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg">
                Done
              </button>
            </div>
          </>
        )}
      </AdminCard>
    </div>
  )
}
