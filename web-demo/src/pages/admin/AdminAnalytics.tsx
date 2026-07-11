import { useEffect, useState } from 'react'
import { adminAnalytics, type AdminAnalytics as Data } from '../../lib/adminApi'
import { AdminCard, AreaChart, BarList, EmptyState, fmtDuration, fmtINR, PageHeader, StatCard, TimeRange } from '../../components/AdminUI'

export function AdminAnalytics() {
  const [days, setDays] = useState(30)
  const [d, setD] = useState<Data | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setD(null)
    setError(false)
    adminAnalytics(days).then(setD).catch(() => setError(true))
  }, [days])

  if (error) return <EmptyState icon="error" message="Couldn't load analytics." />
  if (!d) return <div className="h-40 animate-pulse rounded-xl border border-border bg-surface" />

  const maxFunnel = Math.max(...d.funnel.map((f) => f.count), 1)

  return (
    <>
      <PageHeader title="Analytics" subtitle="Growth, usage, funnel, and revenue across the platform." action={<TimeRange value={days} onChange={setDays} />} />

      <SectionTitle>Growth</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <AdminCard className="p-5">
          <h3 className="mb-3 font-display text-base font-semibold">Signups over time</h3>
          <AreaChart data={d.signupSeries.map((s) => s.count)} />
        </AdminCard>
        <AdminCard className="p-5">
          <h3 className="mb-4 font-display text-base font-semibold">Signup method</h3>
          {d.authBreakdown.length ? (
            <BarList items={d.authBreakdown.map((a) => ({ label: a.provider, value: a.count, color: 'var(--color-primary)' }))} />
          ) : (
            <EmptyState icon="login" message="No users yet." />
          )}
        </AdminCard>
      </div>

      <SectionTitle>Activation funnel</SectionTitle>
      <AdminCard className="p-5">
        <div className="flex flex-col gap-3">
          {d.funnel.map((f, i) => {
            const prev = i > 0 ? d.funnel[i - 1].count : f.count
            const drop = prev > 0 ? Math.round((1 - f.count / prev) * 100) : 0
            return (
              <div key={f.step} className="flex items-center gap-3">
                <span className="w-40 text-sm text-text-muted">{f.step}</span>
                <div className="h-7 flex-1 overflow-hidden rounded-lg bg-surface-high">
                  <div className="flex h-full items-center rounded-lg bg-primary/70 px-2 text-xs font-bold text-bg" style={{ width: `${Math.max((f.count / maxFunnel) * 100, 6)}%` }}>
                    {f.count.toLocaleString()}
                  </div>
                </div>
                <span className="w-16 text-right text-xs text-text-muted">{i > 0 && drop > 0 ? `-${drop}%` : ''}</span>
              </div>
            )
          })}
        </div>
      </AdminCard>

      <SectionTitle>Usage</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Avg call length" value={fmtDuration(d.avgDurationSec)} icon="timer" />
        <StatCard label="Active this month" value={d.retention.activeThisMonth} sub={`${d.retention.activeLastMonth} last month`} icon="trending_up" />
        <StatCard label="MRR" value={fmtINR(d.mrr)} sub="estimated" icon="payments" />
        <StatCard label="ARPA" value={fmtINR(d.arpa)} sub="per paying account" icon="account_balance" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <AdminCard className="p-5">
          <h3 className="mb-3 font-display text-base font-semibold">Calls over time</h3>
          <AreaChart data={d.callSeries.map((s) => s.calls)} />
        </AdminCard>
        <AdminCard className="p-5">
          <h3 className="mb-4 font-display text-base font-semibold">Calls by channel</h3>
          {d.channelSplit.length ? (
            <BarList items={d.channelSplit.map((c) => ({ label: c.channel, value: c.calls }))} />
          ) : (
            <EmptyState icon="call" message="No calls yet." />
          )}
        </AdminCard>
      </div>
    </>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-6 text-[11px] font-bold uppercase tracking-widest text-text-muted first:mt-0">{children}</h2>
}
