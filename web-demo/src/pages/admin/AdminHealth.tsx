import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminHealth, type AdminHealth as Data } from '../../lib/adminApi'
import { AdminCard, EmptyState, PageHeader, Pill, StatCard, timeAgo } from '../../components/AdminUI'
import { Icon } from '../../components/Icon'

export function AdminHealth() {
  const [d, setD] = useState<Data | null>(null)
  const [error, setError] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const load = () => adminHealth().then(setD).catch(() => setError(true))
    load()
    const iv = setInterval(load, 15000) // live-ish refresh
    return () => clearInterval(iv)
  }, [])

  if (error) return <EmptyState icon="error" message="Couldn't load system health." />
  if (!d) return <div className="h-40 animate-pulse rounded-xl border border-border bg-surface" />

  return (
    <>
      <PageHeader title="System Health" subtitle="Live platform status, error feed, and configuration." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatusCard label="Database" ok={d.dbOk} okText="Connected" badText="Unreachable" />
        <StatCard label="Live calls" value={d.liveCalls} sub="active rooms" live />
        <StatCard label="Errors (24h)" value={d.errorCount24h} sub="logged events" icon="error" />
        <StatusCard label="Backend" ok={true} okText="Online" badText="Down" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <AdminCard className="overflow-hidden lg:col-span-2">
          <div className="border-b border-border px-5 py-3 font-display text-base font-semibold">Recent errors</div>
          {d.errors.length === 0 ? (
            <EmptyState icon="check_circle" message="No errors logged. All clear." />
          ) : (
            <div className="divide-y divide-border/60">
              {d.errors.map((e) => (
                <div key={e.id} className="px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Pill tone={e.level === 'error' ? 'suspended' : 'warning'}>{e.level}</Pill>
                    <span className="text-text-muted">{e.source}</span>
                    {e.account_name && (
                      <button onClick={() => navigate(`/admin/accounts/${e.account_id}`)} className="text-cyan hover:underline">
                        {e.account_name}
                      </button>
                    )}
                    <span className="ml-auto text-xs text-text-muted">{timeAgo(e.created_at)}</span>
                  </div>
                  <div className="mt-1 text-sm">{e.message}</div>
                  {e.context && <div className="mt-0.5 font-mono text-[11px] text-text-muted">{e.context}</div>}
                </div>
              ))}
            </div>
          )}
        </AdminCard>

        <AdminCard className="overflow-hidden">
          <div className="border-b border-border px-5 py-3 font-display text-base font-semibold">API keys configured</div>
          <div className="divide-y divide-border/60">
            {d.apiKeys.map((k) => (
              <div key={k.name} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span>{k.name}</span>
                {k.configured ? (
                  <Icon name="check_circle" className="text-[18px] text-success" />
                ) : (
                  <span className="text-xs text-text-muted">not set</span>
                )}
              </div>
            ))}
          </div>
        </AdminCard>
      </div>
    </>
  )
}

function StatusCard({ label, ok, okText, badText }: { label: string; ok: boolean; okText: string; badText: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</span>
        <span className={`h-2 w-2 rounded-full ${ok ? 'bg-success' : 'bg-destructive'}`} />
      </div>
      <div className={`mt-1 font-display text-lg font-bold ${ok ? 'text-success' : 'text-destructive'}`}>{ok ? okText : badText}</div>
    </div>
  )
}
