import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminOverview, type AdminOverview } from '../../lib/adminApi'
import {
  AdminCard,
  AreaChart,
  BarList,
  EmptyState,
  ErrorState,
  fmtDateTime,
  fmtINR,
  PageHeader,
  PlanPill,
  ROW_FOCUS,
  rowLinkProps,
  StatCard,
  TimeRange,
  timeAgo,
  useVisiblePoll,
} from '../../components/AdminUI'
import { Icon } from '../../components/Icon'

const POLL_MS = 30000
// null = the server has no basis for the number yet (e.g. trials have no fixed length).
const n = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('en-IN'))

export function AdminDashboard() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<AdminOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  // The overview is polled (live calls, failed calls, workers), so a response
  // for a previously selected range must not land under the new range's labels.
  const daysRef = useRef(days)
  daysRef.current = days
  useEffect(() => {
    setData(null)
    setError(null)
  }, [days])
  const load = useCallback(() => {
    const asked = days
    adminOverview(asked)
      .then((r) => {
        if (asked !== daysRef.current) return
        setData(r)
        setError(null)
      })
      .catch((e: unknown) => {
        if (asked === daysRef.current) setError(e instanceof Error ? e.message : 'Request failed')
      })
  }, [days])
  useVisiblePoll(load, POLL_MS)

  if (!data && error) return <ErrorState message={`Couldn't load platform metrics: ${error}`} onRetry={load} />
  if (!data) return <DashboardSkeleton />

  const k = data.kpis
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Platform-wide health and usage metrics. Refreshes every 30 s while this tab is open."
        action={<TimeRange value={days} onChange={setDays} />}
      />

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber">
          <Icon name="sync_problem" className="text-[16px]" />
          Last refresh failed ({error}), retrying. Showing the previous data.
        </div>
      )}

      <OperationsOverview data={data} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Accounts" value={n(k.accounts)} sub={`${n(k.suspended)} suspended`} icon="apartment" />
        <StatCard label="Active" value={n(k.activeAccounts)} sub={`in last ${days}d`} icon="bolt" />
        <StatCard
          label="Live calls"
          value={n(k.liveCalls)}
          sub="in progress · refreshes every 30 s"
          icon="phone_in_talk"
          live={typeof k.liveCalls === 'number' && k.liveCalls > 0}
        />
        <StatCard label="Contracted MRR" value={fmtINR(k.mrr)} sub="active subscriptions" icon="payments" />
        <StatCard label="Signups (7d)" value={n(k.signups7d)} sub={`${n(k.signupsToday)} today`} icon="person_add" />
        <StatCard label={`Calls (${days}d)`} value={n(k.callsWindow)} sub={`${n(k.callsTotal)} all-time`} icon="call" />
        <StatCard label={`Minutes (${days}d)`} value={n(k.minutesWindow)} sub="across all calls" icon="timer" />
        <StatCard
          label="Credits used"
          value={`${k.creditsPct}%`}
          sub={`${n(k.creditsConsumed)} of ${n(k.creditsAllocated)}`}
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
            onClick={() => navigate('/admin/finance')}
          />
          <AttentionCard
            icon="person_off"
            count={data.needsAttention.zeroCallSignups}
            label="signups with zero calls"
            hint="Activation risk - follow up"
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
                  <th className="px-5 py-2.5 text-right font-semibold">Calls</th>
                  <th className="px-5 py-2.5 font-semibold">First call</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSignups.map((s) => (
                  <tr
                    key={s.id}
                    {...rowLinkProps(() => navigate(`/admin/accounts/${s.id}`))}
                    className={`cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-high ${ROW_FOCUS}`}
                  >
                    <td className="px-5 py-3 font-semibold">{s.name}</td>
                    <td className="px-5 py-3 text-text-muted">{s.owner_email || '-'}</td>
                    <td className="px-5 py-3">
                      <PlanPill plan={s.effectivePlan ?? s.plan} />
                    </td>
                    <td className="px-5 py-3 capitalize text-text-muted">{s.auth_provider || 'password'}</td>
                    <td className="px-5 py-3 text-text-muted" title={fmtDateTime(s.created_at)}>
                      {timeAgo(s.created_at)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{s.calls == null ? '-' : n(s.calls)}</td>
                    <td className="px-5 py-3 text-text-muted" title={fmtDateTime(s.firstCallAt)}>
                      {s.firstCallAt ? timeAgo(s.firstCallAt) : s.calls === 0 ? <span className="text-amber">No call yet</span> : '-'}
                    </td>
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

/** Alert strip (non-zero problems only, each linking to where it's fixed)
 * plus the operations tiles. Renders nothing until the backend sends `ops`. */
function OperationsOverview({ data }: { data: AdminOverview }) {
  const ops = data.ops
  const rev = data.revenueMtd
  if (!ops && !rev) return null

  const unhealthyWorkers = ops ? Math.max(0, ops.workersExpected - ops.workersHealthy) : 0
  // One low-credit account opens it directly; several jump to the list below.
  const lowList = ops?.creditsLowList ?? []
  const lowCreditTo = lowList.length === 1 ? `/admin/accounts/${lowList[0].accountId}` : lowList.length > 1 ? '#low-credits' : undefined
  const alerts: { count: number; text: string; to?: string; critical?: boolean }[] = ops
    ? [
        { count: unhealthyWorkers, text: `of ${n(ops.workersExpected)} LiveKit workers unhealthy`, to: '/admin/health', critical: true },
        { count: ops.failedCalls1h, text: 'failed calls in the last hour', to: '/admin/calls?outcome=failed&hours=1', critical: true },
        { count: ops.zeroBalanceLiveAccounts, text: 'live accounts with zero credits', to: '/admin/accounts', critical: true },
        { count: ops.creditsLowAccounts, text: 'live accounts low on credits', to: lowCreditTo },
        // No cross-tenant integrations view yet, so this one is informational.
        { count: ops.integrationFailures24h, text: 'integration delivery failures (24 h)' },
        { count: ops.awaitingUs, text: 'support tickets awaiting our reply', to: '/admin/support' },
      ].filter((a) => a.count > 0)
    : []

  return (
    <div className="mb-6">
      {alerts.length > 0 && (
        <div role="status" className="mb-3 flex flex-wrap gap-2">
          {alerts.map((a) => {
            const cls = `flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              a.critical ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-amber/40 bg-amber/10 text-amber'
            }`
            const body = (
              <>
                <Icon name={a.critical ? 'error' : 'warning'} className="text-[15px]" />
                <span className="tabular-nums">{n(a.count)}</span> {a.text}
              </>
            )
            return a.to?.startsWith('#') ? (
              <a key={a.text} href={a.to} className={`${cls} hover:underline`}>
                {body}
                <Icon name="chevron_right" className="text-[15px]" />
              </a>
            ) : a.to ? (
              <Link key={a.text} to={a.to} className={`${cls} hover:underline`}>
                {body}
                <Icon name="chevron_right" className="text-[15px]" />
              </Link>
            ) : (
              <span key={a.text} className={cls}>
                {body}
              </span>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {ops && (
          <>
            <StatCard label="Failed calls (1 h)" value={n(ops.failedCalls1h)} sub={`${n(ops.failedCalls24h)} in the last 24 h`} icon="phone_missed" />
            <StatCard
              label="Workers healthy"
              value={`${n(ops.workersHealthy)}/${n(ops.workersExpected)}`}
              sub="LiveKit agent heartbeats"
              icon="dns"
            />
            {/* TODO: link Trials ending / Cancellations once an admin page lists those accounts (none exists yet). */}
            <StatCard label="Trials ending" value={n(ops.trialsEnding7d)} sub="in the next 7 days" icon="hourglass_bottom" />
            <StatCard label="Cancellations" value={n(ops.cancellationsPending)} sub="pending at period end" icon="event_busy" />
            <StatCard label="Credits low" value={n(ops.creditsLowAccounts)} sub="live, under ~3 days left" icon="battery_alert" />
            <Link to="/admin/support" className="rounded-xl transition-colors hover:[&>div]:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <StatCard label="Open tickets" value={n(ops.openTickets)} sub={`${n(ops.awaitingUs)} awaiting us`} icon="support_agent" />
            </Link>
          </>
        )}
        {rev && (
          <StatCard
            label="Revenue MTD (net)"
            value={fmtINR(rev.netInr)}
            sub={`Captured ${fmtINR(rev.capturedInr)} · top-ups ${fmtINR(rev.topupsInr)} · refunds ${fmtINR(rev.refundsInr)}`}
            icon="currency_rupee"
          />
        )}
      </div>

      {ops?.creditsLowList && ops.creditsLowList.length > 0 && (
        <AdminCard className="mt-3 overflow-hidden">
          <div id="low-credits" className="scroll-mt-4 border-b border-border px-5 py-3 text-sm font-semibold">Low on credits
 (live agent, under ~3 days of its own use or 50 credits)</div>
          <div className="divide-y divide-border/60">
            {ops.creditsLowList.map((p) => (
              <Link key={p.accountId} to={`/admin/accounts/${p.accountId}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-surface-high">
                <span className="min-w-0 truncate font-semibold">{p.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-text-muted">
                  {n(p.remaining)} left · {n(p.avgDaily)}/day ·{' '}
                  <span className="font-semibold text-amber">{p.daysLeft == null ? 'no recent use' : `~${p.daysLeft} days`}</span>
                </span>
              </Link>
            ))}
          </div>
        </AdminCard>
      )}
    </div>
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
