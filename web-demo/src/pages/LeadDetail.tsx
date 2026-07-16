import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { LANGUAGE_NAMES, analyzeCall, fetchLead, formatDateTime, formatDuration, pushCallToArthaleads } from '../lib/api'
import type { CallRecord } from '../lib/types'

const SENTIMENT_STYLE: Record<string, string> = {
  positive: 'text-success',
  neutral: 'text-text-muted',
  negative: 'text-destructive',
}

export function LeadDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [call, setCall] = useState<CallRecord | null | undefined>(undefined)
  const [notes, setNotes] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<{ ok: boolean; detail: string } | null>(null)

  useEffect(() => {
    if (!id) return
    fetchLead(id).then((result) => setCall(result ?? null))
  }, [id])

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
      setPushResult({ ok: false, detail: 'Push failed — please try again.' })
    } finally {
      setPushing(false)
    }
  }

  if (call === undefined) {
    return (
      <DashboardLayout>
        <div className="p-6 text-sm text-text-muted">Loading call…</div>
      </DashboardLayout>
    )
  }

  if (call === null) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <button
            onClick={() => navigate('/dashboard/calls')}
            className="mb-2 flex items-center gap-1 text-xs text-text-muted hover:text-text"
          >
            <Icon name="chevron_left" className="text-[16px]" /> Back
          </button>
          <p className="text-sm text-text-muted">Call not found.</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="flex items-center gap-3 border-b border-border px-4 pt-4 sm:px-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text"
        >
          <Icon name="chevron_left" className="text-[16px]" /> Back
        </button>
      </div>
      <PageHeader title={call.name} subtitle={call.phone || 'no phone captured'} />

      <section className="grid grid-cols-1 gap-4 p-4 sm:p-6 lg:grid-cols-3">
        <Card className="flex flex-col gap-3 lg:col-span-2">
          <h2 className="text-sm font-semibold text-text-muted">Call transcript</h2>
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

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-text-muted">Call details</h2>
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="Status" value={call.status} />
              <Row label="Outcome" value={call.callStatus} />
              <Row label="Sentiment" value={call.sentiment} />
              <Row label="Channel" value={call.channel} />
              {call.website && <Row label="Website" value={call.website} />}
              <Row label="Agent" value={call.agent} />
              <Row label="Duration" value={formatDuration(call.durationSeconds)} />
              <Row label="Language" value={call.replyLanguage ? (LANGUAGE_NAMES[call.replyLanguage] ?? call.replyLanguage) : '—'} />
              <Row label="Time" value={formatDateTime(call.callDate)} />
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-text-muted">Extracted lead</h2>
            <dl className="flex flex-col gap-2 text-sm">
              {call.email && <Row label="Email" value={call.email} />}
              {call.company || call.useCase || call.teamSize ? (
                <>
                  <Row label="Company" value={call.company || '—'} />
                  <Row label="Use case" value={call.useCase || '—'} />
                  <Row label="Team size" value={call.teamSize || '—'} />
                </>
              ) : (
                <>
                  <Row label="Budget" value={call.budget || '—'} />
                  <Row label="Location" value={call.location || '—'} />
                  <Row label="Timeline" value={call.timeline || '—'} />
                </>
              )}
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
    </DashboardLayout>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right font-medium capitalize">{value}</dd>
    </div>
  )
}
