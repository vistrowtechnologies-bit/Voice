import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { LANGUAGE_NAMES, fetchLead, formatDateTime, formatDuration } from '../lib/api'
import type { CallRecord } from '../lib/types'

export function LeadDetail() {
  const { id } = useParams<{ id: string }>()
  const [call, setCall] = useState<CallRecord | null | undefined>(undefined)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!id) return
    fetchLead(id).then((result) => setCall(result ?? null))
  }, [id])

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
          <p className="text-sm text-text-muted">Call not found.</p>
          <Link to="/dashboard/calls" className="text-sm text-cyan hover:underline">
            Back to calls
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <PageHeader title={call.name} subtitle={call.phone || 'no phone captured'} />

      <section className="grid grid-cols-1 gap-4 p-4 sm:p-6 lg:grid-cols-3">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-muted">Call transcript</h2>
            <Link to="/dashboard/calls" className="text-xs font-bold text-cyan hover:underline">
              ← All calls
            </Link>
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
                <span>{line.text}</span>
              </div>
            ))}
            {!call.transcript?.length && (
              <p className="text-sm text-text-muted">No transcript recorded for this call.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-text-muted">Call details</h2>
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="Status" value={call.status} />
              <Row label="Outcome" value={call.callStatus} />
              <Row label="Sentiment" value={call.sentiment} />
              <Row label="Channel" value={call.channel} />
              <Row label="Agent" value={call.agent} />
              <Row label="Duration" value={formatDuration(call.durationSeconds)} />
              <Row label="Language" value={call.replyLanguage ? (LANGUAGE_NAMES[call.replyLanguage] ?? call.replyLanguage) : '—'} />
              <Row label="Time" value={formatDateTime(call.callDate)} />
            </dl>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-text-muted">Extracted lead</h2>
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="Budget" value={call.budget || '—'} />
              <Row label="Location" value={call.location || '—'} />
              <Row label="Timeline" value={call.timeline || '—'} />
            </dl>
            {call.siteVisit && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
                <Icon name="event_available" className="text-[16px]" />
                Site visit · {call.siteVisit.date} at {call.siteVisit.time}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-2 text-sm font-semibold text-text-muted">Notes</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add a note about this lead… (local only for now)"
              className="h-24 w-full resize-none rounded-lg border border-border bg-surface-high p-2 text-sm outline-none focus:border-primary"
            />
          </div>
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
