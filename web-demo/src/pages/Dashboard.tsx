import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import '../lib/chart-setup'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { WatchHowButton } from '../components/HelpVideo'
import { helpVideoFor } from '../lib/helpVideos'
import { EmptyState } from '../components/ui/EmptyState'
import { SectionCard } from '../components/ui/SectionCard'
import { StatTile } from '../components/ui/StatTile'
import {
  LANGUAGE_NAMES,
  fetchActiveCalls,
  fetchAnalytics,
  fetchAppointments,
  fetchBilling,
  fetchCalls,
  fetchContacts,
  fetchDashboardSummary,
  fetchEntitlements,
  fetchFeedbackSummary,
  fetchIntelligence,
  fetchInsights,
  fetchIntegrations,
  fetchNotifications,
  fetchLaunchReadiness,
  fetchMissedMoney,
  fetchSpeedToLead,
  fetchPeriodComparison,
  fetchUsageTrends,
  formatDateTime,
  formatDuration,
  type IntelligenceSummary,
} from '../lib/api'
import { apiProfilePreferences, apiUpdateProfilePreferences, useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'
import type { ActiveCallInfo, Analytics, GrowthInsights, AppNotification, Appointment, BillingSummary, CallRecord, Contact, DashboardPeriodComparison, DashboardSummary, FeedbackSummary, Integration, LaunchReadiness, MissedMoneyKind, MissedMoneyQueue, SpeedToLead, UsageTrends } from '../lib/types'
import { Tooltip } from '../components/ui/Tooltip'

const AGENT_STATE_STYLES: Record<string, string> = {
  listening: 'bg-cyan/20 text-cyan border-cyan/30',
  thinking: 'bg-primary/20 text-primary border-primary/30',
  speaking: 'bg-magenta/20 text-magenta border-magenta/30',
}

const CALL_STATUS_STYLES: Record<string, string> = {
  completed: 'bg-cyan/20 text-cyan border-cyan/30',
  failed: 'bg-destructive/20 text-destructive border-destructive/30',
}

const CHECKLIST_KEY = 'vv-launch-checklist-dismissed'

function checklistDismissedLocally(): boolean {
  try { return window.localStorage.getItem(CHECKLIST_KEY) === '1' } catch { return false }
}

const ANALYTICS_FEATURES = [
  'Calls and qualified leads by agent and channel',
  'Language mix and peak call hours',
  'Caller sentiment and agent QA scores',
  'Top reasons leads do not qualify',
]

// Rounded, slim bars for the Analytics tiles.
const BAR_STYLE = { borderRadius: 8, borderSkipped: false, maxBarThickness: 28 } as const

// Missed-money queue rows shown before "Show N".
const QUEUE_PREVIEW = 5

const QUEUE_KIND: Record<MissedMoneyKind, { icon: string; tone: string }> = {
  uncalled_lead: { icon: 'person_add', tone: 'bg-primary/12 text-primary' },
  overdue_follow_up: { icon: 'schedule', tone: 'bg-amber/12 text-amber' },
  dropped_call: { icon: 'call_missed', tone: 'bg-destructive/10 text-destructive' },
  upcoming_follow_up: { icon: 'event', tone: 'bg-cyan/12 text-cyan' },
}

// Server timestamps are UTC, some without a zone ("2026-10-19 05:27:24").
function parseUtc(at: string | null): Date | null {
  if (!at) return null
  const iso = /[zZ]$|[+-]\d\d:?\d\d$/.test(at) ? at : `${at.replace(' ', 'T')}Z`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

function whenLabel(kind: MissedMoneyKind, at: string | null): string {
  const date = parseUtc(at)
  if (!date) return ''
  if (kind === 'upcoming_follow_up') {
    const sameDay = date.toDateString() === new Date().toDateString()
    return date.toLocaleString('en-IN', { weekday: sameDay ? undefined : 'short', hour: 'numeric', minute: '2-digit' })
  }
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000)
  const ago = seconds < 3600 ? `${Math.max(1, Math.round(seconds / 60))} min ago` : seconds < 86400 ? `${Math.round(seconds / 3600)} h ago` : `${Math.round(seconds / 86400)} d ago`
  return kind === 'overdue_follow_up' ? `due ${ago}` : ago
}

// 9_18_00_000 -> "₹9.2 Cr", 4_50_000 -> "₹4.5 L", 18_000 -> "₹18,000".
function formatInrShort(inr: number): string {
  if (inr >= 1e7) return `₹${(inr / 1e7).toFixed(inr >= 1e8 ? 0 : 1).replace(/\.0$/, '')} Cr`
  if (inr >= 1e5) return `₹${(inr / 1e5).toFixed(1).replace(/\.0$/, '')} L`
  return `₹${Math.round(inr).toLocaleString('en-IN')}`
}

// 5 -> "5 s", 240 -> "4 min", 5400 -> "1.5 h".
function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1).replace(/\.0$/, '')} h`
  return `${(seconds / 86400).toFixed(1).replace(/\.0$/, '')} d`
}

// Attention items shown before "Show all", so the tile stays the height of its neighbours.
const ATTENTION_PREVIEW = 4

const RANGE_OPTIONS = [
  { label: 'Week', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
]

const DASHBOARD_CARDS = [
  { key: 'speed_to_lead', label: 'Speed to lead' },
  { key: 'missed_money', label: 'People to call' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'quick_actions', label: 'Quick actions' },
  { key: 'funnel', label: 'Conversion funnel' },
  { key: 'followups', label: 'Follow-up queue' },
  { key: 'appointments', label: 'Upcoming appointments' },
  { key: 'channels', label: 'Channel performance' },
  { key: 'feedback', label: 'Customer feedback' },
] as const

// Chart grid/tick/segment-border colors come from the live CSS tokens so
// they follow the light/dark switch - read at render, recomputed whenever
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

// "2026-10-13" -> "13 Oct" for chart axes; anything else is shown as given.
function shortDay(label: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(label) ? new Date(`${label}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : label
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
  const [recentCalls, setRecentCalls] = useState<CallRecord[]>([])
  const [rangeDays, setRangeDays] = useState(14)
  const [recentCallsCollapsed, setRecentCallsCollapsed] = useState(false)
  const [checklistDismissed, setChecklistDismissed] = useState<boolean | null>(null)
  const [dismissingChecklist, setDismissingChecklist] = useState(false)
  const [readiness, setReadiness] = useState<LaunchReadiness | null>(null)
  const [feedback, setFeedback] = useState<FeedbackSummary | null>(null)
  const [comparison, setComparison] = useState<DashboardPeriodComparison | null>(null)
  const [billing, setBilling] = useState<BillingSummary | null>(null)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  // Same derived feed the header's notification bell reads (GET
  // /notifications) - this panel used to compute its own failed-call/
  // integration-error/low-credit/feedback counts client-side, which could
  // show a different total than the bell on the same screen. One source now.
  const [attentionItems, setAttentionItems] = useState<AppNotification[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [hiddenCards, setHiddenCards] = useState<Set<string>>(new Set())
  const [customizing, setCustomizing] = useState(false)
  const [openKpi, setOpenKpi] = useState<string | null>(null)
  const [showAllAttention, setShowAllAttention] = useState(false)
  // The Analytics tab is Growth and Scale (plan_policy 'analytics'); null while loading.
  const [analyticsAllowed, setAnalyticsAllowed] = useState<boolean | null>(null)
  const [speed, setSpeed] = useState<SpeedToLead | null>(null)
  const [queue, setQueue] = useState<MissedMoneyQueue | null>(null)
  const [showAllQueue, setShowAllQueue] = useState(false)
  const [insights, setInsights] = useState<GrowthInsights | null>(null)

  const { user } = useAuth()
  // Re-render (and recompute chart colors) when the header toggles the theme.
  const theme = useTheme()
  const t = chartTokens()
  void theme
  const GRID = { color: t.grid }
  const TICKS = { color: t.tick, font: { size: 11 } }
  const LEGEND = { display: true, align: 'end' as const, labels: { color: t.tick, boxWidth: 8, boxHeight: 8, usePointStyle: true, font: { size: 11 } } }

  useEffect(() => {
    fetchDashboardSummary().then(setSummary).catch(() => setSummary(null))
    fetchAnalytics().then(setAnalytics).catch(() => setAnalytics(null))
    fetchEntitlements().then((e) => setAnalyticsAllowed(Boolean(e.features.analytics))).catch(() => setAnalyticsAllowed(true))
    fetchCalls().then((calls) => setRecentCalls(calls.slice(0, 5))).catch(() => setRecentCalls([]))
    fetchLaunchReadiness().then(setReadiness).catch(() => setReadiness(null))
    fetchFeedbackSummary().then(setFeedback).catch(() => setFeedback(null))
    fetchBilling().then(setBilling).catch(() => setBilling(null))
    fetchIntegrations().then(setIntegrations).catch(() => setIntegrations([]))
    fetchNotifications().then(setAttentionItems).catch(() => setAttentionItems([]))
    fetchMissedMoney().then(setQueue).catch(() => setQueue(null))
    fetchContacts().then(setContacts).catch(() => setContacts([]))
    fetchAppointments().then(setAppointments).catch(() => setAppointments([]))
    apiProfilePreferences()
      .then((preferences) => {
        const dismissedHere = checklistDismissedLocally()
        setChecklistDismissed(Boolean(preferences.dashboard_checklist_dismissed) || dismissedHere)
        // Dismissed on this device while the save failed: save it now.
        if (dismissedHere && !preferences.dashboard_checklist_dismissed) {
          apiUpdateProfilePreferences({ dashboard_checklist_dismissed: true }).catch(() => undefined)
        }
        try {
          const parsed = JSON.parse(preferences.dashboard_hidden_cards || '[]')
          setHiddenCards(new Set(Array.isArray(parsed) ? parsed : []))
        } catch { setHiddenCards(new Set()) }
      })
      .catch(() => setChecklistDismissed(checklistDismissedLocally()))
  }, [])

  useEffect(() => {
    if (analyticsAllowed) fetchIntelligence(30).then(setIntel).catch(() => setIntel(null))
    if (analyticsAllowed) fetchInsights(30).then(setInsights).catch(() => setInsights(null))
  }, [analyticsAllowed])

  useEffect(() => {
    fetchUsageTrends(rangeDays).then(setTrends).catch(() => setTrends(null))
    fetchSpeedToLead(rangeDays).then(setSpeed).catch(() => setSpeed(null))
    fetchPeriodComparison(rangeDays).then(setComparison).catch(() => setComparison(null))
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
  const showingLive = activeCalls.length > 0
  const callsCollapsed = !showingLive && recentCallsCollapsed
  const isVisible = (key: string) => !hiddenCards.has(key)
  const connectedIntegrations = integrations.filter((integration) => integration.status === 'connected')
  // billing.creditsRemaining is still used directly below (the credits pill
  // in the header, etc.) - only the "is this low enough to flag" judgment
  // moves server-side, to the same threshold /notifications applies.
  const lowCredits = attentionItems.some((item) => item.id.startsWith('credits:'))
  const followUps = contacts
    .filter((contact) => ['new', 'qualified'].includes(contact.status.toLowerCase()))
    .sort((a, b) => String(b.lastCalledAt || b.createdAt).localeCompare(String(a.lastCalledAt || a.createdAt)))
    .slice(0, 5)
  const upcomingAppointments = appointments
    .filter((appointment) => appointment.status === 'confirmed' && appointment.date >= new Date().toISOString().slice(0, 10))
  const attentionCount = attentionItems.length
  const totalCalls = summary?.totalCalls ?? 0
  const dashboardVideo = helpVideoFor('/dashboard')
  const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })
  const minutesLeft = billing?.creditsRemaining ?? 0
  const minutesLeftLabel = billing ? (Number.isInteger(minutesLeft) ? minutesLeft.toLocaleString('en-IN') : minutesLeft.toFixed(1)) : '—'
  // Share of this cycle's allowance still left, for the ring.
  const ringShare = billing && billing.creditsTotal > 0 ? Math.min(1, Math.max(0, minutesLeft / billing.creditsTotal)) : 0
  const kpiTiles = [
    { key: 'calls', label: 'Calls', icon: 'call', tone: 'bg-primary/12 text-primary', value: comparison?.current.calls ?? 0, previous: comparison?.previous.calls ?? 0, change: comparison?.change.calls ?? null },
    { key: 'qualified', label: 'Qualified leads', icon: 'verified', tone: 'bg-magenta/12 text-magenta', value: comparison?.current.qualified ?? 0, previous: comparison?.previous.qualified ?? 0, change: comparison?.change.qualified ?? null },
    { key: 'booked', label: 'Appointments', icon: 'event_available', tone: 'bg-cyan/12 text-cyan', value: comparison?.current.booked ?? 0, previous: comparison?.previous.booked ?? 0, change: comparison?.change.booked ?? null },
    { key: 'minutes', label: 'Minutes', icon: 'timer', tone: 'bg-amber/12 text-amber', value: comparison?.current.minutes ?? 0, previous: comparison?.previous.minutes ?? 0, change: comparison?.change.minutes ?? null },
  ]
  // Each stage's rate is against the stage before it.
  const funnelStages = analytics
    ? [
        { label: 'Answered', value: analytics.funnel.answered },
        { label: 'Engaged', value: analytics.funnel.engaged },
        { label: 'Qualified', value: analytics.funnel.qualified },
        { label: 'Booked', value: analytics.funnel.visitBooked },
      ].map((stage, index, all) => ({ ...stage, stepRate: index > 0 && all[index - 1].value ? Math.round((stage.value * 100) / all[index - 1].value) : 0 }))
    : []

  const toggleCard = async (key: string) => {
    const next = new Set(hiddenCards)
    if (next.has(key)) next.delete(key); else next.add(key)
    setHiddenCards(next)
    try { await apiUpdateProfilePreferences({ dashboard_hidden_cards: JSON.stringify([...next]) }) } catch { /* keep the responsive local state */ }
  }

  const dismissChecklist = async () => {
    if (dismissingChecklist) return
    setDismissingChecklist(true)
    setChecklistDismissed(true)
    // Remembered on this device too: if the save fails (a network blip, or the
    // API restarting during a deploy) the checklist stays closed and the save
    // is retried on the next visit, instead of the checklist coming back.
    try { window.localStorage.setItem(CHECKLIST_KEY, '1') } catch { /* storage blocked */ }
    try {
      await apiUpdateProfilePreferences({ dashboard_checklist_dismissed: true })
    } catch {
      /* stays hidden; retried on the next visit */
    } finally {
      setDismissingChecklist(false)
    }
  }

  return (
    <DashboardLayout>
      <PageHeader title="Dashboard" subtitle="Overview of your voice AI platform" ownWatchHow />

      <section className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
        <div className="flex items-center gap-6 border-b border-border">
          {(['overview', 'analytics'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative pb-3 text-sm font-medium capitalize ${
                tab === t ? 'text-text' : 'text-text-muted hover:text-text'
              }`}
            >
              <span className="flex items-center gap-1.5">{t}{t === 'analytics' && analyticsAllowed === false && <Icon name="lock" className="text-[15px]" />}</span>
              {tab === t && <span className="absolute -bottom-px left-0 h-0.5 w-full bg-primary" />}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <>
            {/* One row on every screen: the period switch takes the room it
                has, Watch how and Customize sit at the end (icons only on
                phones, labels for screen readers). */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div role="group" aria-label="Performance period" className="flex min-w-0 flex-1 gap-1 rounded-full bg-surface p-1 ring-1 ring-border sm:flex-none">
                {RANGE_OPTIONS.map((range) => (
                  <button
                    key={range.days}
                    type="button"
                    onClick={() => setRangeDays(range.days)}
                    aria-pressed={rangeDays === range.days}
                    className={`flex-1 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-bold sm:flex-none sm:px-3.5 ${rangeDays === range.days ? 'bg-primary text-white' : 'text-text-muted hover:text-text'}`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
              <span className="hidden text-xs text-text-muted md:inline">Compared with the {rangeDays} days before</span>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                {dashboardVideo && <WatchHowButton slug={dashboardVideo} compact />}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setCustomizing((value) => !value)}
                    aria-expanded={customizing}
                    aria-label="Customize dashboard"
                    className="flex h-9 items-center justify-center gap-2 rounded-full bg-surface px-2.5 text-xs font-bold text-text-muted ring-1 ring-border hover:text-text sm:h-auto sm:px-3.5 sm:py-2"
                  >
                    <Icon name="tune" className="text-[17px]" /><span className="sr-only sm:not-sr-only">Customize</span>
                  </button>
                  {customizing && (
                    <div className="absolute right-0 z-20 mt-2 w-[min(16rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-3 shadow-xl">
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">Visible sections</p>
                      {DASHBOARD_CARDS.map((card) => (
                        <label key={card.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-surface-high/40">
                          <span>{card.label}</span>
                          <input type="checkbox" checked={isVisible(card.key)} onChange={() => toggleCard(card.key)} className="accent-primary" />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {readiness && checklistDismissed === false && readiness.completed < readiness.total && (
              <SectionCard
                title="Launch checklist"
                action={(
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-primary">{readiness.completed}/{readiness.total} complete</span>
                    <Tooltip content="Don't show again"><button
                      type="button"
                      onClick={dismissChecklist}
                      disabled={dismissingChecklist}
                      aria-label="Dismiss launch checklist and do not show it again"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-high/50 hover:text-text disabled:opacity-50"
                    >
                      <Icon name="close" className="text-[18px]" />
                    </button></Tooltip>
                  </div>
                )}
              >
                <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {readiness.checks.map((check) => (
                    <Link
                      key={check.key}
                      to={check.to}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${check.complete ? 'border-success/30 bg-success/5 text-text-muted' : 'border-border bg-transparent hover:border-primary'}`}
                    >
                      <Icon name={check.complete ? 'check_circle' : 'radio_button_unchecked'} className={`text-[18px] ${check.complete ? 'text-success' : 'text-primary'}`} />
                      <span className={check.complete ? 'line-through' : ''}>{check.label}</span>
                    </Link>
                  ))}
                </div>
              </SectionCard>
            )}

            <div className="bento-grid">
              <section className="bento-tile bento-hero bento-w2 bento-h2 flex min-h-[300px] flex-col justify-between gap-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">{todayLabel}</span>
                    {showingLive && (
                      <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
                        <span className="pulse-dot h-2 w-2 rounded-full bg-white" />{activeCalls.length} live now
                      </span>
                    )}
                  </div>
                  <h2 className="bento-title mt-4 break-words text-[28px] leading-tight sm:text-4xl">{greeting()}, {user?.accountName ?? 'there'}</h2>
                  <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/80">
                    Your agents have handled {totalCalls.toLocaleString('en-IN')} calls so far, and {successPct}% of them qualified as leads.
                  </p>
                </div>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="bento-num text-6xl leading-none sm:text-7xl">{totalCalls.toLocaleString('en-IN')}</p>
                    <p className="mt-2 text-sm font-bold text-white/75">calls handled</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link to="/dashboard/agents" className="bento-pill bento-pill-light">Test an agent →</Link>
                    <Link to="/dashboard/outbound" className="bento-pill bento-pill-glass">Start campaign</Link>
                  </div>
                </div>
              </section>

              <section className="bento-tile bento-h2 flex flex-col items-center justify-between gap-4 text-center">
                <div className="self-stretch text-left">
                  <h3 className="bento-title text-[15px]">Minutes</h3>
                  <p className="mt-0.5 text-xs text-text-muted">{lowCredits ? 'Running low' : 'Your balance'}</p>
                </div>
                <svg width="168" height="168" viewBox="0 0 120 120" role="img" aria-label={`${minutesLeftLabel} minutes left`}>
                  <circle cx="60" cy="60" r="48" fill="none" stroke="var(--color-surface-high)" strokeWidth="12" />
                  <circle
                    cx="60" cy="60" r="48" fill="none"
                    stroke={lowCredits ? 'var(--color-destructive)' : 'url(#bentoRing)'}
                    strokeWidth="12" strokeLinecap="round"
                    strokeDasharray={`${(ringShare * 301.6).toFixed(1)} 301.6`}
                    transform="rotate(-90 60 60)"
                    className="bento-ring"
                  />
                  <defs>
                    <linearGradient id="bentoRing" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="var(--color-primary)" />
                      <stop offset="1" stopColor="#c026d3" />
                    </linearGradient>
                  </defs>
                  <text x="60" y="58" textAnchor="middle" className="bento-ring-value">{minutesLeftLabel}</text>
                  <text x="60" y="76" textAnchor="middle" className="bento-ring-label">min left</text>
                </svg>
                <p className="text-[13px] text-text-muted">
                  {comparison ? `${comparison.current.minutes.toLocaleString('en-IN')} min used in the last ${rangeDays} days` : 'Usage loads with your calls'}
                </p>
                <Link to="/dashboard/settings?tab=billing&topup=1" className="bento-pill bento-pill-dark self-stretch justify-center">Top up minutes</Link>
              </section>

              {kpiTiles.map((kpi) => (
                <button
                  key={kpi.key}
                  type="button"
                  onClick={() => setOpenKpi((current) => (current === kpi.key ? null : kpi.key))}
                  aria-expanded={openKpi === kpi.key}
                  className="bento-tile bento-kpi flex flex-col justify-between gap-2 text-left"
                >
                  <span className="flex items-center justify-between">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${kpi.tone}`}><Icon name={kpi.icon} className="text-[19px]" /></span>
                    {kpi.change != null && (
                      <span className={`rounded-full px-2 py-1 text-[11px] font-extrabold ${kpi.change >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                        {kpi.change >= 0 ? '↑' : '↓'} {Math.abs(kpi.change)}%
                      </span>
                    )}
                  </span>
                  <span className="flex flex-col gap-2">
                    <span className="bento-num mt-2 text-[34px] leading-none">{kpi.value.toLocaleString('en-IN')}</span>
                    <span className="text-[13px] font-bold text-text-muted">{kpi.label}</span>
                  </span>
                  {openKpi === kpi.key && (
                    <span className="bento-reveal mt-1 border-t border-dashed border-border pt-2 text-xs text-text-muted">
                      Previous {rangeDays} days: <b className="text-text">{kpi.previous.toLocaleString('en-IN')}</b>
                    </span>
                  )}
                </button>
              ))}

              {isVisible('speed_to_lead') && (
                <section className="bento-tile bento-w2 flex flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="bento-title text-[15px]">Speed to lead</h3>
                      <p className="mt-0.5 text-xs text-text-muted">How fast new leads get their first call · last {rangeDays} days</p>
                    </div>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan/12 text-cyan"><Icon name="bolt" className="text-[19px]" /></span>
                  </div>
                  {!speed || speed.received === 0 ? (
                    <p className="mt-4 text-sm leading-relaxed text-text-muted">No new leads in this period. Leads from your connected sources (CRM, ad forms, website forms or the lead API) are timed from the moment they reach us to the first call.</p>
                  ) : (
                    <div className="mt-4 flex flex-1 flex-col justify-between gap-4">
                      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                        <div>
                          <p className="bento-num text-5xl leading-none">{speed.medianSeconds == null ? '—' : formatSeconds(speed.medianSeconds)}</p>
                          <p className="mt-2 text-xs font-bold text-text-muted">median time to first call</p>
                        </div>
                        {speed.withinMinutePct != null && (
                          <div className="pb-0.5">
                            <p className="bento-num text-2xl leading-none">{speed.withinMinutePct}%</p>
                            <p className="mt-1.5 text-xs text-text-muted">called within a minute</p>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-surface-high/70 px-2.5 py-1 font-semibold">{speed.called} of {speed.received} leads called</span>
                        {speed.notCalled > 0 && <span className="rounded-full bg-amber/12 px-2.5 py-1 font-bold text-amber">{speed.notCalled} never called</span>}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {isVisible('missed_money') && (
                <section className="bento-tile bento-w2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="bento-title text-[15px]">People to call</h3>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {queue ? (queue.toCall ? `${queue.toCall} waiting: new leads, missed callbacks and dropped calls` : 'Nobody is waiting on a call') : 'New leads, missed callbacks and dropped calls'}
                      </p>
                    </div>
                    {queue && queue.toCall > 0 && <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-bold text-destructive">{queue.toCall}</span>}
                  </div>
                  {queue && queue.items.length > 0 ? (
                    <div className="mt-3 flex flex-col">
                      {(showAllQueue ? queue.items : queue.items.slice(0, QUEUE_PREVIEW)).map((item, index) => {
                        const meta = QUEUE_KIND[item.kind]
                        // No contact yet (a lead from a source that does not create one):
                        // open Add contact with the name and number filled in, passed as
                        // route state so the number stays out of the address bar.
                        const to = item.contactId ? `/dashboard/contacts/${item.contactId}` : item.callId ? `/dashboard/calls/${item.callId}` : '/dashboard/contacts?add=1'
                        const state = item.contactId || item.callId ? undefined : { prefill: { name: item.name, phone: item.phone } }
                        return (
                          <Link key={`${item.kind}-${item.contactId ?? item.callId ?? item.phone ?? index}-${item.at ?? index}`} to={to} state={state} aria-label={`${item.title}: ${item.detail}`} className="bento-row flex items-center gap-3 rounded-xl px-2 py-2.5">
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.tone}`}><Icon name={meta.icon} className="text-[19px]" /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">{item.title}</span>
                              <span className="block truncate text-xs text-text-muted">{item.detail}</span>
                            </span>
                            <span className="hidden shrink-0 text-right text-[11px] text-text-muted sm:block">{whenLabel(item.kind, item.at)}</span>
                            <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">{item.kind === 'upcoming_follow_up' ? 'View' : 'Call'}</span>
                          </Link>
                        )
                      })}
                      {queue.items.length > QUEUE_PREVIEW && (
                        <button type="button" onClick={() => setShowAllQueue((v) => !v)} aria-expanded={showAllQueue} className="mt-1 self-start rounded-lg px-2 py-1.5 text-xs font-bold text-primary hover:bg-primary/10">
                          {showAllQueue ? 'Show fewer' : `Show ${queue.items.length}${queue.toCall > queue.items.length ? ' most urgent' : ''}`}
                        </button>
                      )}
                    </div>
                  ) : queue ? (
                    <div className="mt-4 flex items-center gap-3 text-sm text-text-muted"><Icon name="verified" className="text-success" /> New leads that were not called, missed callbacks and dropped calls show up here.</div>
                  ) : null}
                </section>
              )}

              <section className="bento-tile bento-w2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="bento-title text-[15px]">{showingLive ? 'Live calls' : 'Recent calls'}</h3>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {showingLive
                        ? <span className="flex items-center gap-1.5"><span className="pulse-dot h-2 w-2 rounded-full bg-cyan" />{activeCalls.length} in progress</span>
                        : recentCalls.length === 0
                          ? 'Every call your agent takes lands here'
                          : `Latest: ${recentCalls[0].name || 'Unknown caller'} · ${formatDateTime(recentCalls[0].callDate)}`}
                    </p>
                  </div>
                  {!showingLive && (
                    <div className="flex items-center gap-2">
                      <Link to="/dashboard/calls" className="text-xs font-bold text-cyan hover:underline">View all →</Link>
                      {recentCalls.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setRecentCallsCollapsed((c) => !c)}
                          aria-label={recentCallsCollapsed ? 'Expand recent calls' : 'Collapse recent calls'}
                          aria-expanded={!recentCallsCollapsed}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-high/40 hover:text-text"
                        >
                          <Icon name="expand_more" className={`text-[18px] transition-transform ${recentCallsCollapsed ? '-rotate-90' : ''}`} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {showingLive ? (
                  <div className="mt-3 flex flex-col">
                    {activeCalls.map((call) => (
                      <div key={call.room} className="flex items-center gap-3 rounded-xl px-2 py-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{call.visitor_identity.slice(0, 2).toUpperCase()}</div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{call.visitor_identity}</p>
                          <p className="truncate text-[11px] text-text-muted">{call.room}</p>
                        </div>
                        <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${AGENT_STATE_STYLES[call.state] ?? 'border-border text-text-muted'}`}>{call.state}</span>
                      </div>
                    ))}
                  </div>
                ) : !callsCollapsed && recentCalls.length > 0 && (
                  <div className="bento-reveal mt-3 flex flex-col">
                    {recentCalls.map((call) => (
                      <Link
                        key={call.id}
                        to={`/dashboard/calls/${call.id}`}
                        aria-label={`Open call from ${call.name || call.phone || 'unknown caller'}, ${call.callStatus}`}
                        className="bento-row flex items-center gap-3 rounded-xl px-2 py-2.5"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{call.initials}</div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{call.name}</p>
                          <p className="truncate text-[11px] text-text-muted">{call.channel} · {formatDateTime(call.callDate)}</p>
                        </div>
                        <span className="hidden shrink-0 text-xs tabular-nums text-text-muted sm:block">{formatDuration(call.durationSeconds)}</span>
                        <span className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${CALL_STATUS_STYLES[call.callStatus] ?? 'border-border text-text-muted'}`}>{call.callStatus}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              {isVisible('attention') && (
                <section className="bento-tile bento-w2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="bento-title text-[15px]">Needs attention</h3>
                      <p className="mt-0.5 text-xs text-text-muted">{attentionCount ? `${attentionCount} item${attentionCount === 1 ? '' : 's'} may affect customer conversations` : 'Everything important is in good shape'}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${attentionCount ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>{attentionCount || 'All clear'}</span>
                  </div>
                  {attentionCount === 0 ? (
                    <div className="mt-4 flex items-center gap-3 text-sm text-text-muted"><Icon name="verified" className="text-success" /> No failed calls, integration errors, low-minute warnings, or negative feedback.</div>
                  ) : (
                    <div className="mt-3 flex flex-col">
                      {(showAllAttention ? attentionItems : attentionItems.slice(0, ATTENTION_PREVIEW)).map((item) => (
                        <AttentionLink
                          key={item.id}
                          to={item.to}
                          icon={ATTENTION_ICON[item.id.split(':')[0]] ?? 'info'}
                          label={item.title}
                          detail={item.body}
                          tone={item.severity === 'critical' ? 'destructive' : item.severity === 'warning' ? 'amber' : 'success'}
                        />
                      ))}
                      {attentionCount > ATTENTION_PREVIEW && (
                        <button type="button" onClick={() => setShowAllAttention((v) => !v)} aria-expanded={showAllAttention} className="mt-1 self-start rounded-lg px-2 py-1.5 text-xs font-bold text-primary hover:bg-primary/10">
                          {showAllAttention ? 'Show fewer' : `Show all ${attentionCount}`}
                        </button>
                      )}
                    </div>
                  )}
                </section>
              )}

              {isVisible('funnel') && analytics && (
                <section className="bento-tile bento-w2">
                  <h3 className="bento-title text-[15px]">From call to appointment</h3>
                  <p className="mt-0.5 text-xs text-text-muted">Where conversations turn into business outcomes</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {funnelStages.map((stage, index) => (
                      <div key={stage.label} className={`flex flex-col justify-between gap-3 rounded-2xl p-3.5 ${index === funnelStages.length - 1 ? 'bento-funnel-last' : 'bg-surface-high/60'}`}>
                        <span className="h-5 text-[11px] font-extrabold">{index > 0 ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">{stage.stepRate}%</span> : null}</span>
                        <span>
                          <span className="bento-num block text-2xl leading-none">{stage.value.toLocaleString('en-IN')}</span>
                          <span className="mt-1.5 block text-xs font-bold opacity-75">{stage.label}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-text-muted">Each percentage is the share of the stage before it.</p>
                </section>
              )}

              <section className="bento-tile bento-w2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="bento-title text-[15px]">Usage trends</h3>
                  <span className="flex items-center gap-3 text-[11px] font-semibold text-text-muted">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />Calls</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan" />Qualified</span>
                  </span>
                </div>
                <div className="mt-4 h-[200px]">
                  {trends && trends.labels.length > 0 ? (
                    <Line
                      data={{
                        labels: trends.labels.map(shortDay),
                        datasets: [
                          { label: 'Calls', data: trends.calls, borderColor: '#A855F7', backgroundColor: 'rgba(168,85,247,0.10)', fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2.5 },
                          { label: 'Qualified', data: trends.qualified, borderColor: '#22D3EE', backgroundColor: 'rgba(34,211,238,0.08)', fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2.5 },
                        ],
                      }}
                      options={{
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        plugins: { legend: { display: false } },
                        scales: { x: { grid: { display: false }, ticks: { ...TICKS, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } }, y: { grid: GRID, ticks: { ...TICKS, precision: 0 } } },
                      }}
                    />
                  ) : (
                    <EmptyState icon="show_chart" text="No calls yet in this range - every call the agent takes lands here automatically." />
                  )}
                </div>
              </section>

              <section className="bento-tile bento-w2">
                <h3 className="bento-title text-[15px]">Call outcomes</h3>
                {summary && summary.totalCalls > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-6">
                    <div className="h-[150px] w-[150px]">
                      <Doughnut
                        data={{
                          labels: ['Appointment booked', 'Qualified', 'Not qualified'],
                          datasets: [{
                            data: [summary.siteVisits, summary.qualifiedCalls - summary.siteVisits, summary.totalCalls - summary.qualifiedCalls],
                            backgroundColor: ['#A855F7', '#22D3EE', t.muted],
                            borderColor: t.surface,
                            borderWidth: 3,
                          }],
                        }}
                        options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '72%' }}
                      />
                    </div>
                    <div className="flex flex-col gap-2.5 text-[13px]">
                      <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-primary" /><span className="text-text-muted">Appointment booked</span><b className="tabular-nums">{summary.siteVisits}</b></span>
                      <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-cyan" /><span className="text-text-muted">Qualified</span><b className="tabular-nums">{summary.qualifiedCalls - summary.siteVisits}</b></span>
                      <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-muted" /><span className="text-text-muted">Not qualified</span><b className="tabular-nums">{summary.totalCalls - summary.qualifiedCalls}</b></span>
                    </div>
                  </div>
                ) : (
                  <EmptyState icon="donut_large" text="Outcomes appear once calls are logged." />
                )}
              </section>

              <section className="bento-tile bento-w2">
                <h3 className="bento-title text-[15px]">At a glance</h3>
                <div className="mt-4 grid grid-cols-3 gap-x-3 gap-y-5">
                  <GlanceStat label="Total minutes" value={String(summary?.totalMinutes ?? 0)} />
                  <GlanceStat label="Active agents" value={String(summary?.activeAgents ?? 0)} />
                  <GlanceStat label="Live calls" value={String(activeCalls.length)} live={activeCalls.length > 0} />
                  <GlanceStat label="Qualified" value={String(summary?.qualifiedCalls ?? 0)} />
                  <GlanceStat label="Success rate" value={`${successPct}%`} />
                  <GlanceStat label="Conversion" value={`${summary ? Math.round(summary.conversionRatio * 100) : 0}%`} />
                </div>
                <p className="mt-5 border-t border-border pt-3 text-xs text-text-muted">
                  Connected apps: <b className="text-text">{connectedIntegrations.length}</b> · Upcoming appointments: <b className="text-text">{upcomingAppointments.length}</b>
                </p>
              </section>

              {isVisible('quick_actions') && (
                <section className="bento-tile bento-w2">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <h3 className="bento-title text-[15px]">Quick actions</h3>
                    <span className="text-[11px] text-text-muted">Based on your {user?.role ?? 'member'} access</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2.5">
                    <QuickAction to="/dashboard/agents" icon="mic" label="Test an agent" />
                    <QuickAction to="/dashboard/outbound" icon="campaign" label="Start campaign" />
                    <QuickAction to="/dashboard/contacts" icon="person_add" label="Add contact" />
                    <QuickAction to="/dashboard/appointments" icon="event" label="New appointment" />
                    {user?.role !== 'viewer' && <QuickAction to="/dashboard/integrations" icon="extension" label="Connect app" />}
                    {user?.role !== 'viewer' && <QuickAction to="/dashboard/website-widget" icon="widgets" label="Install widget" />}
                  </div>
                </section>
              )}

              {isVisible('followups') && (
                <section className="bento-tile bento-w2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="bento-title text-[15px]">Follow-up queue</h3>
                      <p className="mt-0.5 text-xs text-text-muted">{followUps.length} recent lead{followUps.length === 1 ? '' : 's'} awaiting the next action</p>
                    </div>
                    <Link to="/dashboard/contacts" className="text-xs font-bold text-cyan hover:underline">View contacts →</Link>
                  </div>
                  {followUps.length === 0 ? <EmptyState icon="task_alt" text="No qualified or new leads are waiting for follow-up." /> : (
                    <div className="mt-3 flex flex-col">
                      {followUps.map((contact) => (
                        <Link key={contact.id} to={`/dashboard/contacts/${contact.id}`} aria-label={`Open contact ${contact.name || contact.phone || contact.email || ''}`.trim()} className="bento-row flex items-center gap-3 rounded-xl px-2 py-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{contact.name.slice(0, 2).toUpperCase()}</div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{contact.name}</p>
                            <p className="truncate text-[11px] text-text-muted">{contact.phone || contact.email || 'No contact details'} · {contact.source}</p>
                          </div>
                          <span className="rounded-full bg-cyan/10 px-2 py-1 text-[10px] font-bold capitalize text-cyan">{contact.status}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {isVisible('appointments') && (
                <section className="bento-tile bento-w2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="bento-title text-[15px]">Upcoming appointments</h3>
                      <p className="mt-0.5 text-xs text-text-muted">{upcomingAppointments.length} confirmed booking{upcomingAppointments.length === 1 ? '' : 's'}</p>
                    </div>
                    <Link to="/dashboard/appointments" className="text-xs font-bold text-cyan hover:underline">Calendar →</Link>
                  </div>
                  {upcomingAppointments.length === 0 ? <EmptyState icon="event_busy" text="No upcoming appointments. Artha can book them during calls." /> : (
                    <div className="mt-3 flex flex-col">
                      {upcomingAppointments.slice(0, 5).map((appointment) => (
                        <div key={appointment.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5">
                          <div className="w-11 shrink-0 rounded-xl bg-success/10 py-1 text-center">
                            <p className="text-[10px] font-bold uppercase text-success">{new Date(`${appointment.date}T00:00:00`).toLocaleDateString('en-IN', { month: 'short' })}</p>
                            <p className="bento-num text-sm">{Number(appointment.date.slice(-2))}</p>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{appointment.name}</p>
                            <p className="text-[11px] text-text-muted">{appointment.time} · {appointment.durationMinutes} min</p>
                          </div>
                          <span className="text-[11px] capitalize text-text-muted">{appointment.source}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {isVisible('channels') && (
                <section className="bento-tile bento-w4">
                  <h3 className="bento-title text-[15px]">Channel performance</h3>
                  <p className="mt-0.5 text-xs text-text-muted">Volume, qualification and conversion across every entry point</p>
                  {analytics?.byChannel?.length ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {analytics.byChannel.map((channel) => {
                        const rate = channel.calls ? Math.round(channel.qualified * 100 / channel.calls) : 0
                        return (
                          <div key={channel.channel} className="rounded-2xl bg-surface-high/50 p-4">
                            <div className="flex items-center justify-between"><p className="font-bold">{channel.channel}</p><span className="text-xs font-bold text-cyan">{rate}% qualified</span></div>
                            <div className="mt-4 grid grid-cols-3 gap-2 text-center"><MiniMetric label="Calls" value={channel.calls} /><MiniMetric label="Leads" value={channel.qualified} /><MiniMetric label="Minutes" value={channel.minutes} /></div>
                          </div>
                        )
                      })}
                    </div>
                  ) : <EmptyState icon="hub" text="Channel performance appears after your first calls." />}
                </section>
              )}

              {/* Owner-only: visitor feedback is collected by our public
                  marketing-site widget, so it measures US, not the tenant. */}
              {user?.isPlatformOwner && isVisible('feedback') && (
                <section className="bento-tile bento-w4">
                  <h3 className="bento-title text-[15px]">Website visitor feedback</h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <StatTile compact label="Feedback received" value={String(feedback?.total ?? 0)} icon="reviews" tone="primary" />
                    <StatTile compact label="Helpful" value={feedback?.helpfulPercent == null ? '—' : `${feedback.helpfulPercent}%`} icon="thumb_up" tone="success" />
                    <Link to="/dashboard/calls?feedback=not_helpful" className="rounded-xl border border-border bg-surface p-4 transition-colors hover:border-destructive"><p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Needs review</p><p className="mt-1 font-display text-2xl font-bold text-destructive">{feedback?.notHelpful ?? 0}</p><p className="mt-1 text-xs text-text-muted">Open negative-feedback conversations →</p></Link>
                  </div>
                  {(feedback?.firstResponseP50Ms != null || feedback?.firstResponseP95Ms != null) && <p className="mt-3 text-xs text-text-muted">First AI response: <span className="font-semibold text-text">p50 {feedback.firstResponseP50Ms == null ? '—' : `${(feedback.firstResponseP50Ms / 1000).toFixed(1)}s`}</span>{' · '}<span className="font-semibold text-text">p95 {feedback.firstResponseP95Ms == null ? '—' : `${(feedback.firstResponseP95Ms / 1000).toFixed(1)}s`}</span></p>}
                </section>
              )}
            </div>
          </>
        )}

        {tab === 'analytics' && analyticsAllowed === false && (
          <section className="bento-tile bento-hero flex flex-col items-start gap-5 sm:p-8">
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">Growth and Scale plans</span>
            <h2 className="bento-title max-w-2xl text-[28px] leading-tight sm:text-4xl">See why calls convert, not just how many</h2>
            <p className="max-w-xl text-[15px] leading-relaxed text-white/80">
              Analytics breaks every call down by agent, channel, language and hour, scores conversations for sentiment and quality, and shows the top reasons leads don&apos;t qualify.
            </p>
            <ul className="grid gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
              {ANALYTICS_FEATURES.map((feature) => (
                <li key={feature} className="flex items-center gap-2"><Icon name="check_circle" className="text-[18px] text-white/90" />{feature}</li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/dashboard/settings?tab=billing" className="bento-pill bento-pill-light">Upgrade to Growth →</Link>
              <span className="text-xs text-white/70">Your call data is kept; Analytics opens as soon as you upgrade.</span>
            </div>
          </section>
        )}

        {tab === 'analytics' && analyticsAllowed && (
          <>
            <div className="bento-grid">
              <section className="bento-tile bento-w2 flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="bento-title text-[15px]">Pipeline value</h3>
                    <p className="mt-0.5 text-xs text-text-muted">Budget mentioned by qualified leads · last 30 days</p>
                  </div>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success/12 text-success"><Icon name="trending_up" className="text-[19px]" /></span>
                </div>
                {!insights || insights.pipeline.withBudget === 0 ? (
                  <p className="mt-4 text-sm leading-relaxed text-text-muted">
                    {insights && insights.pipeline.qualifiedLeads > 0
                      ? `${insights.pipeline.qualifiedLeads} qualified lead${insights.pipeline.qualifiedLeads === 1 ? '' : 's'}, none with a budget yet. Budgets appear when callers mention one.`
                      : 'Budgets callers mention on qualified calls add up here, in any language.'}
                  </p>
                ) : (
                  <div className="mt-4 flex flex-1 flex-col justify-between gap-4">
                    <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                      <div>
                        <p className="bento-num text-5xl leading-none">{formatInrShort(insights.pipeline.totalInr)}</p>
                        <p className="mt-2 text-xs font-bold text-text-muted">qualified pipeline</p>
                      </div>
                      {insights.pipeline.bookedInr > 0 && (
                        <div className="pb-0.5">
                          <p className="bento-num text-2xl leading-none">{formatInrShort(insights.pipeline.bookedInr)}</p>
                          <p className="mt-1.5 text-xs text-text-muted">with an appointment booked</p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-surface-high/70 px-2.5 py-1 font-semibold">{insights.pipeline.withBudget} of {insights.pipeline.qualifiedLeads} qualified leads gave a budget</span>
                      {insights.pipeline.bookedLeads > 0 && <span className="rounded-full bg-success/12 px-2.5 py-1 font-bold text-success">{insights.pipeline.bookedLeads} booked</span>}
                    </div>
                  </div>
                )}
              </section>

              <section className="bento-tile bento-w2">
                <h3 className="bento-title text-[15px]">Best and worst call</h3>
                <p className="mt-0.5 text-xs text-text-muted">By agent QA score · last 30 days{insights?.scoredCalls ? ` · ${insights.scoredCalls} scored` : ''}</p>
                {insights && (insights.bestCall || insights.worstCall) ? (
                  <div className="mt-3 flex flex-col gap-2">
                    {[{ call: insights.bestCall, label: 'Best', tone: 'bg-success/12 text-success', cta: 'Listen' }, { call: insights.worstCall, label: 'Needs work', tone: 'bg-amber/12 text-amber', cta: 'Review' }]
                      .filter((entry) => entry.call)
                      .map(({ call, label, tone, cta }) => (
                        <Link key={label} to={`/dashboard/calls/${call!.id}`} className="bento-row flex items-start gap-3 rounded-xl px-2 py-2.5">
                          <span className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl ${tone}`}>
                            <span className="bento-num text-base leading-none">{call!.qaScore}</span>
                            <span className="text-[9px] font-bold uppercase">QA</span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2"><span className="truncate text-sm font-semibold">{call!.title}</span><span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-text-muted">{label}</span></span>
                            <span className="mt-0.5 line-clamp-2 text-xs text-text-muted">{call!.summary || `${formatDuration(call!.durationSeconds)} call`}</span>
                          </span>
                          <span className="shrink-0 self-center rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">{call!.hasRecording ? cta : 'Open'}</span>
                        </Link>
                      ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-relaxed text-text-muted">Analyze calls from a call's detail page to score them; the best and worst scored call of the period show here.</p>
                )}
              </section>

              <section className="bento-tile bento-w4">
                <h3 className="bento-title text-[15px]">Which lead source works</h3>
                <p className="mt-0.5 text-xs text-text-muted">Leads by the ad, campaign or form they came from, and what happened next · last 30 days</p>
                {insights && insights.ads.length > 0 ? (
                  <div className="mt-4 flex flex-col gap-2">
                    <div className="hidden grid-cols-[minmax(0,2.4fr)_repeat(4,minmax(0,1fr))] gap-3 px-3 text-[11px] font-bold uppercase tracking-wide text-text-muted md:grid">
                      <span>Source, ad or campaign</span><span className="text-right">Leads</span><span className="text-right">Called</span><span className="text-right">Qualified</span><span className="text-right">Booked</span>
                    </div>
                    {insights.ads.map((ad) => {
                      const rate = ad.leads ? Math.round((ad.qualified * 100) / ad.leads) : 0
                      return (
                        <div key={ad.ad} className="rounded-2xl bg-surface-high/40 px-3 py-3 md:grid md:grid-cols-[minmax(0,2.4fr)_repeat(4,minmax(0,1fr))] md:items-center md:gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold" title={ad.ad}>{ad.ad}</p>
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-high"><div className="h-full rounded-full bg-gradient-to-r from-primary to-cyan" style={{ width: `${rate}%` }} /></div>
                              <span className="text-[11px] font-bold text-text-muted">{rate}% qualified</span>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-4 gap-1 text-center md:contents">
                            {[['Leads', ad.leads], ['Called', ad.called], ['Qualified', ad.qualified], ['Booked', ad.booked]].map(([label, value]) => (
                              <div key={label as string} className="md:text-right">
                                <p className="bento-num text-lg leading-none">{value}</p>
                                <p className="mt-1 text-[10px] font-bold uppercase text-text-muted md:hidden">{label}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-relaxed text-text-muted">Leads from your connected sources are grouped by the ad, campaign or form they came from.</p>
                )}
              </section>

              <section className="bento-tile bento-w4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan/12 text-cyan"><Icon name="auto_awesome" className="text-[19px]" /></span>
                  <div>
                    <h3 className="bento-title text-[15px]">Conversation intelligence</h3>
                    <p className="text-xs text-text-muted">Last 30 days</p>
                  </div>
                </div>
                {!intel || intel.analyzed === 0 ? (
                  <EmptyState icon="auto_awesome" text="Analyze calls from any call's detail page to build sentiment, outcome, and QA insights here." />
                ) : (
                  <div className="mt-5 flex flex-col gap-6">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      <IntelStat label="Calls analyzed" value={String(intel.analyzed)} />
                      <IntelStat label="Avg agent QA" value={intel.avgQaScore != null ? `${intel.avgQaScore}/100` : '-'} tone="text-primary" />
                      <IntelStat label="Positive" value={String(intel.sentiment.positive)} tone="text-success" />
                      <IntelStat label="Negative" value={String(intel.sentiment.negative)} tone="text-destructive" />
                    </div>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div>
                        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-text-muted">Outcomes</p>
                        <div className="flex flex-col gap-2.5">
                          {intel.outcomes.map((o) => {
                            const max = Math.max(...intel.outcomes.map((x) => x.count), 1)
                            return (
                              <div key={o.outcome} className="flex items-center gap-3 text-xs">
                                <span className="w-28 shrink-0 capitalize text-text-muted">{o.outcome.replace(/_/g, ' ')}</span>
                                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-high">
                                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-cyan" style={{ width: `${(o.count / max) * 100}%` }} />
                                </div>
                                <span className="w-7 text-right font-bold tabular-nums">{o.count}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      <div>
                        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-text-muted">Top disqualification reasons</p>
                        {intel.topDisqualifications.length === 0 ? (
                          <p className="text-xs text-text-muted">None recorded.</p>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {intel.topDisqualifications.map((r) => (
                              <div key={r.reason} className="flex items-center justify-between gap-2 rounded-xl bg-surface-high/50 px-3 py-2 text-xs">
                                <span className="truncate capitalize">{r.reason}</span>
                                <span className="shrink-0 font-bold tabular-nums text-text-muted">{r.count}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <AnalyticsTile title="Calls by channel">
                {analytics && analytics.byChannel && analytics.byChannel.length > 0 ? (
                  <Bar
                    data={{
                      labels: analytics.byChannel.map((c) => c.channel),
                      datasets: [
                        { label: 'Calls', data: analytics.byChannel.map((c) => c.calls), backgroundColor: '#A855F7', ...BAR_STYLE },
                        { label: 'Qualified', data: analytics.byChannel.map((c) => c.qualified), backgroundColor: '#22D3EE', ...BAR_STYLE },
                      ],
                    }}
                    options={{ maintainAspectRatio: false, plugins: { legend: LEGEND }, scales: { x: { grid: { display: false }, ticks: TICKS }, y: { grid: GRID, ticks: { ...TICKS, precision: 0 } } } }}
                  />
                ) : (
                  <EmptyState icon="bar_chart" text="Channel split appears after the first calls - Web, Website Widget, and Phone." />
                )}
              </AnalyticsTile>

              <AnalyticsTile title="Calls by agent">
                {analytics && analytics.byAgent && analytics.byAgent.length > 0 ? (
                  <Bar
                    data={{
                      labels: analytics.byAgent.map((a) => a.agent),
                      datasets: [
                        { label: 'Calls', data: analytics.byAgent.map((a) => a.calls), backgroundColor: '#FF3D9A', ...BAR_STYLE },
                        { label: 'Qualified', data: analytics.byAgent.map((a) => a.qualified), backgroundColor: '#22D3EE', ...BAR_STYLE },
                      ],
                    }}
                    options={{ maintainAspectRatio: false, plugins: { legend: LEGEND }, scales: { x: { grid: { display: false }, ticks: TICKS }, y: { grid: GRID, ticks: { ...TICKS, precision: 0 } } } }}
                  />
                ) : (
                  <EmptyState icon="bar_chart" text="Per-agent stats appear after the first calls." />
                )}
              </AnalyticsTile>

              <section className="bento-tile bento-w2">
                <h3 className="bento-title text-[15px]">Languages</h3>
                <p className="mt-0.5 text-xs text-text-muted">Calls, qualification and length by language · last 30 days</p>
                {insights && insights.languages.length > 0 ? (
                  <div className="mt-4 flex flex-col gap-3">
                    {insights.languages.map((l) => {
                      const max = Math.max(...insights.languages.map((x) => x.calls), 1)
                      const rate = l.calls ? Math.round((l.qualified * 100) / l.calls) : 0
                      return (
                        <div key={l.language}>
                          <div className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="truncate font-semibold">{l.language === 'unknown' ? 'Not detected' : LANGUAGE_NAMES[l.language] ?? LANGUAGE_NAMES[`${l.language}-IN`] ?? l.language}</span>
                            <span className="shrink-0 text-xs text-text-muted"><b className="text-text">{l.calls}</b> calls · {rate}% qualified · {formatDuration(l.avgSeconds)}</span>
                          </div>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-high"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, (l.calls / max) * 100)}%` }} /></div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <EmptyState icon="translate" text="Language mix appears after the first calls." />
                )}
              </section>

              <AnalyticsTile title="Average call duration" subtitle="Last 14 days">
                {analytics && analytics.durationTrend.length > 0 ? (
                  <Line
                    data={{
                      labels: analytics.durationTrend.map((d) => shortDay(d.day)),
                      datasets: [{ data: analytics.durationTrend.map((d) => Math.round(d.avgSeconds)), borderColor: '#22D3EE', backgroundColor: 'rgba(34,211,238,0.10)', fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2.5 }],
                    }}
                    options={{ maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { ...TICKS, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } }, y: { grid: GRID, ticks: { ...TICKS, callback: (v) => `${v}s` } } } }}
                  />
                ) : (
                  <EmptyState icon="timer" text="Duration trend appears after the first calls." />
                )}
              </AnalyticsTile>

              <AnalyticsTile title="Qualification funnel" chart={false}>
                {analytics ? (
                  <div className="flex flex-col gap-3.5 py-1">
                    <FunnelBar label="Answered" value={analytics.funnel.answered} max={analytics.funnel.answered} color="#6B647F" />
                    <FunnelBar label="Engaged (4+ turns)" value={analytics.funnel.engaged} max={analytics.funnel.answered} color="#A855F7" />
                    <FunnelBar label="Qualified" value={analytics.funnel.qualified} max={analytics.funnel.answered} color="#22D3EE" />
                    <FunnelBar label="Appointment booked" value={analytics.funnel.visitBooked} max={analytics.funnel.answered} color="#FBBF24" />
                  </div>
                ) : (
                  <EmptyState icon="filter_alt" text="Funnel appears after the first calls." />
                )}
              </AnalyticsTile>

              <AnalyticsTile title="Caller sentiment" chart={false}>
                {analytics && (analytics.sentiment.positive + analytics.sentiment.neutral + analytics.sentiment.negative) > 0 ? (
                  <div className="flex flex-wrap items-center gap-6 py-1">
                    <div className="h-[150px] w-[150px]">
                      <Doughnut
                        data={{
                          labels: ['Positive', 'Neutral', 'Negative'],
                          datasets: [{ data: [analytics.sentiment.positive, analytics.sentiment.neutral, analytics.sentiment.negative], backgroundColor: ['#22D3EE', t.muted, '#F43F5E'], borderColor: t.surface, borderWidth: 3 }],
                        }}
                        options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '72%' }}
                      />
                    </div>
                    <div className="flex flex-col gap-2.5 text-[13px]">
                      <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-cyan" /><span className="text-text-muted">Positive</span><b className="tabular-nums">{analytics.sentiment.positive}</b></span>
                      <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-muted" /><span className="text-text-muted">Neutral</span><b className="tabular-nums">{analytics.sentiment.neutral}</b></span>
                      <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#F43F5E' }} /><span className="text-text-muted">Negative</span><b className="tabular-nums">{analytics.sentiment.negative}</b></span>
                    </div>
                  </div>
                ) : (
                  <EmptyState icon="mood" text="Sentiment split appears after the first calls." />
                )}
              </AnalyticsTile>

              <AnalyticsTile title="Peak call hours" subtitle="Times shown in IST (Indian Standard Time)" wide>
                {analytics && analytics.peakHours.length > 0 ? (
                  <Bar
                    data={{
                      labels: analytics.peakHours.map((h) => `${h.hour}:00`),
                      datasets: [{ data: analytics.peakHours.map((h) => h.count), backgroundColor: '#22D3EE', ...BAR_STYLE }],
                    }}
                    options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: TICKS }, y: { grid: GRID, ticks: { ...TICKS, precision: 0 } } } }}
                  />
                ) : (
                  <EmptyState icon="schedule" text="Hourly distribution appears after the first calls." />
                )}
              </AnalyticsTile>
            </div>

            {summary && (
              <p className="text-xs text-text-muted">
                Based on {summary.totalCalls} logged calls · avg duration {formatDuration(summary.avgDurationSeconds)}
              </p>
            )}
          </>
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

function IntelStat({ label, value, tone = 'text-text' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-surface-high/50 p-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`bento-num mt-2 text-xl sm:text-2xl ${tone}`}>{value}</p>
    </div>
  )
}

function AnalyticsTile({ title, subtitle, wide = false, chart = true, children }: { title: string; subtitle?: string; wide?: boolean; chart?: boolean; children: ReactNode }) {
  return (
    <section className={`bento-tile ${wide ? 'bento-w4' : 'bento-w2'}`}>
      <h3 className="bento-title text-[15px]">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
      <div className={chart ? 'mt-4 h-[220px]' : 'mt-4'}>{children}</div>
    </section>
  )
}

function QuickAction({ to, icon, label }: { to: string; icon: string; label: string }) {
  return <Link to={to} className="bento-pill bento-pill-soft"><Icon name={icon} className="text-[17px] text-primary" />{label}</Link>
}

function GlanceStat({ label, value, live = false }: { label: string; value: string; live?: boolean }) {
  return <div><p className="bento-num flex items-center gap-1.5 text-2xl leading-none">{live && <span className="pulse-dot h-2 w-2 rounded-full bg-magenta" />}{value}</p><p className="mt-1.5 text-[11px] font-bold uppercase tracking-wide text-text-muted">{label}</p></div>
}

// Keyed by the id prefix each /notifications item is generated with (see
// calls_db.notifications) - kept here rather than sent from the server
// because it's presentation, not data.
const ATTENTION_ICON: Record<string, string> = {
  credits: 'account_balance_wallet',
  integration: 'sync_problem',
  'failed-calls': 'error',
  'dropped-calls': 'call_missed',
  'negative-feedback': 'thumb_down',
  'campaign-complete': 'campaign',
}

function AttentionLink({ to, icon, label, detail, tone }: { to: string; icon: string; label: string; detail: string; tone: 'destructive' | 'amber' | 'success' }) {
  const toneClass = {
    destructive: 'text-destructive bg-destructive/10',
    amber: 'text-amber bg-amber/10',
    success: 'text-success bg-success/10',
  }[tone]
  return <Link to={to} aria-label={`${label}: ${detail}`} className="bento-row flex items-start gap-3 rounded-xl px-2 py-2.5"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneClass}`}><Icon name={icon} className="text-[19px]" /></span><span className="min-w-0"><span className="block text-sm font-semibold">{label}</span><span className="mt-0.5 block text-xs text-text-muted">{detail} →</span></span></Link>
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return <div><p className="bento-num text-lg">{value}</p><p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p></div>
}
