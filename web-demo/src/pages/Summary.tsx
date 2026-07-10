import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { BRAND } from '../lib/brand'
import type { LeadSummary, TranscriptEntry } from '../lib/types'

interface SummaryLocationState {
  leadSummary?: LeadSummary
  transcript?: TranscriptEntry[]
}

const ROWS: Array<{ key: keyof LeadSummary; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'company', label: 'Company' },
  { key: 'useCase', label: 'Use case' },
  { key: 'teamSize', label: 'Team size' },
  { key: 'budget', label: 'Budget' },
  { key: 'location', label: 'Location' },
  { key: 'timeline', label: 'Timeline' },
]

// Build a Google Calendar "add event" link for a booked site visit. Parses
// the free-text date/time the agent captured; falls back to an all-day event
// on the given date if the time can't be parsed cleanly.
function calendarUrl(visit: { date: string; time: string }): string {
  const parsed = new Date(`${visit.date} ${visit.time}`)
  const base = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
  const text = encodeURIComponent(`Site visit booked via ${BRAND.name}`)
  const details = encodeURIComponent(`Booked with ${BRAND.defaultAgentName}, your ${BRAND.name} agent.`)
  if (isNaN(parsed.getTime())) {
    return `${base}&text=${text}&details=${details}`
  }
  const start = parsed.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const end = new Date(parsed.getTime() + 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  return `${base}&text=${text}&details=${details}&dates=${start}/${end}`
}

export function Summary() {
  const location = useLocation()
  const state = (location.state as SummaryLocationState | null) ?? {}
  const leadSummary = state.leadSummary ?? {}
  const transcript = state.transcript ?? []
  const [showTranscript, setShowTranscript] = useState(false)

  const hasAnyDetail = ROWS.some((row) => leadSummary[row.key])

  return (
    <div className="min-h-screen bg-bg px-4 py-10 text-text sm:px-6">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center gap-2">
          <Icon name="check_circle" className="text-cyan text-[22px]" />
          <h1 className="text-xl font-semibold">Thanks for chatting with {BRAND.defaultAgentName}!</h1>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          {hasAnyDetail ? (
            <div className="flex flex-col gap-3">
              {ROWS.map(
                (row) =>
                  leadSummary[row.key] && (
                    <div key={row.key} className="flex items-center justify-between text-sm">
                      <span className="text-text-muted">{row.label}</span>
                      <span className="font-medium">{String(leadSummary[row.key])}</span>
                    </div>
                  ),
              )}
            </div>
          ) : (
            <p className="text-sm text-text-muted">
              We didn&apos;t catch enough detail on this call to build a summary yet — but
              {' '}{BRAND.defaultAgentName} is always happy to chat again.
            </p>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-primary/40 p-5">
          {leadSummary.siteVisit ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Site visit confirmed</p>
                <p className="text-sm text-text-muted">
                  {leadSummary.siteVisit.date} at {leadSummary.siteVisit.time}
                </p>
              </div>
              <a
                href={calendarUrl(leadSummary.siteVisit)}
                target="_blank"
                rel="noopener noreferrer"
                className="whitespace-nowrap rounded-full bg-primary px-4 py-2 text-xs font-bold text-bg hover:opacity-90"
              >
                Add to Calendar
              </a>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-text-muted">Want to talk to our team?</p>
              <Link
                to="/contact"
                className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-bg"
              >
                Book a demo
              </Link>
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/demo"
            className="rounded-full border border-border px-5 py-2 text-sm text-text-muted transition-colors hover:border-primary hover:text-text"
          >
            Talk to {BRAND.defaultAgentName} Again
          </Link>
          {transcript.length > 0 && (
            <button
              onClick={() => setShowTranscript((v) => !v)}
              className="text-sm text-cyan hover:underline"
            >
              {showTranscript ? 'Hide' : 'View'} Full Transcript
            </button>
          )}
        </div>

        {showTranscript && (
          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
            {transcript.map((entry) => (
              <div
                key={entry.id}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  entry.isLocal ? 'self-end bg-primary text-bg' : 'self-start bg-surface-high'
                }`}
              >
                {entry.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
