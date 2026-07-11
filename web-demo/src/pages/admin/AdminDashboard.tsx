import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminOverview, type AdminOverview } from '../../lib/adminApi'
import { AdminCard, AreaChart, BarList, EmptyState, fmtINR, PageHeader, PlanPill, StatCard, TimeRange, timeAgo } from '../../components/AdminUI'
import { Icon } from '../../components/Icon'

export function AdminDashboard() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<AdminOverview | null>(null)
  const [error, setError] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    setData(null)
    setError(false)
    adminOverview(days).then(setData).catch(() => setError(true))
  }, [days])

  if (error) return <EmptyState icon="error" message="Couldn't load platform metrics." />
  if (!data) return <DashboardSkeleton />

  const k = data.kpis
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Platform-wide health and usage metrics."
        action={<TimeRange value={days} onChange={setDays} />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Accounts" value={k.accounts.toLocaleString()} sub={`${k.suspended} suspended`} icon="apartment" />
        <StatCard label="Active" value={k.activeAccounts.toLocaleString()} sub={`in last ${days}d`} icon="bolt" />
        <StatCard label="Live calls" value={k.liveCalls} sub="in progress" live />
        <StatCard label="MRR" value={fmtINR(k.mrr)} sub="estimated" icon="payments" />
        <StatCard label="Signups (7d)" value={k.signups7d} sub={`${k.signupsToday} today`} icon="person_add" />
        <StatCard label={`Calls (${days}d)`} value={k.callsWindow.toLocaleString()} sub={`${k.callsTotal.toLocaleString()} all-time`} icon="call" />
        <StatCard label={`Minutes (${days}d)`} value={k.minutesWindow.toLocaleString()} sub="across all calls" icon="timer" />
        <StatCard
          label="Credits used"
          value={`${k.creditsPct}%`}
          sub={`${k.creditsConsumed.toLocaleString()} of ${k.creditsAllocated.toLocaleString()}`}
          icon="toll"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <AdminCard className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold">Signups over time</h3>
            <span className="flex items-center gap-1.5 text-xs text-text-muted">
              <span className="h-2 w-2 rounded-full bg-primary" /> Daily
            </span>
          </div>
          <AreaChart data={data.signupSeries.map((s) => s.count)} />
        </AdminCard>
        <AdminCard className="p-5">
          <h3 className="mb-4 font-display text-base font-semibold">Calls by channel</h3>
          {data.callsByChannel.length ? (
            <BarList items={data.callsByChannel.map((c) => ({ label: c.channel, value: c.count }))} />
          ) : (
            <EmptyState icon="call" message="No calls in this range yet." />
          )}
        </AdminCard>
      </div>

      <div className="mt-6">
        <h3 className="mb-3 flex items-center gap-2 font-display text-base font-semibold">
          <Icon name="warning" className="text-[18px] text-amber" /> Needs attention
        </h3>
        <div className="grid gap-3 md:grid-cols-3">
          <AttentionCard
            icon="credit_card_off"
            count={data.needsAttention.nearLimit}
            label="accounts near credit limit"
            hint="Review usage & upsell"
            onClick={() => navigate('/admin/billing')}
          />
          <AttentionCard
            icon="person_off"
            count={data.needsAttention.zeroCallSignups}
            label="signups with zero calls"
            hint="Activation risk — follow up"
            onClick={() => navigate('/admin/accounts?activity=idle')}
          />
          <AttentionCard
            icon="block"
            count={data.needsAttention.suspended}
            label="suspended accounts"
            hint="Review status"
            onClick={() => navigate('/admin/accounts?status=suspended')}
          />
        </div>
      </div>

      <AdminCard className="mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="font-display text-base font-semibold">Recent signups</h3>
          <button onClick={() => navigate('/admin/accounts')} className="text-xs font-semibold text-cyan hover:underline">
            View all
          </button>
        </div>
        {data.recentSignups.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
                  <th className="px-5 py-2.5 font-semibold">Account</th>
                  <th className="px-5 py-2.5 font-semibold">Owner</th>
                  <th className="px-5 py-2.5 font-semibold">Plan</th>
                  <th className="px-5 py-2.5 font-semibold">Method</th>
                  <th className="px-5 py-2.5 font-semibold">Signed up</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSignups.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/admin/accounts/${s.id}`)}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-high"
                  >
                    <td className="px-5 py-3 font-semibold">{s.name}</td>
                    <td className="px-5 py-3 text-text-muted">{s.owner_email || '—'}</td>
                    <td className="px-5 py-3">
                      <PlanPill plan={s.plan} />
                    </td>
                    <td className="px-5 py-3 capitalize text-text-muted">{s.auth_provider || 'password'}</td>
                    <td className="px-5 py-3 text-text-muted">{timeAgo(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="group" message="No accounts yet." />
        )}
      </AdminCard>
    </>
  )
}

function AttentionCard({ icon, count, label, hint, onClick }: { icon: string; count: number; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-primary/50"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-high">
        <Icon name={icon} className="text-[20px] text-amber" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold">
          <span className="tabular-nums">{count}</span> {label}
        </div>
        <div className="text-xs text-text-muted">{hint}</div>
      </div>
      <Icon name="chevron_right" className="text-text-muted" />
    </button>
  )
}

function DashboardSkeleton() {
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Platform-wide health and usage metrics." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-surface" />
        ))}
      </div>
    </>
  )
}
