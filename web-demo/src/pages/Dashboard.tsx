import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import '../lib/chart-setup'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { Card } from '../components/ui/Card'
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
  fetchFeedbackSummary,
  fetchIntelligence,
  fetchIntegrations,
  fetchLaunchReadiness,
  fetchPeriodComparison,
  fetchUsageTrends,
  formatDateTime,
  formatDuration,
  type IntelligenceSummary,
} from '../lib/api'
import { apiProfilePreferences, apiUpdateProfilePreferences, useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'
import type { ActiveCallInfo, Analytics, Appointment, BillingSummary, CallRecord, Contact, DashboardPeriodComparison, DashboardSummary, FeedbackSummary, Integration, LaunchReadiness, UsageTrends } from '../lib/types'

const AGENT_STATE_STYLES: Record<string, string> = {
  listening: 'bg-cyan/20 text-cyan border-cyan/30',
  thinking: 'bg-primary/20 text-primary border-primary/30',
  speaking: 'bg-magenta/20 text-magenta border-magenta/30',
}

const CALL_STATUS_STYLES: Record<string, string> = {
  completed: 'bg-cyan/20 text-cyan border-cyan/30',
  failed: 'bg-destructive/20 text-destructive border-destructive/30',
}

const RANGE_OPTIONS = [
  { label: 'Week', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
]

const DASHBOARD_CARDS = [
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
  const [allCalls, setAllCalls] = useState<CallRecord[]>([])
  const [rangeDays, setRangeDays] = useState(14)
  const [recentCallsCollapsed, setRecentCallsCollapsed] = useState(true)
  const [checklistDismissed, setChecklistDismissed] = useState<boolean | null>(null)
  const [dismissingChecklist, setDismissingChecklist] = useState(false)
  const [readiness, setReadiness] = useState<LaunchReadiness | null>(null)
  const [feedback, setFeedback] = useState<FeedbackSummary | null>(null)
  const [comparison, setComparison] = useState<DashboardPeriodComparison | null>(null)
  const [billing, setBilling] = useState<BillingSummary | null>(null)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [hiddenCards, setHiddenCards] = useState<Set<string>>(new Set())
  const [customizing, setCustomizing] = useState(false)

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
    fetchCalls().then((calls) => { setAllCalls(calls); setRecentCalls(calls.slice(0, 5)) }).catch(() => { setAllCalls([]); setRecentCalls([]) })
    fetchLaunchReadiness().then(setReadiness).catch(() => setReadiness(null))
    fetchFeedbackSummary().then(setFeedback).catch(() => setFeedback(null))
    fetchBilling().then(setBilling).catch(() => setBilling(null))
    fetchIntegrations().then(setIntegrations).catch(() => setIntegrations([]))
    fetchContacts().then(setContacts).catch(() => setContacts([]))
    fetchAppointments().then(setAppointments).catch(() => setAppointments([]))
    apiProfilePreferences()
      .then((preferences) => {
        setChecklistDismissed(Boolean(preferences.dashboard_checklist_dismissed))
        try {
          const parsed = JSON.parse(preferences.dashboard_hidden_cards || '[]')
          setHiddenCards(new Set(Array.isArray(parsed) ? parsed : []))
        } catch { setHiddenCards(new Set()) }
      })
      .catch(() => setChecklistDismissed(false))
  }, [])

  useEffect(() => {
    fetchUsageTrends(rangeDays).then(setTrends).catch(() => setTrends(null))
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
  const failedCalls = allCalls.filter((call) => call.callStatus === 'failed')
  const integrationErrors = integrations.filter((integration) => Boolean(integration.lastError))
  const connectedIntegrations = integrations.filter((integration) => integration.status === 'connected')
  const lowCredits = billing ? billing.creditsRemaining <= Math.max(20, billing.creditsTotal * 0.15) : false
  const followUps = contacts
    .filter((contact) => ['new', 'qualified'].includes(contact.status.toLowerCase()))
    .sort((a, b) => String(b.lastCalledAt || b.createdAt).localeCompare(String(a.lastCalledAt || a.createdAt)))
    .slice(0, 5)
  const upcomingAppointments = appointments
    .filter((appointment) => appointment.status === 'confirmed' && appointment.date >= new Date().toISOString().slice(0, 10))
  const attentionCount = failedCalls.length + integrationErrors.length + (lowCredits ? 1 : 0) + (feedback?.notHelpful ?? 0)

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
    try {
      await apiUpdateProfilePreferences({ dashboard_checklist_dismissed: true })
    } catch {
      setChecklistDismissed(false)
    } finally {
      setDismissingChecklist(false)
    }
  }

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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{greeting()}, {user?.accountName ?? 'there'}</h2>
                <p className="mt-1 text-sm text-text-muted">
                  Your agents handled <span className="font-semibold text-text">{summary?.totalCalls ?? 0} calls</span>{' '}
                  with <span className="font-semibold text-cyan">{successPct}% qualified</span>
                </p>
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCustomizing((value) => !value)}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-text-muted transition-colors hover:border-primary hover:text-text"
                >
                  <Icon name="tune" className="text-[17px]" /> Customize dashboard
                </button>
                {customizing && (
                  <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-border bg-surface p-3 shadow-xl">
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

            {readiness && checklistDismissed === false && readiness.completed < readiness.total && (
              <SectionCard
                title="Launch checklist"
                action={(
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-primary">{readiness.completed}/{readiness.total} complete</span>
                    <button
                      type="button"
                      onClick={dismissChecklist}
                      disabled={dismissingChecklist}
                      aria-label="Dismiss launch checklist and do not show it again"
                      title="Don't show again"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-high/50 hover:text-text disabled:opacity-50"
                    >
                      <Icon name="close" className="text-[18px]" />
                    </button>
                  </div>
                )}
              >
                <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {readiness.checks.map((check) => (
                    <Link
                      key={check.key}
                      to={check.to}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${check.complete ? 'border-success/30 bg-success/5 text-text-muted' : 'border-border hover:border-primary'}`}
                    >
                      <Icon name={check.complete ? 'check_circle' : 'radio_button_unchecked'} className={`text-[18px] ${check.complete ? 'text-success' : 'text-primary'}`} />
                      <span className={check.complete ? 'line-through' : ''}>{check.label}</span>
                    </Link>
                  ))}
                </div>
              </SectionCard>
            )}

            {isVisible('attention') && (
              <SectionCard
                title="Needs attention"
                subtitle={attentionCount ? `${attentionCount} item${attentionCount === 1 ? '' : 's'} may affect customer conversations` : 'Everything important is in good shape'}
                action={<span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${attentionCount ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>{attentionCount || 'All clear'}</span>}
              >
                {attentionCount === 0 ? (
                  <div className="flex items-center gap-3 p-4 text-sm text-text-muted"><Icon name="verified" className="text-success" /> No failed calls, integration errors, low-credit warnings, or negative feedback.</div>
                ) : (
                  <div className="grid gap-2 p-4 md:grid-cols-2 xl:grid-cols-4">
                    {failedCalls.length > 0 && <AttentionLink to="/dashboard/calls?status=failed" icon="call_missed" label={`${failedCalls.length} failed call${failedCalls.length === 1 ? '' : 's'}`} detail="Review failure reasons" tone="destructive" />}
                    {integrationErrors.length > 0 && <AttentionLink to="/dashboard/integrations" icon="sync_problem" label={`${integrationErrors.length} integration error${integrationErrors.length === 1 ? '' : 's'}`} detail="Reconnect or retry delivery" tone="amber" />}
                    {lowCredits && <AttentionLink to="/dashboard/billing" icon="account_balance_wallet" label={`${billing?.creditsRemaining ?? 0} credits left`} detail="Top up before calls are affected" tone="amber" />}
                    {(feedback?.notHelpful ?? 0) > 0 && <AttentionLink to="/dashboard/calls?feedback=not_helpful" icon="thumb_down" label={`${feedback?.notHelpful} conversation${feedback?.notHelpful === 1 ? '' : 's'} need review`} detail="Inspect customer feedback" tone="destructive" />}
                  </div>
                )}
              </SectionCard>
            )}

            {isVisible('quick_actions') && (
              <div>
                <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Quick actions</h3><span className="text-[11px] text-text-muted">Based on your {user?.role ?? 'member'} access</span></div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <QuickAction to="/dashboard/agents" icon="mic" label="Test an agent" />
                  <QuickAction to="/dashboard/outbound" icon="campaign" label="Start campaign" />
                  <QuickAction to="/dashboard/contacts" icon="person_add" label="Add contact" />
                  <QuickAction to="/dashboard/appointments" icon="event" label="New appointment" />
                  {user?.role !== 'viewer' && <QuickAction to="/dashboard/integrations" icon="extension" label="Connect app" />}
                  {user?.role !== 'viewer' && <QuickAction to="/dashboard/website-widget" icon="widgets" label="Install widget" />}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
              <div><p className="text-sm font-semibold">Performance period</p><p className="text-[11px] text-text-muted">Compared with the immediately preceding period</p></div>
              <div className="flex gap-1 rounded-lg border border-border p-0.5">
                {RANGE_OPTIONS.map((range) => <button key={range.days} onClick={() => setRangeDays(range.days)} className={`rounded-md px-3 py-1.5 text-[11px] font-semibold ${rangeDays === range.days ? 'bg-primary text-bg' : 'text-text-muted hover:text-text'}`}>{range.label}</button>)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <ComparisonTile label="Calls" value={comparison?.current.calls ?? 0} change={comparison?.change.calls ?? null} icon="call" />
              <ComparisonTile label="Qualified leads" value={comparison?.current.qualified ?? 0} change={comparison?.change.qualified ?? null} icon="verified" />
              <ComparisonTile label="Appointments" value={comparison?.current.booked ?? 0} change={comparison?.change.booked ?? null} icon="event_available" />
              <ComparisonTile label="Minutes" value={comparison?.current.minutes ?? 0} change={comparison?.change.minutes ?? null} icon="timer" />
            </div>

            {/* Hero: live calls when any are in progress, otherwise the most
                recent calls - this is a voice platform, so the front page
                leads with actual calls, not abstract numbers. */}
            <SectionCard
              title={showingLive ? 'Live calls' : 'Recent calls'}
              action={
                <div className="flex items-center gap-3">
                  {showingLive ? (
                    <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
                      <span className="pulse-dot h-2 w-2 rounded-full bg-cyan" />
                      {activeCalls.length} in progress
                    </span>
                  ) : (
                    <Link to="/dashboard/calls" className="text-xs font-bold text-cyan hover:underline">
                      View all →
                    </Link>
                  )}
                  {!showingLive && (
                    <button
                      type="button"
                      onClick={() => setRecentCallsCollapsed((c) => !c)}
                      aria-label={recentCallsCollapsed ? 'Expand recent calls' : 'Collapse recent calls'}
                      aria-expanded={!recentCallsCollapsed}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-high/40 hover:text-text"
                    >
                      <Icon
                        name="expand_more"
                        className={`text-[18px] transition-transform ${recentCallsCollapsed ? '-rotate-90' : ''}`}
                      />
                    </button>
                  )}
                </div>
              }
              footer={
                !callsCollapsed && !showingLive && recentCalls.length > 0 ? (
                  <Link to="/dashboard/calls" className="font-bold text-cyan hover:underline">
                    View full call history →
                  </Link>
                ) : undefined
              }
            >
              <div className={`divide-y divide-border ${callsCollapsed ? 'hidden' : ''}`}>
                {showingLive
                  ? activeCalls.map((call) => (
                      <div key={call.room} className="flex items-center gap-3 px-4 py-3 sm:px-5">
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
                    ))
                  : recentCalls.length === 0
                    ? (
                      <EmptyState
                        icon="call"
                        text="No calls yet - every call your agent takes lands here automatically."
                      />
                    )
                    : recentCalls.map((call) => (
                      <Link
                        key={call.id}
                        to={`/dashboard/calls/${call.id}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-surface-high/20 sm:px-5"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                          {call.initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{call.name}</p>
                          <p className="truncate text-[11px] text-text-muted">
                            {call.channel} · {formatDateTime(call.callDate)}
                          </p>
                        </div>
                        <span className="hidden shrink-0 text-xs text-text-muted sm:block">
                          {formatDuration(call.durationSeconds)}
                        </span>
                        <span
                          className={`shrink-0 whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-semibold capitalize ${
                            CALL_STATUS_STYLES[call.callStatus] ?? 'border-border text-text-muted'
                          }`}
                        >
                          {call.callStatus}
                        </span>
                      </Link>
                    ))}
              </div>
            </SectionCard>

            {/* Secondary KPI strip - compact, not the page's hero. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile compact label="Minutes" value={String(summary?.totalMinutes ?? 0)} icon="timer" tone="cyan" />
              <StatTile compact label="Active Agents" value={String(summary?.activeAgents ?? 0)} icon="smart_toy" tone="primary" />
              <StatTile compact label="Live Calls" value={String(activeCalls.length)} icon="sensors" pulse={activeCalls.length > 0} tone="magenta" />
              <StatTile compact label="Qualified" value={String(summary?.qualifiedCalls ?? 0)} icon="check_circle" tone="success" />
              <StatTile compact label="Success Rate" value={`${successPct}%`} icon="trending_up" tone="amber" />
              <StatTile
                compact
                label="Conversion"
                value={`${summary ? Math.round(summary.conversionRatio * 100) : 0}%`}
                icon="event_available"
                tone="primary"
              />
            </div>

            {isVisible('funnel') && analytics && (
              <SectionCard title="Conversion funnel" subtitle="See where conversations turn into business outcomes">
                <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <FunnelStage label="Answered" value={analytics.funnel.answered} base={analytics.funnel.answered} icon="call" />
                  <FunnelStage label="Engaged" value={analytics.funnel.engaged} base={analytics.funnel.answered} icon="forum" />
                  <FunnelStage label="Qualified" value={analytics.funnel.qualified} base={analytics.funnel.answered} icon="verified" />
                  <FunnelStage label="Booked" value={analytics.funnel.visitBooked} base={analytics.funnel.answered} icon="event_available" />
                </div>
              </SectionCard>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              {isVisible('followups') && (
                <SectionCard title="Follow-up queue" subtitle={`${followUps.length} recent leads awaiting the next action`} action={<Link to="/dashboard/contacts" className="text-xs font-bold text-cyan hover:underline">View contacts →</Link>}>
                  {followUps.length === 0 ? <EmptyState icon="task_alt" text="No qualified or new leads are waiting for follow-up." /> : (
                    <div className="divide-y divide-border">
                      {followUps.map((contact) => <Link key={contact.id} to={`/dashboard/contacts/${contact.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-high/20"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{contact.name.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{contact.name}</p><p className="truncate text-[11px] text-text-muted">{contact.phone || contact.email || 'No contact details'} · {contact.source}</p></div><span className="rounded-full bg-cyan/10 px-2 py-1 text-[10px] font-bold capitalize text-cyan">{contact.status}</span></Link>)}
                    </div>
                  )}
                </SectionCard>
              )}
              {isVisible('appointments') && <SectionCard title="Upcoming appointments" subtitle={`${upcomingAppointments.length} confirmed booking${upcomingAppointments.length === 1 ? '' : 's'}`} action={<Link to="/dashboard/appointments" className="text-xs font-bold text-cyan hover:underline">Calendar →</Link>}>
                {upcomingAppointments.length === 0 ? <EmptyState icon="event_busy" text="No upcoming appointments. Artha can book them during calls." /> : (
                  <div className="divide-y divide-border">{upcomingAppointments.slice(0, 5).map((appointment) => <div key={appointment.id} className="flex items-center gap-3 px-4 py-3"><div className="rounded-lg bg-success/10 px-2 py-1 text-center"><p className="text-[10px] font-bold uppercase text-success">{new Date(`${appointment.date}T00:00:00`).toLocaleDateString('en-IN', { month: 'short' })}</p><p className="text-sm font-bold">{Number(appointment.date.slice(-2))}</p></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{appointment.name}</p><p className="text-[11px] text-text-muted">{appointment.time} · {appointment.durationMinutes} min</p></div><span className="text-[11px] capitalize text-text-muted">{appointment.source}</span></div>)}</div>
                )}
              </SectionCard>}
            </div>

            {isVisible('channels') && (
              <SectionCard title="Channel performance" subtitle="Compare volume, qualification and conversion across every customer entry point">
                {analytics?.byChannel?.length ? <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">{analytics.byChannel.map((channel) => { const rate = channel.calls ? Math.round(channel.qualified * 100 / channel.calls) : 0; return <div key={channel.channel} className="rounded-xl border border-border bg-surface-high/20 p-4"><div className="flex items-center justify-between"><p className="font-semibold">{channel.channel}</p><span className="text-xs font-bold text-cyan">{rate}% qualified</span></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><MiniMetric label="Calls" value={channel.calls} /><MiniMetric label="Leads" value={channel.qualified} /><MiniMetric label="Minutes" value={channel.minutes} /></div></div> })}</div> : <EmptyState icon="hub" text="Channel performance appears after your first calls." />}
              </SectionCard>
            )}

            {isVisible('feedback') && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatTile compact label="Feedback received" value={String(feedback?.total ?? 0)} icon="reviews" tone="primary" />
                  <StatTile compact label="Helpful" value={feedback?.helpfulPercent == null ? '—' : `${feedback.helpfulPercent}%`} icon="thumb_up" tone="success" />
                  <Link to="/dashboard/calls?feedback=not_helpful" className="rounded-xl border border-border bg-surface p-4 transition-colors hover:border-destructive"><p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Needs review</p><p className="mt-1 font-display text-2xl font-bold text-destructive">{feedback?.notHelpful ?? 0}</p><p className="mt-1 text-xs text-text-muted">Open negative-feedback conversations →</p></Link>
                </div>
                {(feedback?.firstResponseP50Ms != null || feedback?.firstResponseP95Ms != null) && <div className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-text-muted">First AI response: <span className="font-semibold text-text">p50 {feedback.firstResponseP50Ms == null ? '—' : `${(feedback.firstResponseP50Ms / 1000).toFixed(1)}s`}</span>{' · '}<span className="font-semibold text-text">p95 {feedback.firstResponseP95Ms == null ? '—' : `${(feedback.firstResponseP95Ms / 1000).toFixed(1)}s`}</span></div>}
              </>
            )}

            <div className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-text-muted">
              Connected apps: <span className="font-semibold text-text">{connectedIntegrations.length}</span>
              {' · '}Upcoming appointments: <span className="font-semibold text-text">{upcomingAppointments.length}</span>
              {' · '}Credits remaining: <span className={`font-semibold ${lowCredits ? 'text-destructive' : 'text-text'}`}>{billing?.creditsRemaining ?? '—'}</span>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
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
                    <EmptyState icon="show_chart" text="No calls yet in this range - every call the agent takes lands here automatically." />
                  )}
                </div>
              </Card>

              <Card className="flex flex-col">
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
                  <EmptyState icon="donut_large" text="Outcomes appear once calls are logged." />
                )}
              </Card>
            </div>
          </>
        )}

        {tab === 'analytics' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="lg:col-span-2">
              <div className="mb-4 flex items-center gap-2">
                <Icon name="auto_awesome" className="text-[18px] text-cyan" />
                <h3 className="text-sm font-semibold">Conversation intelligence</h3>
                <span className="text-xs text-text-muted">· last 30 days</span>
              </div>
              {!intel || intel.analyzed === 0 ? (
                <EmptyState icon="auto_awesome" text="Analyze calls from any call's detail page to build sentiment, outcome, and QA insights here." />
              ) : (
                <div className="flex flex-col gap-5">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <IntelStat label="Calls analyzed" value={String(intel.analyzed)} />
                    <IntelStat label="Avg agent QA" value={intel.avgQaScore != null ? `${intel.avgQaScore}/100` : '-'} tone="text-primary" />
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
            </Card>

            <Card>
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
                  <EmptyState icon="bar_chart" text="Channel split appears after the first calls - Web, Website Widget, and Phone." />
                )}
              </div>
            </Card>

            <Card>
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
                  <EmptyState icon="bar_chart" text="Per-agent stats appear after the first calls." />
                )}
              </div>
            </Card>

            <Card>
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
                  <EmptyState icon="translate" text="Language mix appears after the first calls." />
                )}
              </div>
            </Card>

            <Card>
              <h3 className="mb-4 text-sm font-semibold">Average call duration - last 14 days</h3>
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
                  <EmptyState icon="timer" text="Duration trend appears after the first calls." />
                )}
              </div>
            </Card>

            <Card>
              <h3 className="mb-4 text-sm font-semibold">Qualification funnel</h3>
              {analytics ? (
                <div className="flex flex-col gap-3 py-2">
                  <FunnelBar label="Answered" value={analytics.funnel.answered} max={analytics.funnel.answered} color="#6B647F" />
                  <FunnelBar label="Engaged (4+ turns)" value={analytics.funnel.engaged} max={analytics.funnel.answered} color="#A855F7" />
                  <FunnelBar label="Qualified" value={analytics.funnel.qualified} max={analytics.funnel.answered} color="#22D3EE" />
                  <FunnelBar label="Site visit booked" value={analytics.funnel.visitBooked} max={analytics.funnel.answered} color="#FBBF24" />
                </div>
              ) : (
                <EmptyState icon="filter_alt" text="Funnel appears after the first calls." />
              )}
            </Card>

            <Card>
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
                <EmptyState icon="mood" text="Sentiment split appears after the first calls." />
              )}
            </Card>

            <Card className="lg:col-span-2">
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
                  <EmptyState icon="schedule" text="Hourly distribution appears after the first calls." />
                )}
              </div>
              <p className="mt-2 text-[11px] text-text-muted">Times shown in IST (Indian Standard Time).</p>
            </Card>

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

function IntelStat({ label, value, tone = 'text-text' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-high/40 p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">{label}</p>
      <p className={`mt-1 text-lg font-bold ${tone}`}>{value}</p>
    </div>
  )
}

function QuickAction({ to, icon, label }: { to: string; icon: string; label: string }) {
  return <Link to={to} className="group flex min-h-24 flex-col justify-between rounded-xl border border-border bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-primary"><Icon name={icon} className="text-[22px] text-primary" /><span className="mt-4 text-sm font-semibold group-hover:text-primary">{label} →</span></Link>
}

function AttentionLink({ to, icon, label, detail, tone }: { to: string; icon: string; label: string; detail: string; tone: 'destructive' | 'amber' }) {
  const toneClass = tone === 'destructive' ? 'text-destructive bg-destructive/10' : 'text-amber bg-amber/10'
  return <Link to={to} className="flex items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:border-primary"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneClass}`}><Icon name={icon} className="text-[19px]" /></span><span className="min-w-0"><span className="block text-sm font-semibold">{label}</span><span className="mt-0.5 block text-[11px] text-text-muted">{detail} →</span></span></Link>
}

function ComparisonTile({ label, value, change, icon }: { label: string; value: number; change: number | null; icon: string }) {
  const positive = change != null && change >= 0
  return <Card variant="stat" padding="sm"><div className="flex items-center justify-between"><Icon name={icon} className="text-[20px] text-primary" />{change != null && <span className={`flex items-center gap-0.5 text-[11px] font-bold ${positive ? 'text-success' : 'text-destructive'}`}><Icon name={positive ? 'arrow_upward' : 'arrow_downward'} className="text-[13px]" />{Math.abs(change)}%</span>}</div><p className="mt-4 font-display text-2xl font-bold">{value}</p><p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</p></Card>
}

function FunnelStage({ label, value, base, icon }: { label: string; value: number; base: number; icon: string }) {
  const rate = base ? Math.round(value * 100 / base) : 0
  return <div className="relative overflow-hidden rounded-xl border border-border bg-surface-high/20 p-4"><div className="absolute inset-x-0 bottom-0 h-1 bg-surface-high"><div className="h-full bg-primary" style={{ width: `${rate}%` }} /></div><div className="flex items-center justify-between"><Icon name={icon} className="text-[20px] text-primary" /><span className="text-xs font-bold text-cyan">{rate}%</span></div><p className="mt-4 text-2xl font-bold">{value}</p><p className="text-xs text-text-muted">{label}</p></div>
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return <div><p className="font-display text-lg font-bold">{value}</p><p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p></div>
}
