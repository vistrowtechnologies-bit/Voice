import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import '../lib/chart-setup'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import {
  LANGUAGE_NAMES,
  fetchActiveCalls,
  fetchAnalytics,
  fetchDashboardSummary,
  fetchIntelligence,
  fetchUsageTrends,
  formatDuration,
  type IntelligenceSummary,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'
import type { ActiveCallInfo, Analytics, DashboardSummary, UsageTrends } from '../lib/types'

const AGENT_STATE_STYLES: Record<string, string> = {
  listening: 'bg-cyan/20 text-cyan border-cyan/30',
  thinking: 'bg-primary/20 text-primary border-primary/30',
  speaking: 'bg-magenta/20 text-magenta border-magenta/30',
}

const RANGE_OPTIONS = [
  { label: 'Week', days: 7 },
  { label: 'Fortnight', days: 14 },
  { label: 'Month', days: 30 },
]

// Chart grid/tick/segment-border colors come from the live CSS tokens so
// they follow the light/dark switch — read at render, recomputed whenever
// useTheme() re-renders the Dashboard on a toggle.
function chartTokens() {
  const s = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback
  return {
    grid: v('--color-border', '#2A2438'),
    tick: v('--color-text-muted', '#9089B0'),
    surface: v('--color-surface', '#17121F'),
    muted: v('--color-muted', '#6B647F'),
  }
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function Dashboard() {
  const [tab, setTab] = useState<'overview' | 'analytics'>('overview')
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [trends, setTrends] = useState<UsageTrends | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [intel, setIntel] = useState<IntelligenceSummary | null>(null)
  const [activeCalls, setActiveCalls] = useState<ActiveCallInfo[]>([])
  const [rangeDays, setRangeDays] = useState(14)

  const { user } = useAuth()
  // Re-render (and recompute chart colors) when the header toggles the theme.
  const theme = useTheme()
  const t = chartTokens()
  void theme
  const GRID = { color: t.grid }
  const TICKS = { color: t.tick, font: { size: 11 } }

  useEffect(() => {
    fetchDashboardSummary().then(setSummary).catch(() => setSummary(null))
    fetchAnalytics().then(setAnalytics).catch(() => setAnalytics(null))
    fetchIntelligence(30).then(setIntel).catch(() => setIntel(null))
  }, [])

  useEffect(() => {
    fetchUsageTrends(rangeDays).then(setTrends).catch(() => setTrends(null))
  }, [rangeDays])

  useEffect(() => {
    let cancelled = false
    const poll = () => {
      fetchActiveCalls()
        .then((calls) => !cancelled && setActiveCalls(calls))
        .catch(() => !cancelled && setActiveCalls([]))
    }
    poll()
    const interval = setInterval(poll, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const successPct = summary ? Math.round(summary.qualifiedRatio * 100) : 0

  return (
    <DashboardLayout>
      <PageHeader title="Dashboard" subtitle="Overview of your voice AI platform" />

      <section className="flex flex-col gap-6 p-4 sm:p-6">
        <div className="flex items-center gap-6 border-b border-border">
          {(['overview', 'analytics'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative pb-3 text-sm font-medium capitalize ${
                tab === t ? 'text-text' : 'text-text-muted hover:text-text'
              }`}
            >
              {t}
              {tab === t && <span className="absolute -bottom-px left-0 h-0.5 w-full bg-primary" />}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <>
            <div>
              <h2 className="text-xl font-bold">{greeting()}, {user?.accountName ?? 'there'}</h2>
              <p className="mt-1 text-sm text-text-muted">
                Your agents handled <span className="font-semibold text-text">{summary?.totalCalls ?? 0} calls</span>{' '}
                with <span className="font-semibold text-cyan">{successPct}% qualified</span>
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <MetricCard label="Total Minutes" value={String(summary?.totalMinutes ?? 0)} icon="timer" hint="across all calls" tone="cyan" />
              <MetricCard label="Active Agents" value={String(summary?.activeAgents ?? 0)} icon="smart_toy" hint="live and taking calls" tone="primary" />
              <MetricCard
                label="Live Calls"
                value={String(activeCalls.length)}
                hint={activeCalls.length > 0 ? 'in progress right now' : 'none right now'}
                pulse={activeCalls.length > 0}
                tone="magenta"
              />
              <MetricCard label="Qualified Leads" value={String(summary?.qualifiedCalls ?? 0)} icon="check_circle" hint="name + intent captured" tone="success" />
              <MetricCard label="Success Rate" value={`${successPct}%`} icon="trending_up" hint="calls that qualified" tone="amber" />
              <MetricCard
                label="Conversion"
                value={`${summary ? Math.round(summary.conversionRatio * 100) : 0}%`}
                icon="event_available"
                hint="calls → site visits"
                tone="primary"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-border bg-surface p-5 lg:col-span-2">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Usage trends</h3>
                  <div className="flex gap-1 rounded-lg border border-border p-0.5">
                    {RANGE_OPTIONS.map((r) => (
                      <button
                        key={r.days}
                        onClick={() => setRangeDays(r.days)}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                          rangeDays === r.days ? 'bg-primary text-bg' : 'text-text-muted hover:text-text'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-[220px]">
                  {trends && trends.labels.length > 0 ? (
                    <Line
                      data={{
                        labels: trends.labels,
                        datasets: [
                          { label: 'Calls', data: trends.calls, borderColor: '#A855F7', backgroundColor: 'rgba(168,85,247,0.08)', fill: true, tension: 0.35, pointRadius: 2 },
                          { label: 'Qualified', data: trends.qualified, borderColor: '#22D3EE', backgroundColor: 'rgba(34,211,238,0.08)', fill: true, tension: 0.35, pointRadius: 2 },
                        ],
                      }}
                      options={{
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { x: { grid: { display: false }, ticks: TICKS }, y: { grid: GRID, ticks: { ...TICKS, precision: 0 } } },
                      }}
                    />
                  ) : (
                    <EmptyChart text="No calls yet in this range — every call the agent takes lands here automatically." />
                  )}
                </div>
              </div>

              <div className="flex flex-col rounded-xl border border-border bg-surface p-5">
                <h3 className="mb-4 text-sm font-semibold">Call outcomes</h3>
                {summary && summary.totalCalls > 0 ? (
                  <>
                    <div className="flex flex-1 items-center justify-center py-2">
                      <div className="h-[150px] w-[150px]">
                        <Doughnut
                          data={{
                            labels: ['Site visit booked', 'Qualified', 'Not qualified'],
                            datasets: [
                              {
                                data: [
                                  summary.siteVisits,
                                  summary.qualifiedCalls - summary.siteVisits,
                                  summary.totalCalls - summary.qualifiedCalls,
                                ],
                                backgroundColor: ['#A855F7', '#22D3EE', t.muted],
                                borderColor: t.surface,
                                borderWidth: 3,
                              },
                            ],
                          }}
                          options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '70%' }}
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-col gap-1.5 text-[11px] text-text-muted">
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />Site visit booked · {summary.siteVisits}</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan" />Qualified · {summary.qualifiedCalls - summary.siteVisits}</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-muted" />Not qualified · {summary.totalCalls - summary.qualifiedCalls}</span>
                    </div>
                  </>
                ) : (
                  <EmptyChart text="Outcomes appear once calls are logged." />
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  Live calls
                  {activeCalls.length > 0 && <span className="pulse-dot h-2 w-2 rounded-full bg-cyan" />}
                </h3>
                <span className="text-[11px] text-text-muted">{activeCalls.length} in progress</span>
              </div>
              <div className="divide-y divide-border">
                {activeCalls.length === 0 && (
                  <p className="px-5 py-6 text-sm text-text-muted">
                    No live calls right now — this reflects real LiveKit rooms. Start a call from the
                    landing page to see it appear here.
                  </p>
                )}
                {activeCalls.map((call) => (
                  <div key={call.room} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                      {call.visitor_identity.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{call.visitor_identity}</p>
                      <p className="truncate text-[11px] text-text-muted">{call.room}</p>
                    </div>
                    <span
                      className={`whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-semibold capitalize ${
                        AGENT_STATE_STYLES[call.state] ?? 'border-border text-text-muted'
                      }`}
                    >
                      {call.state}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border px-5 py-3">
                <Link to="/dashboard/calls" className="text-xs font-bold text-cyan hover:underline">
                  View full call history →
                </Link>
              </div>
            </div>
          </>
        )}

        {tab === 'analytics' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface p-5 lg:col-span-2">
              <div className="mb-4 flex items-center gap-2">
                <Icon name="auto_awesome" className="text-[18px] text-cyan" />
                <h3 className="text-sm font-semibold">Conversation intelligence</h3>
                <span className="text-xs text-text-muted">· last 30 days</span>
              </div>
              {!intel || intel.analyzed === 0 ? (
                <p className="text-sm text-text-muted">
                  Analyze calls from any call's detail page to build sentiment, outcome, and QA insights here.
                </p>
              ) : (
                <div className="flex flex-col gap-5">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <IntelStat label="Calls analyzed" value={String(intel.analyzed)} />
                    <IntelStat label="Avg agent QA" value={intel.avgQaScore != null ? `${intel.avgQaScore}/100` : '—'} tone="text-primary" />
                    <IntelStat label="Positive" value={String(intel.sentiment.positive)} tone="text-success" />
                    <IntelStat label="Negative" value={String(intel.sentiment.negative)} tone="text-destructive" />
                  </div>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-semibold text-text-muted">Outcomes</p>
                      <div className="flex flex-col gap-1.5">
                        {intel.outcomes.map((o) => {
                          const max = Math.max(...intel.outcomes.map((x) => x.count), 1)
                          return (
                            <div key={o.outcome} className="flex items-center gap-2 text-xs">
                              <span className="w-28 shrink-0 capitalize text-text-muted">{o.outcome.replace(/_/g, ' ')}</span>
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-high">
                                <div className="h-full bg-cyan" style={{ width: `${(o.count / max) * 100}%` }} />
                              </div>
                              <span className="w-6 text-right tabular-nums">{o.count}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold text-text-muted">Top disqualification reasons</p>
                      {intel.topDisqualifications.length === 0 ? (
                        <p className="text-xs text-text-muted">None recorded.</p>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {intel.topDisqualifications.map((r) => (
                            <div key={r.reason} className="flex items-center justify-between gap-2 text-xs">
                              <span className="truncate capitalize text-text">{r.reason}</span>
                              <span className="shrink-0 rounded-full bg-surface-high px-2 py-0.5 tabular-nums text-text-muted">{r.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="mb-4 text-sm font-semibold">Calls by channel</h3>
              <div className="h-[200px]">
                {analytics && analytics.byChannel && analytics.byChannel.length > 0 ? (
                  <Bar
                    data={{
                      labels: analytics.byChannel.map((c) => c.channel),
                      datasets: [
                        { label: 'Calls', data: analytics.byChannel.map((c) => c.calls), backgroundColor: '#A855F7', borderRadius: 4 },
                        { label: 'Qualified', data: analytics.byChannel.map((c) => c.qualified), backgroundColor: '#22D3EE', borderRadius: 4 },
                      ],
                    }}
                    options={{
                      maintainAspectRatio: false,
                      plugins: { legend: { display: true, labels: { color: t.tick, boxWidth: 10, font: { size: 11 } } } },
                      scales: { x: { grid: { display: false }, ticks: TICKS }, y: { grid: GRID, ticks: { ...TICKS, precision: 0 } } },
                    }}
                  />
                ) : (
                  <EmptyChart text="Channel split appears after the first calls — Web, Website Widget, and Phone." />
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="mb-4 text-sm font-semibold">Calls by agent</h3>
              <div className="h-[200px]">
                {analytics && analytics.byAgent && analytics.byAgent.length > 0 ? (
                  <Bar
                    data={{
                      labels: analytics.byAgent.map((a) => a.agent),
                      datasets: [
                        { label: 'Calls', data: analytics.byAgent.map((a) => a.calls), backgroundColor: '#FF3D9A', borderRadius: 4 },
                        { label: 'Qualified', data: analytics.byAgent.map((a) => a.qualified), backgroundColor: '#22D3EE', borderRadius: 4 },
                      ],
                    }}
                    options={{
                      maintainAspectRatio: false,
                      plugins: { legend: { display: true, labels: { color: t.tick, boxWidth: 10, font: { size: 11 } } } },
                      scales: { x: { grid: { display: false }, ticks: TICKS }, y: { grid: GRID, ticks: { ...TICKS, precision: 0 } } },
                    }}
                  />
                ) : (
                  <EmptyChart text="Per-agent stats appear after the first calls." />
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="mb-4 text-sm font-semibold">Calls by language</h3>
              <div className="h-[200px]">
                {analytics && analytics.languages.length > 0 ? (
                  <Bar
                    data={{
                      labels: analytics.languages.map((l) => LANGUAGE_NAMES[l.language] ?? l.language),
                      datasets: [{ data: analytics.languages.map((l) => l.count), backgroundColor: '#A855F7', borderRadius: 4 }],
                    }}
                    options={{
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: { x: { grid: { display: false }, ticks: TICKS }, y: { grid: GRID, ticks: { ...TICKS, precision: 0 } } },
                    }}
                  />
                ) : (
                  <EmptyChart text="Language mix appears after the first calls." />
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="mb-4 text-sm font-semibold">Average call duration — last 14 days</h3>
              <div className="h-[200px]">
                {analytics && analytics.durationTrend.length > 0 ? (
                  <Line
                    data={{
                      labels: analytics.durationTrend.map((d) => d.day),
                      datasets: [
                        {
                          data: analytics.durationTrend.map((d) => Math.round(d.avgSeconds)),
                          borderColor: '#22D3EE',
                          backgroundColor: 'rgba(34,211,238,0.08)',
                          fill: true,
                          tension: 0.35,
                        },
                      ],
                    }}
                    options={{
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: { x: { grid: { display: false }, ticks: TICKS }, y: { grid: GRID, ticks: { ...TICKS, callback: (v) => `${v}s` } } },
                    }}
                  />
                ) : (
                  <EmptyChart text="Duration trend appears after the first calls." />
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="mb-4 text-sm font-semibold">Qualification funnel</h3>
              {analytics ? (
                <div className="flex flex-col gap-3 py-2">
                  <FunnelBar label="Answered" value={analytics.funnel.answered} max={analytics.funnel.answered} color="#6B647F" />
                  <FunnelBar label="Engaged (4+ turns)" value={analytics.funnel.engaged} max={analytics.funnel.answered} color="#A855F7" />
                  <FunnelBar label="Qualified" value={analytics.funnel.qualified} max={analytics.funnel.answered} color="#22D3EE" />
                  <FunnelBar label="Site visit booked" value={analytics.funnel.visitBooked} max={analytics.funnel.answered} color="#FBBF24" />
                </div>
              ) : (
                <EmptyChart text="Funnel appears after the first calls." />
              )}
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="mb-4 text-sm font-semibold">Caller sentiment</h3>
              {analytics && (analytics.sentiment.positive + analytics.sentiment.neutral + analytics.sentiment.negative) > 0 ? (
                <div className="flex items-center gap-6 py-2">
                  <div className="h-[140px] w-[140px]">
                    <Doughnut
                      data={{
                        labels: ['Positive', 'Neutral', 'Negative'],
                        datasets: [
                          {
                            data: [analytics.sentiment.positive, analytics.sentiment.neutral, analytics.sentiment.negative],
                            backgroundColor: ['#22D3EE', t.muted, '#F43F5E'],
                            borderColor: t.surface,
                            borderWidth: 3,
                          },
                        ],
                      }}
                      options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '70%' }}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 text-[11px] text-text-muted">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan" />Positive · {analytics.sentiment.positive}</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-muted" />Neutral · {analytics.sentiment.neutral}</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#F43F5E' }} />Negative · {analytics.sentiment.negative}</span>
                  </div>
                </div>
              ) : (
                <EmptyChart text="Sentiment split appears after the first calls." />
              )}
            </div>

            <div className="rounded-xl border border-border bg-surface p-5 lg:col-span-2">
              <h3 className="mb-4 text-sm font-semibold">Peak call hours</h3>
              <div className="h-[180px]">
                {analytics && analytics.peakHours.length > 0 ? (
                  <Bar
                    data={{
                      labels: analytics.peakHours.map((h) => `${h.hour}:00`),
                      datasets: [{ data: analytics.peakHours.map((h) => h.count), backgroundColor: '#22D3EE', borderRadius: 4 }],
                    }}
                    options={{
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: { x: { grid: { display: false }, ticks: TICKS }, y: { grid: GRID, ticks: { ...TICKS, precision: 0 } } },
                    }}
                  />
                ) : (
                  <EmptyChart text="Hourly distribution appears after the first calls." />
                )}
              </div>
              <p className="mt-2 text-[11px] text-text-muted">Times shown in UTC (call timestamps are stored in UTC).</p>
            </div>

            {summary && (
              <p className="text-xs text-text-muted lg:col-span-2">
                Based on {summary.totalCalls} logged calls · avg duration {formatDuration(summary.avgDurationSeconds)}
              </p>
            )}
          </div>
        )}
      </section>
    </DashboardLayout>
  )
}

function FunnelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 4
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-text-muted">
        <span>{label}</span>
        <span className="font-semibold text-text">{value}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-high">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[100px] items-center justify-center px-4 text-center text-xs text-text-muted">
      {text}
    </div>
  )
}

function IntelStat({ label, value, tone = 'text-text' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-high/40 p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">{label}</p>
      <p className={`mt-1 text-lg font-bold ${tone}`}>{value}</p>
    </div>
  )
}

const TONE_STYLES: Record<string, { chip: string; hint: string; border: string }> = {
  primary: { chip: 'bg-primary/15 text-primary', hint: 'text-primary', border: 'hover:border-primary/50' },
  cyan: { chip: 'bg-cyan/15 text-cyan', hint: 'text-cyan', border: 'hover:border-cyan/50' },
  magenta: { chip: 'bg-magenta/15 text-magenta', hint: 'text-magenta', border: 'hover:border-magenta/50' },
  amber: { chip: 'bg-amber/15 text-amber', hint: 'text-amber', border: 'hover:border-amber/50' },
  success: { chip: 'bg-success/15 text-success', hint: 'text-success', border: 'hover:border-success/50' },
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  pulse,
  tone = 'cyan',
}: {
  label: string
  value: string
  hint: string
  icon?: string
  pulse?: boolean
  tone?: keyof typeof TONE_STYLES
}) {
  const t = TONE_STYLES[tone]
  return (
    <div className={`group rounded-xl border border-border bg-surface p-5 transition-all duration-200 ${t.border} hover:-translate-y-0.5`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${t.chip}`}>
          {pulse ? (
            <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-current" />
          ) : (
            icon && <Icon name={icon} className="text-[18px]" />
          )}
        </div>
      </div>
      <p className={`mt-2 text-xs ${t.hint}`}>{hint}</p>
    </div>
  )
}
