import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminAudit, type AdminAuditEntry } from '../../lib/adminApi'
import { AdminCard, EmptyState, ErrorState, PageHeader, Pill, timeAgo } from '../../components/AdminUI'
import { Icon } from '../../components/Icon'

const ACTION_META: Record<string, { icon: string; tone: 'primary' | 'warning' | 'suspended' | 'neutral' }> = {
  impersonate: { icon: 'visibility', tone: 'primary' },
  impersonate_write: { icon: 'edit', tone: 'primary' },
  impersonate_exit: { icon: 'visibility_off', tone: 'neutral' },
  db_backup_run: { icon: 'inventory_2', tone: 'neutral' },
  support_note: { icon: 'sticky_note_2', tone: 'neutral' },
  adjust_credits: { icon: 'toll', tone: 'warning' },
  change_plan: { icon: 'sync_alt', tone: 'warning' },
  set_status: { icon: 'block', tone: 'suspended' },
  reset_password: { icon: 'lock_reset', tone: 'warning' },
  add_note: { icon: 'edit_note', tone: 'neutral' },
}

export function AdminAudit() {
  const [filter, setFilter] = useState<'' | 'impersonation' | 'actions'>('')
  const [entries, setEntries] = useState<AdminAuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    setError(null)
    adminAudit({ action: filter, limit: 200 })
      .then((r) => setEntries(r.entries))
      .catch((e: unknown) => {
        setEntries([])
        setError(e instanceof Error ? e.message : 'Request failed')
      })
      .finally(() => setLoading(false))
  }, [filter, attempt])

  const tabs: { id: '' | 'impersonation' | 'actions'; label: string }[] = [
    { id: '', label: 'All activity' },
    { id: 'impersonation', label: 'Impersonation' },
    { id: 'actions', label: 'Admin actions' },
  ]

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every super-admin action, immutably logged for accountability." />

      <div className="mb-4 flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
              filter === t.id ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-transparent text-text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AdminCard className="overflow-hidden">
        {loading ? (
          <div className="px-4 py-6 text-center text-sm text-text-muted">Loading…</div>
        ) : error ? (
          <ErrorState message={`Couldn't load the audit log: ${error}`} onRetry={() => setAttempt((n) => n + 1)} />
        ) : entries.length === 0 ? (
          <EmptyState icon="history" message="No activity logged yet." />
        ) : (
          <div className="divide-y divide-border/60">
            {entries.map((e) => {
              const meta = ACTION_META[e.action] || { icon: 'bolt', tone: 'neutral' as const }
              return (
                <div key={e.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-high">
                    <Icon name={meta.icon} className="text-[18px] text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm">
                      <span className="font-semibold">{e.actor_email}</span>{' '}
                      <Pill tone={meta.tone}>{e.action.replace(/_/g, ' ')}</Pill>{' '}
                      {e.target_account_name && (
                        <button onClick={() => navigate(`/admin/accounts/${e.target_account_id}`)} className="text-cyan hover:underline">
                          {e.target_account_name}
                        </button>
                      )}
                    </div>
                    {e.detail && <div className="text-xs text-text-muted">{e.detail}</div>}
                  </div>
                  <span className="text-xs text-text-muted">{timeAgo(e.created_at)}</span>
                </div>
              )
            })}
          </div>
        )}
      </AdminCard>
    </>
  )
}
