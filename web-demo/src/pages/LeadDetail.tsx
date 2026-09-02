import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { StatTile } from '../components/ui/StatTile'
import {
  LANGUAGE_NAMES,
  analyzeCall,
  fetchCallRecordingUrl,
  fetchCalls,
  fetchIntegrations,
  fetchLead,
  formatDateTime,
  formatDuration,
  pushCallToArthaleads,
} from '../lib/api'
import type { CallRecord } from '../lib/types'

const SENTIMENT_STYLE: Record<string, string> = {
  positive: 'text-success',
  neutral: 'text-text-muted',
  negative: 'text-destructive',
}

// LiveKit's CloseReason, translated into what an operator should actually
// conclude. Wording is taken from where each reason is emitted in the SDK,
// not guessed: USER_INITIATED comes from the agent side calling aclose()
// (an end-call tool or a silence rule), NOT from the caller hanging up -
// that is PARTICIPANT_DISCONNECTED.
const DISCONNECT_REASONS: Record<string, { label: string; help: string; bad?: boolean }> = {
  participant_disconnected: {
    label: 'Caller hung up',
    help: 'The caller ended the call or closed the tab. Normal ending.',
  },
  user_initiated: {
    label: 'Agent ended the call',
    help: "The agent closed the call from its side - the end-call tool, or one of this agent's hang-up rules such as end-after-silence.",
  },
  task_completed: {
    label: 'Task completed',
    help: 'The agent finished what it was handling and closed the session itself.',
  },
  job_shutdown: {
    label: 'Worker shut down',
    help: 'The agent worker stopped mid-call, usually a deploy or scale-down. Not caused by anything in the conversation.',
    bad: true,
  },
  error: {
    label: 'Ended by an error',
    help: 'An unrecoverable speech or AI provider error ended the call, after its fallback chain was already exhausted.',
    bad: true,
  },
}

// extractedData keys are operator-authored snake_case ("plot_configuration")
// - turn that into a readable label the same way the fixed fields above do.
function titleCase(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// Client-side .txt export of the full conversation, both sides combined in
// original chronological order, labeled by speaker for readability.
function downloadTranscript(call: CallRecord): void {
  const lines = call.transcript ?? []
  const body = lines.length
    ? lines.map((line) => `${line.speaker === 'agent' ? 'Agent' : 'Customer'}: ${line.text}`).join('\n\n')
    : '(No transcript recorded for this call.)'
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${call.name.replace(/[^\w-]+/g, '_')}-call-${call.id}-transcript.txt`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Renders in two modes from ONE implementation, rather than a page and a
 * near-duplicate modal that drift apart:
 *  - page  (default): full route at /dashboard/calls/:id. What a deep link,
 *    a bookmark, or a hard refresh lands on.
 *  - modal (onClose passed): overlaid on the calls list, which stays mounted
 *    behind it. This is the flow being matched from Agni - open a call in
 *    context, close, keep your place in the list.
 * The URL changes in BOTH modes (see App.tsx's backgroundLocation routing),
 * so the modal is still linkable and Back still closes it - a plain overlay
 * would have thrown that away. */
export function LeadDetail({ callId, onClose }: { callId?: string; onClose?: () => void } = {}) {
  const params = useParams<{ id: string }>()
  const id = callId ?? params.id
  const isModal = Boolean(onClose)
  const navigate = useNavigate()
  const [call, setCall] = useState<CallRecord | null | undefined>(undefined)
  const [notes, setNotes] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<{ ok: boolean; detail: string } | null>(null)
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null)
  const [recordingError, setRecordingError] = useState<string | null>(null)
  const [arthaleadsConnected, setArthaleadsConnected] = useState(false)
  const [tab, setTab] = useState<'details' | 'history'>('details')
  const [history, setHistory] = useState<CallRecord[] | null>(null)
  const [historySearch, setHistorySearch] = useState('')

  useEffect(() => {
    if (!id) return
    setTab('details')
    setHistorySearch('')
    fetchLead(id).then((result) => setCall(result ?? null))
  }, [id])

  // Every past call from this same phone number, so a repeat caller shows up
  // as one lead's history instead of looking like a fresh, unrelated lead
  // each time - search already matches on phone (see calls_db.list_calls).
  useEffect(() => {
    setHistory(null)
    if (!call?.phone) return
    fetchCalls({ search: call.phone })
      .then((calls) => setHistory(calls.filter((c) => c.id !== call.id)))
      .catch(() => setHistory([]))
  }, [call?.phone, call?.id])

  const filteredHistory = useMemo(() => {
    if (!history) return []
    const s = historySearch.trim().toLowerCase()
    if (!s) return history
    return history.filter(
      (c) => c.name.toLowerCase().includes(s) || c.agent.toLowerCase().includes(s) || formatDateTime(c.callDate).toLowerCase().includes(s),
    )
  }, [history, historySearch])

  useEffect(() => {
    fetchIntegrations()
      .then((integrations) => setArthaleadsConnected(integrations.some((i) => i.key === 'arthaleads' && i.status === 'connected')))
      .catch(() => setArthaleadsConnected(false))
  }, [])

  useEffect(() => {
    if (!id || !call?.hasRecording) return
    setRecordingError(null)
    fetchCallRecordingUrl(id)
      .then((r) => setRecordingUrl(r.url))
      .catch(() => setRecordingError('Could not load the recording.'))
  }, [id, call?.hasRecording])

  const runAnalysis = async () => {
    if (!id) return
    setAnalyzing(true)
    setAnalyzeError(null)
    try {
      const intel = await analyzeCall(id)
      setCall((c) => (c ? { ...c, intelligence: intel } : c))
    } catch {
      setAnalyzeError('Could not analyze this call. Make sure it has a transcript.')
    } finally {
      setAnalyzing(false)
    }
  }

  const handlePush = async () => {
    if (!id) return
    setPushing(true)
    setPushResult(null)
    try {
      const result = await pushCallToArthaleads(id)
      setPushResult(result)
      setCall((c) =>
        c
          ? {
              ...c,
              arthaleadsStatus: result.ok ? 'sent' : 'failed',
              arthaleadsSyncedAt: new Date().toISOString(),
              arthaleadsError: result.ok ? null : result.detail,
            }
          : c,
      )
    } catch {
      setPushResult({ ok: false, detail: 'Push failed - please try again.' })
    } finally {
      setPushing(false)
    }
  }

  // One wrapper for both modes so every early return below (loading, not
  // found, loaded) renders correctly in a modal as well as a page.
  const Shell = ({ children }: { children: React.ReactNode }) =>
    isModal ? <ModalShell onClose={onClose!}>{children}</ModalShell> : <DashboardLayout>{children}</DashboardLayout>

  if (call === undefined) {
    return (
      <Shell>
        <div className="p-6 text-sm text-text-muted">Loading call…</div>
      </Shell>
    )
  }

  if (call === null) {
    return (
      <Shell>
        <div className="p-6">
          {!isModal && (
            <button
              onClick={() => navigate('/dashboard/calls')}
              className="mb-2 flex items-center gap-1 text-xs text-text-muted hover:text-text"
            >
              <Icon name="chevron_left" className="text-[16px]" /> Back
            </button>
          )}
          <p className="text-sm text-text-muted">Call not found.</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      {isModal ? (
        // Identity block: who the call was with, its id, and how it ended -
        // the three things you check before reading a transcript.
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon name="call" className="text-[20px]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{call.name}</p>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(call.id)}
              title="Copy call ID"
              className="flex items-center gap-1.5 font-mono text-[11px] text-text-muted hover:text-primary"
            >
              #{call.id} · {call.phone || 'no phone'}
              <Icon name="content_copy" className="text-[12px]" />
            </button>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
              call.callStatus === 'failed'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-success/10 text-success'
            }`}
          >
            {call.callStatus === 'failed' ? 'Failed' : 'Completed'}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg border border-border p-1.5 text-text-muted hover:text-text"
          >
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 pt-4 sm:px-6">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-text"
            >
              <Icon name="chevron_left" className="text-[16px]" /> Back
            </button>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(call.id)}
              title="Copy call ID"
              className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 font-mono text-[11px] text-text-muted hover:border-primary hover:text-primary"
            >
              Call #{call.id}
              <Icon name="content_copy" className="text-[13px]" />
            </button>
          </div>
          <PageHeader title={call.name} subtitle={call.phone || 'no phone captured'} />
        </>
      )}
      <div className={isModal ? 'min-h-0 flex-1 overflow-y-auto' : ''}>

      <div className="flex gap-1 rounded-lg border border-border p-0.5 self-start mx-4 mt-4 sm:mx-6">
        <button
          onClick={() => setTab('details')}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
            tab === 'details' ? 'bg-primary text-bg' : 'text-text-muted hover:text-text'
          }`}
        >
          Details
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${
            tab === 'history' ? 'bg-primary text-bg' : 'text-text-muted hover:text-text'
          }`}
        >
          {/* "History" read as "should list every call including this one" -
              the count only ever counts the OTHER calls (see the fetchCalls
              effect above), so a lead with exactly 2 calls showed "1" while
              viewing one of them. Renamed rather than changing what's
              counted - the exclusion is correct, the old label just implied
              a different definition than the one being used. */}
          Other calls
          {!!history?.length && (
            <span
              className={`rounded-full px-1.5 text-[10px] ${
                tab === 'history' ? 'bg-bg/20' : 'bg-surface-high text-text-muted'
              }`}
            >
              {history.length}
            </span>
          )}
        </button>
      </div>

      {tab === 'history' ? (
        <section className="flex flex-col gap-3 p-4 sm:p-6">
          {!!history?.length && (
            <div className="relative max-w-sm">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted" />
              <input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search by name, agent, or date…"
                className="w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-3 text-sm outline-none focus:border-primary"
              />
            </div>
          )}
          <Card padding="none">
            {history === null ? (
              <div className="flex justify-center p-8">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : history.length === 0 ? (
              <EmptyState icon="history" text="No other calls from this phone number yet." compact />
            ) : filteredHistory.length === 0 ? (
              <EmptyState icon="search_off" text={`No calls match "${historySearch}".`} compact />
            ) : (
              <div className="divide-y divide-border">
                {filteredHistory.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate(`/dashboard/calls/${c.id}`)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-high"
                  >
                    <div className="min-w-0">
                      {/* The name filled into the pre-call form varies call
                          to call even for the same phone number - show what
                          they actually gave that specific time, not just the
                          agent/channel every row already shares. */}
                      <p className="truncate text-sm font-semibold">
                        {c.name}
                        {c.name !== call.name && (
                          <span className="ml-1.5 rounded bg-amber/10 px-1 py-0.5 text-[10px] font-semibold text-amber">
                            different name
                          </span>
                        )}
                      </p>
                      <p className="truncate text-[11px] text-text-muted">
                        {c.agent} · <span className="capitalize">{c.channel}</span> · {formatDateTime(c.callDate)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs capitalize text-text-muted">{c.sentiment}</span>
                      <span className="text-sm text-text-muted">{formatDuration(c.durationSeconds)}</span>
                      <Icon name="chevron_right" className="text-[16px] text-text-muted" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </section>
      ) : (
      <>
      {/* At-a-glance strip - the outcome/duration/credits/sentiment an
          operator scans for first, pulled out of the long Call details list
          below rather than duplicated there. */}
      <section className="grid grid-cols-2 gap-3 px-4 pt-4 sm:grid-cols-4 sm:px-6">
        <StatTile
          label="Call outcome"
          value={call.callStatus === 'failed' ? 'Failed' : 'Completed'}
          icon={call.callStatus === 'failed' ? 'error' : 'check_circle'}
          tone={call.callStatus === 'failed' ? 'destructive' : 'success'}
          compact
        />
        <StatTile label="Duration" value={formatDuration(call.durationSeconds)} icon="schedule" tone="cyan" compact />
        <StatTile
          label="Credits used"
          value={call.creditsUsed != null ? String(call.creditsUsed) : '—'}
          icon="toll"
          tone="primary"
          compact
        />
        <StatTile
          label="Sentiment"
          value={call.sentiment.charAt(0).toUpperCase() + call.sentiment.slice(1)}
          icon="mood"
          tone={call.sentiment === 'negative' ? 'destructive' : call.sentiment === 'positive' ? 'success' : 'muted'}
          compact
        />
      </section>
      <section className="grid grid-cols-1 gap-4 p-4 sm:p-6 lg:grid-cols-3">
        <Card className="flex flex-col gap-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-muted">Call transcript</h2>
            {!!call.transcript?.length && (
              <button
                type="button"
                onClick={() => downloadTranscript(call)}
                className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-text-muted transition-colors hover:border-primary hover:text-primary"
              >
                <Icon name="download" className="text-[14px]" /> Download transcript
              </button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {(call.transcript ?? []).map((line, i) => (
              <div
                key={i}
                className={`flex max-w-[85%] flex-col gap-0.5 rounded-lg px-3 py-2 text-sm ${
                  line.speaker === 'visitor'
                    ? 'self-end bg-primary text-bg'
                    : 'self-start border border-border bg-surface-high text-text'
                }`}
              >
                <span className={`text-[10px] font-bold uppercase tracking-wider ${line.speaker === 'visitor' ? 'text-bg/70' : 'text-text-muted'}`}>
                  {line.speaker === 'visitor' ? 'Caller' : call.agent}
                </span>
                <span>{line.text}</span>
              </div>
            ))}
            {!call.transcript?.length && <EmptyState icon="forum" text="No transcript recorded for this call." compact />}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-muted">Conversation intelligence</h2>
              {call.transcript?.length ? (
                <button
                  onClick={runAnalysis}
                  disabled={analyzing}
                  className="flex items-center gap-1 rounded-lg border border-cyan/40 px-2.5 py-1 text-xs font-bold text-cyan hover:bg-cyan/10 disabled:opacity-50"
                >
                  <Icon name="auto_awesome" className="text-[14px]" />
                  {analyzing ? 'Analyzing…' : call.intelligence ? 'Re-analyze' : 'Analyze'}
                </button>
              ) : null}
            </div>
            {analyzeError && <p className="mb-2 text-xs text-destructive">{analyzeError}</p>}
            {call.intelligence ? (
              <div className="flex flex-col gap-3 text-sm">
                <p className="leading-relaxed text-text">{call.intelligence.summary}</p>
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full bg-surface-high px-2.5 py-1 text-xs font-semibold capitalize ${SENTIMENT_STYLE[call.intelligence.sentiment] || ''}`}>
                    {call.intelligence.sentiment}
                  </span>
                  <span className="rounded-full bg-surface-high px-2.5 py-1 text-xs font-semibold capitalize text-text">
                    {call.intelligence.outcome.replace(/_/g, ' ')}
                  </span>
                  <span className="rounded-full bg-surface-high px-2.5 py-1 text-xs font-semibold text-primary">
                    QA {call.intelligence.qa_score}/100
                  </span>
                </div>
                {call.intelligence.disqualification_reason && (
                  <p className="text-xs text-text-muted">
                    <span className="font-semibold text-amber">Not qualified:</span> {call.intelligence.disqualification_reason}
                  </p>
                )}
                {call.intelligence.key_points.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold text-text-muted">Key points</p>
                    <ul className="flex flex-col gap-1">
                      {call.intelligence.key_points.map((p, i) => (
                        <li key={i} className="flex gap-1.5 text-xs text-text">
                          <Icon name="chevron_right" className="text-[14px] text-cyan" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {call.intelligence.action_items.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold text-text-muted">Next steps</p>
                    <ul className="flex flex-col gap-1">
                      {call.intelligence.action_items.map((p, i) => (
                        <li key={i} className="flex gap-1.5 text-xs text-text">
                          <Icon name="task_alt" className="text-[14px] text-primary" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-text-muted">
                {call.transcript?.length
                  ? 'Run AI analysis to get a summary, sentiment, outcome, QA score, and next steps for this call.'
                  : 'No transcript to analyze.'}
              </p>
            )}
          </Card>

          {arthaleadsConnected && (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-muted">CRM status</h2>
              {call.arthaleadsStatus === 'sent' ? (
                <span className="flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                  <Icon name="check_circle" className="text-[14px]" /> Sent
                </span>
              ) : call.arthaleadsStatus === 'failed' ? (
                <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                  <Icon name="error" className="text-[14px]" /> Failed
                </span>
              ) : (
                <span className="rounded-full bg-surface-high px-2.5 py-1 text-xs font-semibold text-text-muted">Not sent</span>
              )}
            </div>
            <dl className="flex flex-col gap-2 text-sm">
              <Row
                label="ArthaLeads CRM"
                value={
                  call.arthaleadsStatus === 'sent'
                    ? 'Delivered'
                    : call.arthaleadsStatus === 'failed'
                      ? 'Delivery failed'
                      : 'Not sent yet'
                }
              />
              {call.arthaleadsSyncedAt && <Row label="Last attempt" value={formatDateTime(call.arthaleadsSyncedAt)} />}
            </dl>
            {call.arthaleadsStatus === 'failed' && call.arthaleadsError && (
              <p className="mt-2 text-xs text-destructive">{call.arthaleadsError}</p>
            )}
            {pushResult && (
              <p className={`mt-2 text-xs font-semibold ${pushResult.ok ? 'text-success' : 'text-destructive'}`}>
                {pushResult.ok ? 'Sent to ArthaLeads ✓' : pushResult.detail}
              </p>
            )}
            <button
              onClick={handlePush}
              disabled={pushing}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-cyan/40 py-2 text-xs font-bold text-cyan hover:bg-cyan/10 disabled:opacity-50"
            >
              <Icon name="send" className="text-[14px]" />
              {pushing ? 'Sending…' : call.arthaleadsStatus === 'sent' ? 'Re-send to ArthaLeads' : 'Push to ArthaLeads'}
            </button>
          </Card>
          )}

          {call.hasRecording && (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-muted">Recording</h2>
                {recordingUrl && (
                  // A plain same-origin link, not a fetch+blob - the session
                  // cookie rides along automatically (see api.ts's
                  // credentials:'include' note) and the browser handles the
                  // download from the Content-Disposition header the server
                  // sends back, already renamed and transcoded to MP3
                  // server-side (see /calls/{id}/recording/download).
                  <a
                    href={`/api/calls/${call.id}/recording/download`}
                    className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-text-muted transition-colors hover:border-primary hover:text-primary"
                  >
                    <Icon name="download" className="text-[14px]" /> Download MP3
                  </a>
                )}
              </div>
              {recordingUrl ? (
                <audio controls src={recordingUrl} className="w-full" />
              ) : recordingError ? (
                <p className="text-xs text-destructive">{recordingError}</p>
              ) : (
                <p className="text-xs text-text-muted">Loading recording…</p>
              )}
            </Card>
          )}

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-text-muted">Call details</h2>

            {/* Dense bordered boxes for the facts an operator scans for
                first - Agent/tiers were plain text rows before, which read
                as a long list rather than the boxed, at-a-glance layout
                being matched here. Free-text facts (website, page, feedback
                notes) don't fit a fixed-width box and stay as rows below. */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <MiniStat icon="flag" label="Lead stage" value={call.status} />
              <MiniStat icon="call_split" label="Channel" value={call.channel} />
              <MiniStat icon="support_agent" label="Agent" value={call.agent} />
              {call.voiceTier && <MiniStat icon="graphic_eq" label="Voice tier" value={call.voiceTier} />}
              {call.modelTier && <MiniStat icon="memory" label="Model tier" value={call.modelTier.replace('_', ' ')} />}
              <MiniStat
                icon="translate"
                label="Language"
                value={call.replyLanguage ? (LANGUAGE_NAMES[call.replyLanguage] ?? call.replyLanguage) : '-'}
              />
            </div>

            <dl className="mt-3 flex flex-col gap-2 text-sm">
              {call.website && <Row label="Website" value={call.website} />}
              {call.pagePath && <Row label="Page" value={call.pagePath} raw />}
              {call.feedback && (
                <Row label="Visitor feedback" value={call.feedback === 'helpful' ? '👍 Helpful' : '👎 Not helpful'} />
              )}
              {call.feedbackComment && <Row label="Feedback note" value={call.feedbackComment} />}
              {call.connectLatencyMs != null && <Row label="Connection" value={`${(call.connectLatencyMs / 1000).toFixed(1)}s`} />}
              {call.agentJoinLatencyMs != null && <Row label="Agent joined" value={`${(call.agentJoinLatencyMs / 1000).toFixed(1)}s`} />}
              {call.firstResponseLatencyMs != null && <Row label="First response" value={`${(call.firstResponseLatencyMs / 1000).toFixed(1)}s`} />}
              {call.failureReason && <Row label="Failure reason" value={call.failureReason} />}
              {call.creditsUsed != null && (
                <Row
                  label="Credits breakdown"
                  value={`${call.creditsUsed}${call.creditsPerMinute != null ? ` (${call.creditsPerMinute}/min)` : ''}`}
                />
              )}
              <Row label="Created" value={formatDateTime(call.callDate)} />
            </dl>

            {/* Why the call ended. Unlike "Failure reason" above (browser
                -reported, widget calls only) this is recorded for every
                channel, so a phone call finally has an end-of-call answer. */}
            {call.disconnectReason && (
              <div className="mt-4 border-t border-border pt-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-text-muted">How it ended</dt>
                  <dd
                    className={`text-right font-medium ${
                      DISCONNECT_REASONS[call.disconnectReason]?.bad ? 'text-destructive' : ''
                    }`}
                  >
                    {DISCONNECT_REASONS[call.disconnectReason]?.label ?? call.disconnectReason}
                  </dd>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
                  {DISCONNECT_REASONS[call.disconnectReason]?.help ??
                    'Reported by the call runtime; no description available for this reason yet.'}
                </p>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-text-muted">Extracted lead</h2>
            <dl className="flex flex-col gap-2 text-sm">
              {call.email && <Row label="Email" value={call.email} />}
              {call.company || call.useCase || call.teamSize ? (
                <>
                  <Row label="Company" value={call.company || '-'} />
                  <Row label="Use case" value={call.useCase || '-'} />
                  <Row label="Team size" value={call.teamSize || '-'} />
                </>
              ) : (
                <>
                  <Row label="Budget" value={call.budget || '-'} />
                  <Row label="Location" value={call.location || '-'} />
                  <Row label="Timeline" value={call.timeline || '-'} />
                </>
              )}
              {/* Whatever this agent's own Post-call fields config
                  (Agents → edit → Post-call fields) asked the LLM to pull
                  from the transcript - the generic per-business version of
                  the fixed fields above, e.g. a real-estate agent's "plot
                  size interest" or a clinic's "preferred doctor". */}
              {Object.entries(call.extractedData ?? {}).map(([key, value]) => (
                <Row key={key} label={titleCase(key)} value={String(value) || '-'} />
              ))}
            </dl>
            {call.siteVisit && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
                <Icon name="event_available" className="text-[16px]" />
                Site visit · {call.siteVisit.date} at {call.siteVisit.time}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-semibold text-text-muted">Notes</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add a note about this lead… (local only for now)"
              className="h-24 w-full resize-none rounded-lg border border-border bg-surface-high p-2 text-sm outline-none focus:border-primary"
            />
          </Card>
        </div>
      </section>
      </>
      )}
      </div>
    </Shell>
  )
}

/** Overlay chrome for the modal mode. Closes on Escape and on backdrop
 * click; the calls list stays mounted underneath, which is the whole point
 * of opening a call this way rather than navigating away from it. */
function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Call details"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-bg shadow-2xl"
      >
        {children}
      </div>
    </div>
  )
}

// Small bordered fact box - the reference's dense AGENT/MODEL/CHANNEL
// treatment, structurally: an icon, an uppercase label, a value. Reserved
// for short, fixed-width facts; longer/free-text ones (a URL, a feedback
// note) stay as plain Row lines below since they'd wrap awkwardly in a box
// this narrow.
function MiniStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2">
      <Icon name={icon} className="shrink-0 text-[16px] text-text-muted" />
      <div className="min-w-0">
        <p className="truncate text-[10px] font-bold uppercase tracking-wide text-text-muted">{label}</p>
        <p className="truncate text-xs font-semibold capitalize text-text">{value}</p>
      </div>
    </div>
  )
}

function Row({ label, value, raw = false }: { label: string; value: string; raw?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-text-muted">{label}</dt>
      {/* `raw` keeps machine identifiers verbatim - the default `capitalize`
          would render "gpt-4.1-mini" as "Gpt-4.1-mini", which is not the
          model you would search for in a provider dashboard. */}
      <dd className={`min-w-0 break-words text-right font-medium ${raw ? 'font-mono text-xs' : 'capitalize'}`}>
        {value}
      </dd>
    </div>
  )
}
