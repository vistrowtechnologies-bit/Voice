import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { DataTable } from '../components/ui/DataTable'
import type { DataTableColumn } from '../components/ui/DataTable'
import { StatTile } from '../components/ui/StatTile'
import {
  callsExportUrl,
  fetchActiveCalls,
  fetchCallRecordingUrl,
  fetchCalls,
  formatDateTime,
  formatDuration,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import type { ActiveCallInfo, CallRecord, Sentiment } from '../lib/types'

// Must match the exact channel labels calls_db.py's _CHANNEL_LABELS produces
// ("Web" for dashboard browser calls/demo, "Website Widget" for embedded
// widget calls, "Phone" for real EnableX calls) - these tabs used to say
// "Inbound"/"Outbound", which never matched any real call.channel value and
// silently showed zero results forever, and had no tab for widget calls at
// all (only visible under "All").
const CHANNELS = ['All', 'Web', 'Website Widget', 'Phone']
const PAGE_SIZE = 25

const SENTIMENT_STYLES: Record<Sentiment, string> = {
  positive: 'bg-cyan/20 text-cyan border-cyan/30',
  neutral: 'bg-muted/20 text-text-muted border-muted/30',
  negative: 'bg-destructive/20 text-destructive border-destructive/30',
}

// Placeholder names the backend fills in for a caller who gave no real
// identity (server/token_api.py's widget token route uses "Website visitor"
// for a widget call with no name asked/given; the agent side uses "Unknown
// caller"). Neither is a real identity, so neither should group unrelated
// callers together - confirmed live: every anonymous widget visitor shares
// the literal string "Website visitor", so before this fix all 74 of a
// site's distinct anonymous visitors collapsed into one grouped row instead
// of showing as 74 separate calls.
const GENERIC_CALLER_NAMES = new Set(['unknown caller', 'website visitor'])

// Same caller identity used to group repeat calls into one row: phone first
// (normalized - digits only, then trimmed to the last 10 digits, so
// "+918080197945" and "8080197945" collapse to the same key even though one
// carries the country code and the other doesn't - which real numbers do
// depending on where they were captured from, e.g. a caller-ID number vs an
// older/other source. A plain digits-only key without this trim looked
// right but still split one real caller into two grouped rows.), then
// email, then name. A call with none of those (an anonymous/generic name)
// gets a unique per-call key instead of grouping with every other
// unidentified caller, which would wrongly merge unrelated people.
function identityKey(c: CallRecord): string {
  const digits = c.phone.replace(/\D/g, '')
  const phone = digits.length > 10 ? digits.slice(-10) : digits
  if (phone) return `phone:${phone}`
  if (c.email) return `email:${c.email.toLowerCase()}`
  const name = c.name?.trim().toLowerCase()
  if (name && !GENERIC_CALLER_NAMES.has(name)) return `name:${name}`
  return `call:${c.id}`
}

type GroupedCall = CallRecord & { callCount: number }

function groupByCaller(rows: CallRecord[]): GroupedCall[] {
  const groups = new Map<string, CallRecord[]>()
  for (const c of rows) {
    const key = identityKey(c)
    const arr = groups.get(key)
    if (arr) arr.push(c)
    else groups.set(key, [c])
  }
  return Array.from(groups.values()).map((group) => {
    // The most recent call represents the group regardless of the table's
    // current sort direction - its own detail page's History tab (see
    // LeadDetail.tsx) is where every other call in the group is reachable.
    const [latest] = [...group].sort((a, b) => b.callDate.localeCompare(a.callDate))
    return { ...latest, callCount: group.length }
  })
}

export function CallsHistory() {
  // Stashed into each row link's state so opening a call overlays it on
  // this list instead of navigating away from it (see App.tsx).
  const location = useLocation()
  // Visitor feedback comes from OUR marketing-site widget prompt, so the
  // column and its filter are owner-only (see LeadDetail for the reasoning).
  const { user } = useAuth()
  const isOwner = Boolean(user?.isPlatformOwner)
  const [searchParams, setSearchParams] = useSearchParams()
  const [calls, setCalls] = useState<CallRecord[]>([])
  const [activeCalls, setActiveCalls] = useState<ActiveCallInfo[]>([])
  const [channel, setChannel] = useState('All')
  const [search, setSearch] = useState('')
  const [sortDesc, setSortDesc] = useState(true)
  const [feedbackFilter, setFeedbackFilter] = useState(searchParams.get('feedback') || 'all')
  const [directionFilter, setDirectionFilter] = useState(searchParams.get('direction') || 'all')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [headerRefreshSignal, setHeaderRefreshSignal] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const recordingRequestRef = useRef<string | null>(null)
  const [recordingCallId, setRecordingCallId] = useState<string | null>(null)
  const [recordingState, setRecordingState] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'error'>('idle')

  useEffect(() => {
    fetchCalls().then(setCalls).catch(() => setCalls([])).finally(() => setLoading(false))
    fetchActiveCalls().then(setActiveCalls).catch(() => setActiveCalls([]))
  }, [])

  useEffect(
    () => () => {
      recordingRequestRef.current = null
      audioRef.current?.pause()
    },
    [],
  )

  const refreshCalls = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await Promise.all([
        fetchCalls().then(setCalls).catch(() => setCalls([])),
        fetchActiveCalls().then(setActiveCalls).catch(() => setActiveCalls([])),
      ])
      setHeaderRefreshSignal((signal) => signal + 1)
    } finally {
      setRefreshing(false)
    }
  }

  const toggleRecording = async (callId: string) => {
    const audio = audioRef.current
    if (!audio) return

    if (recordingCallId === callId && audio.src) {
      if (audio.paused) {
        try {
          await audio.play()
        } catch {
          setRecordingState('error')
        }
      } else {
        audio.pause()
      }
      return
    }

    const requestId = `${callId}:${Date.now()}`
    recordingRequestRef.current = requestId
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    setRecordingCallId(callId)
    setRecordingState('loading')

    try {
      const { url } = await fetchCallRecordingUrl(callId)
      if (recordingRequestRef.current !== requestId) return
      audio.src = url
      await audio.play()
    } catch {
      if (recordingRequestRef.current === requestId) setRecordingState('error')
    }
  }

  const filtered = useMemo(() => {
    let rows = calls
    if (channel !== 'All') rows = rows.filter((c) => c.channel === channel)
    if (feedbackFilter !== 'all') rows = rows.filter((c) => c.feedback === feedbackFilter)
    if (directionFilter !== 'all') rows = rows.filter((c) => c.direction === directionFilter)
    if (search) {
      const s = search.toLowerCase()
      rows = rows.filter((c) => c.name.toLowerCase().includes(s) || c.phone.includes(s))
    }
    const grouped = groupByCaller(rows)
    return grouped.sort((a, b) =>
      sortDesc ? b.callDate.localeCompare(a.callDate) : a.callDate.localeCompare(b.callDate),
    )
  }, [calls, channel, feedbackFilter, directionFilter, search, sortDesc])

  useEffect(() => setPage(1), [channel, feedbackFilter, directionFilter, search, sortDesc])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const visibleRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const completed = calls.filter((c) => c.callStatus === 'completed').length
  const failed = calls.filter((c) => c.callStatus === 'failed').length

  const columns: DataTableColumn<GroupedCall>[] = [
    {
      key: 'caller',
      header: 'Caller',
      primary: true,
      cellClassName: 'relative min-w-[180px] !p-0',
      // state.backgroundLocation makes App.tsx keep THIS list rendered and
      // overlay the call as a modal (see App.tsx). Still a real <Link>, so
      // middle-click / open-in-new-tab still gets the standalone full page.
      render: (call) => (
        <Link
          to={`/dashboard/calls/${call.id}`}
          state={{ backgroundLocation: location }}
          className="group -mx-4 flex min-h-[68px] w-[calc(100%+2rem)] items-center gap-2 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary md:absolute md:inset-0 md:m-0 md:min-h-0 md:w-auto md:px-5"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
            {call.initials}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold group-hover:text-cyan">{call.name}</p>
              {call.callCount > 1 && (
                <span className="shrink-0 rounded-full bg-surface-high px-1.5 py-0.5 text-[10px] font-semibold text-text-muted">
                  {call.callCount} calls
                </span>
              )}
            </div>
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
    {
      key: 'channel',
      header: 'Channel',
      render: (call) => (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-text-muted">{call.channel}</span>
          {call.isDashboardTest && (
            <span
              className="w-fit rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted"
              title="You placed this call yourself from the dashboard's Test Call button. It is not billed."
            >
              Dashboard test
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'direction',
      header: 'Direction',
      // null for web/widget calls (direction is a phone-only concept) and
      // for phone calls recorded before this field existed.
      render: (call) =>
        call.direction ? (
          <span className="flex items-center gap-1 text-sm text-text-muted">
            <Icon name={call.direction === 'inbound' ? 'call_received' : 'call_made'} className="text-[15px]" />
            {call.direction === 'inbound' ? 'Inbound' : 'Outbound'}
          </span>
        ) : (
          <span className="text-sm text-text-muted">-</span>
        ),
    },
    { key: 'website', header: 'Website', render: (call) => <span className="text-sm text-text-muted">{call.website || '-'}</span> },
    { key: 'duration', header: 'Duration', render: (call) => <span className="text-sm">{formatDuration(call.durationSeconds)}</span> },
    // Owner-only - the thumbs prompt is in our public marketing widget, so
    // this rates US, not the tenant's own call handling.
    ...(isOwner
      ? [
          {
            key: 'feedback',
            header: 'Feedback',
            render: (call: GroupedCall) => (
              <span className="text-sm">
                {call.feedback === 'helpful' ? '👍' : call.feedback === 'not_helpful' ? '👎' : '—'}
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'recording',
      header: 'Recording',
      render: (call) =>
        call.hasRecording ? (
          <button
            type="button"
            onClick={() => void toggleRecording(call.id)}
            aria-label={`${recordingCallId === call.id && recordingState === 'playing' ? 'Pause' : 'Play'} recording for ${call.name}`}
            title={
              recordingCallId === call.id && recordingState === 'error'
                ? 'Recording could not be loaded. Click to retry.'
                : recordingCallId === call.id && recordingState === 'playing'
                  ? 'Pause recording'
                  : 'Play recording'
            }
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              recordingCallId === call.id && recordingState === 'error'
                ? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20'
                : recordingCallId === call.id && recordingState === 'playing'
                  ? 'border-primary bg-primary text-bg shadow-sm hover:-translate-y-0.5 hover:shadow-md'
                  : 'border-cyan/30 bg-cyan/10 text-cyan hover:-translate-y-0.5 hover:border-cyan/60 hover:bg-cyan/20 hover:shadow-sm'
            }`}
          >
            <Icon
              name={
                recordingCallId === call.id && recordingState === 'loading'
                  ? 'progress_activity'
                  : recordingCallId === call.id && recordingState === 'playing'
                    ? 'pause'
                    : recordingCallId === call.id && recordingState === 'error'
                      ? 'error'
                      : 'play_arrow'
              }
              className={`text-[19px] ${recordingCallId === call.id && recordingState === 'loading' ? 'animate-spin' : ''}`}
            />
          </button>
        ) : (
          <span className="text-sm text-text-muted">-</span>
        ),
    },
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
      ? 'No phone calls yet - phone calling needs a connected number (see Phone Numbers).'
      : channel === 'Website Widget'
        ? 'No widget calls yet - embed the call button on a client site (see Website Widget).'
        : 'No calls found. Every call the agent takes is logged here automatically.'

  return (
    <DashboardLayout>
      <PageHeader
        title="All Calls History"
        subtitle={`${calls.length} calls total`}
        refreshSignal={headerRefreshSignal}
      >
        <button
          type="button"
          onClick={refreshCalls}
          disabled={refreshing}
          aria-label={refreshing ? 'Refreshing call history' : 'Refresh call history'}
          title={refreshing ? 'Refreshing call history' : 'Refresh call history'}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-muted transition-colors hover:border-primary hover:text-text disabled:cursor-wait disabled:opacity-60"
        >
          <Icon name="refresh" className={`text-[18px] ${refreshing ? 'animate-spin' : ''}`} />
        </button>
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
        <audio
          ref={audioRef}
          className="hidden"
          preload="none"
          onPlay={() => setRecordingState('playing')}
          onPause={() => setRecordingState((state) => (state === 'playing' ? 'paused' : state))}
          onEnded={() => setRecordingState('paused')}
          onError={() => setRecordingState('error')}
        />
        <span className="sr-only" aria-live="polite">
          {recordingCallId && recordingState === 'loading' ? 'Loading recording' : ''}
          {recordingCallId && recordingState === 'playing' ? 'Recording playing' : ''}
          {recordingCallId && recordingState === 'paused' ? 'Recording paused' : ''}
          {recordingCallId && recordingState === 'error' ? 'Recording could not be loaded' : ''}
        </span>
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
          {/* Owner-only, same reason as the Feedback column above. */}
          {isOwner && (
            <select
              value={feedbackFilter}
              aria-label="Filter by feedback"
              onChange={(e) => {
                const value = e.target.value
                setFeedbackFilter(value)
                setSearchParams((current) => {
                  const next = new URLSearchParams(current)
                  if (value === 'all') next.delete('feedback')
                  else next.set('feedback', value)
                  return next
                })
              }}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-text-muted outline-none focus:border-primary"
            >
              <option value="all">All feedback</option>
              <option value="helpful">👍 Helpful</option>
              <option value="not_helpful">👎 Needs review</option>
            </select>
          )}
          <select
            value={directionFilter}
            aria-label="Filter by direction"
            onChange={(e) => {
              const value = e.target.value
              setDirectionFilter(value)
              setSearchParams((current) => {
                const next = new URLSearchParams(current)
                if (value === 'all') next.delete('direction')
                else next.set('direction', value)
                return next
              })
            }}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-text-muted outline-none focus:border-primary"
          >
            <option value="all">All directions</option>
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
          </select>
          <button
            onClick={() => setSortDesc((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-text-muted hover:border-primary"
          >
            <Icon name="swap_vert" className="text-[16px]" />
            {sortDesc ? 'Newest first' : 'Oldest first'}
          </button>
        </div>

        {loading ? (
          <DataTable
            columns={columns}
            rows={[]}
            rowKey={(call) => call.id}
            emptyMessage={emptyMessage}
            loading
          />
        ) : (
          <DataTable
            columns={columns}
            rows={visibleRows}
            rowKey={(call) => call.id}
            emptyMessage={emptyMessage}
            hoverRows={false}
            footer={
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {filtered.length === 0 ? 'No callers' : `Showing ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filtered.length)} of ${filtered.length} callers`} · {calls.length} calls total
                </span>
                {pageCount > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      disabled={safePage === 1}
                      className="rounded-md border border-border px-2.5 py-1 font-semibold text-text disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="tabular-nums">Page {safePage} of {pageCount}</span>
                    <button
                      type="button"
                      onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                      disabled={safePage === pageCount}
                      className="rounded-md border border-border px-2.5 py-1 font-semibold text-text disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            }
          />
        )}
      </section>
    </DashboardLayout>
  )
}
