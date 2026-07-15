import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { DataTable } from '../components/ui/DataTable'
import type { DataTableColumn } from '../components/ui/DataTable'
import { StatTile } from '../components/ui/StatTile'
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

  const columns: DataTableColumn<CallRecord>[] = [
    {
      key: 'caller',
      header: 'Caller',
      primary: true,
      render: (call) => (
        <Link to={`/dashboard/calls/${call.id}`} className="group flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
            {call.initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold group-hover:text-cyan">{call.name}</p>
            {call.phone && <p className="text-[11px] text-text-muted">{call.phone}</p>}
          </div>
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (call) => (
        <span
          className={`whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-semibold capitalize ${
            call.callStatus === 'completed'
              ? 'bg-cyan/20 text-cyan border-cyan/30'
              : 'bg-destructive/20 text-destructive border-destructive/30'
          }`}
        >
          {call.callStatus}
        </span>
      ),
    },
    { key: 'channel', header: 'Channel', render: (call) => <span className="text-sm text-text-muted">{call.channel}</span> },
    { key: 'website', header: 'Website', render: (call) => <span className="text-sm text-text-muted">{call.website || '—'}</span> },
    { key: 'duration', header: 'Duration', render: (call) => <span className="text-sm">{formatDuration(call.durationSeconds)}</span> },
    {
      key: 'sentiment',
      header: 'Sentiment',
      render: (call) => (
        <span className={`whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-semibold capitalize ${SENTIMENT_STYLES[call.sentiment]}`}>
          {call.sentiment}
        </span>
      ),
    },
    { key: 'agent', header: 'Agent', render: (call) => <span className="text-sm text-text-muted">{call.agent}</span> },
    { key: 'time', header: 'Time', render: (call) => <span className="text-sm text-text-muted">{formatDateTime(call.callDate)}</span> },
  ]

  const emptyMessage =
    channel === 'Phone'
      ? 'No phone calls yet — phone calling needs a connected number (see Phone Numbers).'
      : channel === 'Website Widget'
        ? 'No widget calls yet — embed the call button on a client site (see Website Widget).'
        : 'No calls found. Every call the agent takes is logged here automatically.'

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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile compact label="Total Calls" value={String(calls.length)} icon="call" tone="muted" />
          <StatTile compact label="Completed" value={String(completed)} icon="check_circle" tone="cyan" />
          <StatTile compact label="Failed / Dropped" value={String(failed)} icon="cancel" tone="destructive" />
          <StatTile compact label="In Progress" value={String(activeCalls.length)} icon="sensors" pulse={activeCalls.length > 0} tone="primary" />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1 rounded-lg border border-border p-0.5">
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

        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(call) => call.id}
          emptyMessage={emptyMessage}
          footer={`Showing ${filtered.length} of ${calls.length} calls`}
        />
      </section>
    </DashboardLayout>
  )
}
