import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { callsExportUrl, fetchActiveCalls, fetchCalls, formatDateTime, formatDuration } from '../lib/api'
import type { ActiveCallInfo, CallRecord, Sentiment } from '../lib/types'

// Must match the exact channel labels calls_db.py's _CHANNEL_LABELS produces
// ("Web" for dashboard browser calls/demo, "Website Widget" for embedded
// widget calls, "Phone" for real EnableX calls) — these tabs used to say
// "Inbound"/"Outbound", which never matched any real call.channel value and
// silently showed zero results forever, and had no tab for widget calls at
// all (only visible under "All").
const CHANNELS = ['All', 'Web', 'Website Widget', 'Phone']

const SENTIMENT_STYLES: Record<Sentiment, string> = {
  positive: 'bg-cyan/20 text-cyan border-cyan/30',
  neutral: 'bg-muted/20 text-text-muted border-muted/30',
  negative: 'bg-destructive/20 text-destructive border-destructive/30',
}

export function CallsHistory() {
  const [calls, setCalls] = useState<CallRecord[]>([])
  const [activeCalls, setActiveCalls] = useState<ActiveCallInfo[]>([])
  const [channel, setChannel] = useState('All')
  const [search, setSearch] = useState('')
  const [sortDesc, setSortDesc] = useState(true)

  useEffect(() => {
    fetchCalls().then(setCalls).catch(() => setCalls([]))
    fetchActiveCalls().then(setActiveCalls).catch(() => setActiveCalls([]))
  }, [])

  const filtered = useMemo(() => {
    let rows = calls
    if (channel !== 'All') rows = rows.filter((c) => c.channel === channel)
    if (search) {
      const s = search.toLowerCase()
      rows = rows.filter((c) => c.name.toLowerCase().includes(s) || c.phone.includes(s))
    }
    return [...rows].sort((a, b) =>
      sortDesc ? b.callDate.localeCompare(a.callDate) : a.callDate.localeCompare(b.callDate),
    )
  }, [calls, channel, search, sortDesc])

  const completed = calls.filter((c) => c.callStatus === 'completed').length
  const failed = calls.filter((c) => c.callStatus === 'failed').length

  return (
    <DashboardLayout>
      <PageHeader title="All Calls History" subtitle={`${calls.length} calls total`}>
        <a
          href={callsExportUrl}
          download
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold hover:border-primary"
        >
          <Icon name="download" className="text-[18px]" />
          Export
        </a>
      </PageHeader>

      <section className="flex flex-col gap-6 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Calls" value={calls.length} icon="call" />
          <StatCard label="Completed" value={completed} icon="check_circle" tone="text-cyan" />
          <StatCard label="Failed / Dropped" value={failed} icon="cancel" tone="text-destructive" />
          <StatCard label="In Progress" value={activeCalls.length} icon="progress_activity" tone="text-primary" pulse={activeCalls.length > 0} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            {CHANNELS.map((c) => (
              <button
                key={c}
                onClick={() => setChannel(c)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  channel === c ? 'bg-primary text-bg' : 'text-text-muted hover:text-text'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="relative min-w-[200px] flex-1">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search calls by name or number..."
              className="w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <button
            onClick={() => setSortDesc((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-text-muted hover:border-primary"
          >
            <Icon name="swap_vert" className="text-[16px]" />
            {sortDesc ? 'Newest first' : 'Oldest first'}
          </button>
        </div>

        <div className="rounded-xl border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-high/30 text-[11px] font-bold uppercase tracking-widest text-text-muted">
                  <th className="py-3 pl-5 pr-3">Caller</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Channel</th>
                  <th className="px-3 py-3">Website</th>
                  <th className="px-3 py-3">Duration</th>
                  <th className="px-3 py-3">Sentiment</th>
                  <th className="px-3 py-3">Agent</th>
                  <th className="px-3 py-3">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-sm text-text-muted">
                      {channel === 'Phone'
                        ? 'No phone calls yet — phone calling needs a connected number (see Phone Numbers).'
                        : channel === 'Website Widget'
                          ? 'No widget calls yet — embed the call button on a client site (see Website Widget).'
                          : 'No calls found. Every call the agent takes is logged here automatically.'}
                    </td>
                  </tr>
                )}
                {filtered.map((call) => (
                  <tr key={call.id} className="group hover:bg-surface-high/20">
                    <td className="py-3 pl-5 pr-3">
                      <Link to={`/dashboard/calls/${call.id}`} className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
                          {call.initials}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold group-hover:text-cyan">{call.name}</p>
                          {call.phone && <p className="text-[11px] text-text-muted">{call.phone}</p>}
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-semibold capitalize ${
                          call.callStatus === 'completed'
                            ? 'bg-cyan/20 text-cyan border-cyan/30'
                            : 'bg-destructive/20 text-destructive border-destructive/30'
                        }`}
                      >
                        {call.callStatus}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-text-muted">{call.channel}</td>
                    <td className="px-3 py-3 text-sm text-text-muted">{call.website || '—'}</td>
                    <td className="px-3 py-3 text-sm">{formatDuration(call.durationSeconds)}</td>
                    <td className="px-3 py-3">
                      <span className={`whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-semibold capitalize ${SENTIMENT_STYLES[call.sentiment]}`}>
                        {call.sentiment}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-text-muted">{call.agent}</td>
                    <td className="px-3 py-3 text-sm text-text-muted">{formatDateTime(call.callDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-5 py-3 text-xs text-text-muted">
            Showing {filtered.length} of {calls.length} calls
          </div>
        </div>
      </section>
    </DashboardLayout>
  )
}

function StatCard({
  label,
  value,
  icon,
  tone = 'text-text',
  pulse,
}: {
  label: string
  value: number
  icon: string
  tone?: string
  pulse?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">{label}</p>
        {pulse ? <span className="pulse-dot h-2 w-2 rounded-full bg-cyan" /> : <Icon name={icon} className={`text-[18px] ${tone}`} />}
      </div>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  )
}
