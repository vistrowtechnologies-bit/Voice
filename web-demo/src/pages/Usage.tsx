import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bar } from 'react-chartjs-2'
import '../lib/chart-setup'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { Card } from '../components/ui/Card'
import { DataTable } from '../components/ui/DataTable'
import type { DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { SectionCard } from '../components/ui/SectionCard'
import { StatTile } from '../components/ui/StatTile'
import { fetchActiveCalls, fetchUsage, formatDateTime, usageExportUrl, usageTimeZone } from '../lib/api'
import { hasRole, useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'
import type { ActiveCallInfo, UsageBucket, UsageReport } from '../lib/types'

type Preset = 'today' | '7d' | '30d' | 'cycle' | 'custom'
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'cycle', label: 'This cycle' },
  { key: 'custom', label: 'Custom' },
]
const REFRESH_MS = 30_000

/** YYYY-MM-DD for `daysAgo` days before now, in the zone the server cuts days in. */
function localDate(daysAgo = 0): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000)
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: usageTimeZone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

const fmt = (n: number, digits = 1) => n.toLocaleString('en-IN', { maximumFractionDigits: digits })

function chartTokens() {
  const s = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback
  return { grid: v('--color-border', '#2A2438'), tick: v('--color-text-muted', '#9089B0') }
}

function BreakdownCard({ title, icon, rows }: { title: string; icon: string; rows: UsageBucket[] }) {
  const total = rows.reduce((sum, r) => sum + r.credits, 0)
  return (
    <SectionCard title={title} action={<Icon name={icon} className="text-[18px] text-text-muted" />}>
      {rows.length === 0 ? (
        <EmptyState compact icon={icon} text="No calls in this range." />
      ) : (
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.key} className="px-4 py-2.5 text-sm sm:px-5">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{r.label}</span>
                <span className="shrink-0 text-xs text-text-muted">
                  {fmt(r.minutes)} min · {r.calls} {r.calls === 1 ? 'call' : 'calls'} · <span className="font-semibold text-text">{fmt(r.credits)} credits</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-high/60">
                <div className="h-full rounded-full bg-primary" style={{ width: `${total > 0 ? Math.max(2, (r.credits / total) * 100) : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

export function Usage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const theme = useTheme()
  void theme // re-render on theme toggle so chart colors follow the tokens
  const t = chartTokens()
  const storageKey = `vv-usage-range:${user?.id ?? 'anon'}`

  const [preset, setPreset] = useState<Preset>('30d')
  const [custom, setCustom] = useState({ from: localDate(29), to: localDate() })
  const [cycleStart, setCycleStart] = useState<string | null>(null)
  const [report, setReport] = useState<UsageReport | null>(null)
  const [error, setError] = useState('')
  const [activeCalls, setActiveCalls] = useState<ActiveCallInfo[]>([])
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
      if (saved && PRESETS.some((p) => p.key === saved.preset)) {
        setPreset(saved.preset)
        if (saved.from && saved.to) setCustom({ from: saved.from, to: saved.to })
      }
    } catch { /* stay on the default range */ }
  }, [storageKey])

  const today = localDate()
  const range =
    preset === 'today' ? { from: today, to: today }
    : preset === '7d' ? { from: localDate(6), to: today }
    : preset === '30d' ? { from: localDate(29), to: today }
    : preset === 'cycle' ? { from: cycleStart ?? localDate(29), to: today }
    : custom

  const choose = (next: Preset, nextCustom = custom) => {
    setPreset(next)
    setCustom(nextCustom)
    try { localStorage.setItem(storageKey, JSON.stringify({ preset: next, ...nextCustom })) } catch { /* ignore */ }
  }

  useEffect(() => {
    let cancelled = false
    // The first load always runs; only the 30 s refresh pauses while the
    // tab is hidden, so a page opened in a background tab is not blank.
    const load = (first = false) => {
      if (document.hidden && !first) return
      fetchUsage(range.from, range.to)
        .then((r) => {
          if (cancelled) return
          setReport(r)
          setError('')
          setCycleStart(r.cycle.start)
        })
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load usage'))
      fetchActiveCalls()
        .then((calls) => !cancelled && setActiveCalls(calls))
        .catch(() => !cancelled && setActiveCalls([]))
      setNow(Date.now())
    }
    load(true)
    const interval = setInterval(() => load(), REFRESH_MS)
    const onVisible = () => load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [range.from, range.to])

  const totals = report?.totals
  const balance = report?.balance
  const daysLeft = balance?.estDaysLeft
  const topCallColumns: DataTableColumn<UsageReport['topCalls'][number]>[] = [
    { key: 'caller', header: 'Call', primary: true, render: (c) => <span className="font-medium">{c.callerName}</span> },
    { key: 'agent', header: 'Agent', render: (c) => c.agentName },
    { key: 'channel', header: 'Channel', render: (c) => c.channel },
    { key: 'started', header: 'Started', render: (c) => <span className="text-text-muted">{formatDateTime(c.startedAt)}</span> },
    { key: 'minutes', header: 'Minutes', className: 'text-right', render: (c) => fmt(c.minutes) },
    { key: 'credits', header: 'Credits', className: 'text-right', render: (c) => <span className="font-semibold">{fmt(c.credits)}</span> },
  ]
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-semibold transition-colors ${active ? 'bg-primary text-bg' : 'bg-surface border border-border text-text-muted hover:text-text'}`
  const dateInput = 'rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text'

  return (
    <DashboardLayout>
      <PageHeader title="Usage" subtitle="Where your credits go - by day, channel, agent, voice and model, in your timezone.">
        {hasRole(user, 'admin') && (
          <a
            href={usageExportUrl(range.from, range.to)}
            download
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-bold hover:border-primary"
          >
            <Icon name="download" className="text-[18px]" />
            Export CSV
          </a>
        )}
      </PageHeader>

      <div className="space-y-5">
        {activeCalls.length > 0 && (
          <Card variant="flat" padding="sm" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="flex items-center gap-2 font-semibold">
              <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-cyan" />
              {activeCalls.length} live {activeCalls.length === 1 ? 'call' : 'calls'} · credits accruing
            </span>
            {activeCalls.map((c) => (
              <span key={c.room} className="text-xs text-text-muted">
                {c.visitor_identity} · {Math.max(0, Math.floor((now - c.joined_at_ms) / 60000))} min
              </span>
            ))}
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" onClick={() => choose(p.key)} className={chip(preset === p.key)}>
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <span className="flex items-center gap-1.5 text-xs text-text-muted">
              <input type="date" className={dateInput} value={custom.from} max={custom.to} onChange={(e) => choose('custom', { ...custom, from: e.target.value })} />
              to
              <input type="date" className={dateInput} value={custom.to} min={custom.from} max={today} onChange={(e) => choose('custom', { ...custom, to: e.target.value })} />
            </span>
          )}
          <span className="text-xs text-text-muted">
            {range.from === range.to ? range.from : `${range.from} → ${range.to}`} · {report?.range.tz ?? usageTimeZone()}
          </span>
        </div>

        {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive">{error}</p>}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatTile label="Credits used" value={totals ? fmt(totals.credits) : '…'} icon="toll" tone="primary" hint={totals && totals.testOverageCredits > 0 ? `incl. ${fmt(totals.testOverageCredits)} for test calls past the free minutes` : 'in this range'} />
          <StatTile label="Minutes" value={totals ? fmt(totals.minutes) : '…'} icon="timer" tone="cyan" hint="billable call minutes" />
          <StatTile label="Calls" value={totals ? String(totals.calls) : '…'} icon="call" tone="magenta" hint="dashboard test calls excluded" />
          <StatTile label="Avg credits / min" value={totals ? fmt(totals.avgCreditsPerMinute, 2) : '…'} icon="speed" tone="amber" hint="across every call in range" />
          <StatTile
            label="Credits left"
            value={balance ? fmt(balance.creditsRemaining) : '…'}
            icon="account_balance_wallet"
            tone={balance && balance.creditsTotal > 0 && balance.creditsRemaining / balance.creditsTotal < 0.1 ? 'destructive' : 'success'}
            hint={balance ? (daysLeft == null ? `of ${fmt(balance.creditsTotal)} this cycle` : `≈ ${fmt(daysLeft, 0)} days at this pace`) : ''}
          />
        </div>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Credits and minutes per day</h3>
            <span className="flex items-center gap-3 text-[11px] text-text-muted">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary" /> Credits</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-cyan" /> Minutes</span>
            </span>
          </div>
          <div className="h-[220px]">
            {report && report.totals.calls > 0 ? (
              <Bar
                data={{
                  labels: report.daily.map((d) => d.date.slice(5)),
                  datasets: [
                    { label: 'Credits', data: report.daily.map((d) => d.credits), backgroundColor: '#A855F7', borderRadius: 3 },
                    { label: 'Minutes', data: report.daily.map((d) => d.minutes), backgroundColor: '#22D3EE', borderRadius: 3 },
                  ],
                }}
                options={{
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { grid: { display: false }, ticks: { color: t.tick, font: { size: 11 }, maxTicksLimit: 12 } },
                    y: { beginAtZero: true, grid: { color: t.grid }, ticks: { color: t.tick, font: { size: 11 } } },
                  },
                }}
              />
            ) : (
              <EmptyState icon="bar_chart" text={report ? 'No calls in this range.' : 'Loading usage…'} />
            )}
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <BreakdownCard title="By channel" icon="call_split" rows={report?.byChannel ?? []} />
          <BreakdownCard title="By agent" icon="smart_toy" rows={report?.byAgent ?? []} />
          <BreakdownCard title="By voice tier" icon="graphic_eq" rows={report?.byVoiceTier ?? []} />
          <BreakdownCard title="By model tier" icon="memory" rows={report?.byModelTier ?? []} />
          <BreakdownCard title="By direction" icon="swap_horiz" rows={report?.byDirection ?? []} />
          <BreakdownCard title="By phone number" icon="dialpad" rows={report?.byNumber ?? []} />
        </div>

        <SectionCard title="Top calls by credits" subtitle="The ten most expensive calls in this range. Click one to open it.">
          <div className="overflow-x-auto">
            <DataTable
              columns={topCallColumns}
              rows={report?.topCalls ?? []}
              rowKey={(c) => c.id}
              loading={!report && !error}
              emptyMessage={<EmptyState compact icon="history" text="No calls in this range." />}
              onRowClick={(c) => navigate(`/dashboard/calls/${c.id}`)}
              rowAriaLabel={(c) => `Open call with ${c.callerName}`}
            />
          </div>
        </SectionCard>

        <p className="text-xs text-text-muted">
          <Icon name="info" className="mr-1 align-[-3px] text-[14px]" />
          How credits are counted: credits = call minutes × channel rate × voice multiplier × model multiplier (never below 0.75/min). Rates and your plan are on{' '}
          <Link to="/dashboard/billing" className="font-semibold text-cyan hover:underline">Plan &amp; billing</Link>.
        </p>
      </div>
    </DashboardLayout>
  )
}
