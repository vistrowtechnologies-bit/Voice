import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { StatTile } from '../components/ui/StatTile'
import { addContactNote, deleteContactNote, fetchContactDetail, formatDateTime, formatDuration } from '../lib/api'
import type { ContactDetail as ContactDetailType } from '../lib/types'

const TABS = ['Activity', 'Calls', 'Campaigns', 'Notes'] as const
type Tab = (typeof TABS)[number]

type ActivityItem = { at: string; kind: 'call' | 'note'; label: string }

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-muted/20 text-text-muted border-muted/30',
  qualified: 'bg-cyan/20 text-cyan border-cyan/30',
  site_visit: 'bg-primary/20 text-primary border-primary/30',
  customer: 'bg-amber/20 text-amber border-amber/30',
}

function pct(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 100)
}

export function ContactDetail() {
  const { id } = useParams<{ id: string }>()
  const [contact, setContact] = useState<ContactDetailType | null | undefined>(undefined)
  const [tab, setTab] = useState<Tab>('Activity')
  const [noteBody, setNoteBody] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const reload = () => {
    if (!id) return
    fetchContactDetail(Number(id))
      .then(setContact)
      .catch(() => setContact(null))
  }

  useEffect(reload, [id])

  if (contact === undefined) {
    return (
      <DashboardLayout>
        <PageHeader title="Contact" />
        <div className="flex justify-center p-10">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    )
  }

  if (contact === null) {
    return (
      <DashboardLayout>
        <PageHeader title="Contact not found" />
        <div className="p-6">
          <EmptyState text="This contact doesn't exist, or was deleted." />
          <Link to="/dashboard/contacts" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
            ← Back to Contacts
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  const handleAddNote = async () => {
    const body = noteBody.trim()
    if (!body) return
    setSavingNote(true)
    try {
      await addContactNote(contact.id, body)
      setNoteBody('')
      reload()
    } finally {
      setSavingNote(false)
    }
  }

  const activity: ActivityItem[] = [
    { at: contact.createdAt, kind: 'note' as const, label: 'Contact created' },
    ...contact.calls.map((c) => ({
      at: c.startedAt,
      kind: 'call' as const,
      label: c.durationSeconds > 0 ? `${c.callType} call — ${formatDuration(c.durationSeconds)}` : `${c.callType} call — no answer`,
    })),
    ...contact.notes.map((n) => ({ at: n.createdAt, kind: 'note' as const, label: `Note: ${n.body}` })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  const latestCall = contact.calls[0]
  const latestActivity = activity[0]
  const s = contact.callStats
  const successRate = pct(s.completed, s.total)

  return (
    <DashboardLayout>
      <PageHeader title={contact.name} subtitle={contact.company || contact.phone} />

      <section className="flex flex-col gap-4 p-4 sm:p-6">
        <Link to="/dashboard/contacts" className="flex w-fit items-center gap-1 text-xs font-semibold text-text-muted hover:text-text">
          <Icon name="arrow_back" className="text-[16px]" />
          Back to Contacts
        </Link>

        {/* Header — avatar, name, status, contact chips */}
        <Card padding="sm" className="flex flex-wrap items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/20 text-lg font-bold text-primary">
            {contact.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">{contact.name}</h2>
              <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLES[contact.status] ?? STATUS_STYLES.new}`}>
                {contact.status.replace('_', ' ')}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-sm text-text-muted">
              {contact.phone && (
                <span className="flex items-center gap-1">
                  <Icon name="call" className="text-[15px]" />
                  {contact.phone}
                </span>
              )}
              {contact.email && (
                <span className="flex items-center gap-1">
                  <Icon name="mail" className="text-[15px]" />
                  {contact.email}
                </span>
              )}
            </div>
          </div>
        </Card>

        {/* Stat strip */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Total calls" value={String(s.total)} />
          <StatTile label="Completed" value={String(s.completed)} tone="success" />
          <StatTile label="No answer" value={String(s.noAnswer)} tone="amber" />
          <StatTile label="Failed" value={String(s.failed)} tone="destructive" />
          <StatTile label="Avg duration" value={formatDuration(s.avgDurationSeconds)} />
          <StatTile label="Total time" value={formatDuration(s.totalDurationSeconds)} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Contact snapshot */}
          <Card padding="sm" className="flex flex-col gap-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Contact snapshot</p>
            <div className="grid grid-cols-2 gap-2">
              <SnapshotBox label="Contact ID" value={String(contact.id)} />
              <SnapshotBox label="Organization" value={contact.company || '—'} />
              <SnapshotBox label="Created" value={formatDateTime(contact.createdAt)} />
              <SnapshotBox label="Updated" value={formatDateTime(contact.updatedAt)} />
              <SnapshotBox label="Last called" value={contact.lastCalledAt ? formatDateTime(contact.lastCalledAt) : 'Never'} />
              <SnapshotBox
                label="Custom variables"
                value={
                  Object.keys(contact.customFields).length === 0
                    ? '—'
                    : Object.entries(contact.customFields).map(([k, v]) => `${k}: ${v}`).join(', ')
                }
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {contact.tags.length === 0 ? (
                <span className="text-xs text-text-muted">No tags</span>
              ) : (
                contact.tags.map((t) => (
                  <span key={t} className="rounded bg-surface-high px-1.5 py-0.5 text-[11px] text-text-muted">
                    {t}
                  </span>
                ))
              )}
            </div>
          </Card>

          {/* Engagement summary */}
          <Card padding="sm" className="flex flex-col gap-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Engagement summary</p>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-success/40 text-sm font-bold text-success">
                {successRate}%
              </div>
              <div className="flex-1 space-y-2">
                <OutcomeBar label="Completed" n={s.completed} total={s.total} tone="bg-success" />
                <OutcomeBar label="No answer" n={s.noAnswer} total={s.total} tone="bg-amber" />
                <OutcomeBar label="Failed" n={s.failed} total={s.total} tone="bg-destructive" />
              </div>
            </div>
          </Card>

          {/* Campaign footprint */}
          <Card padding="sm" className="flex flex-col gap-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Campaign footprint</p>
            {contact.campaigns.length === 0 ? (
              <p className="text-sm text-text-muted">Not in any campaign</p>
            ) : (
              <div className="divide-y divide-border">
                {contact.campaigns.map((m) => (
                  <div key={m.campaignId} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="font-medium">{m.campaignName}</span>
                    <span className="capitalize text-text-muted">{m.outcome || m.contactStatus}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Latest call + latest activity */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card padding="sm" className="flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Latest call</p>
              {latestCall ? (
                <div className="text-sm">
                  <p className="font-semibold capitalize">{latestCall.callType} call</p>
                  <p className="text-text-muted">{formatDateTime(latestCall.startedAt)}</p>
                  <p className="text-text-muted">
                    {latestCall.durationSeconds > 0 ? formatDuration(latestCall.durationSeconds) : 'No answer'}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-text-muted">No calls recorded yet</p>
              )}
            </Card>
            <Card padding="sm" className="flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Latest activity</p>
              {latestActivity ? (
                <div className="text-sm">
                  <p className="font-semibold">{latestActivity.label}</p>
                  <p className="text-text-muted">{formatDateTime(latestActivity.at)}</p>
                </div>
              ) : (
                <p className="text-sm text-text-muted">No activity yet</p>
              )}
            </Card>
          </div>
        </div>

        <div className="flex gap-1 rounded-lg border border-border p-0.5 self-start">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                tab === t ? 'bg-primary text-bg' : 'text-text-muted hover:text-text'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <Card padding="none">
          {tab === 'Activity' &&
            (activity.length === 0 ? (
              <EmptyState text="No activity yet." compact />
            ) : (
              <div className="divide-y divide-border">
                {activity.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <Icon
                      name={item.kind === 'call' ? 'call' : 'sticky_note_2'}
                      className={`text-[18px] ${item.kind === 'call' ? 'text-cyan' : 'text-amber'}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{item.label}</p>
                      <p className="text-[11px] text-text-muted">{formatDateTime(item.at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {tab === 'Calls' &&
            (contact.calls.length === 0 ? (
              <EmptyState text="No calls with this contact yet." compact />
            ) : (
              <div className="divide-y divide-border">
                {contact.calls.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold capitalize">{c.callType} call</p>
                      <p className="text-[11px] text-text-muted">{formatDateTime(c.startedAt)}</p>
                    </div>
                    <span className="text-sm text-text-muted">
                      {c.durationSeconds > 0 ? formatDuration(c.durationSeconds) : 'No answer'}
                    </span>
                  </div>
                ))}
              </div>
            ))}

          {tab === 'Campaigns' &&
            (contact.campaigns.length === 0 ? (
              <EmptyState text="This contact isn't part of any campaign yet." compact />
            ) : (
              <div className="divide-y divide-border">
                {contact.campaigns.map((m) => (
                  <div key={m.campaignId} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold">{m.campaignName}</p>
                      <p className="text-[11px] capitalize text-text-muted">
                        Campaign {m.campaignStatus} · {m.attempts} attempt{m.attempts === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span className="text-sm capitalize text-text-muted">{m.outcome || m.contactStatus}</span>
                  </div>
                ))}
              </div>
            ))}

          {tab === 'Notes' && (
            <div className="flex flex-col gap-3 p-4">
              <div className="flex gap-2">
                <input
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                  placeholder="Leave a note about this contact…"
                  className="flex-1 rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <button
                  onClick={handleAddNote}
                  disabled={savingNote || !noteBody.trim()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              {contact.notes.length === 0 ? (
                <EmptyState text="No notes yet." compact />
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {contact.notes.map((n) => (
                    <div key={n.id} className="flex items-start justify-between gap-3 px-3 py-2">
                      <div>
                        <p className="text-sm">{n.body}</p>
                        <p className="text-[11px] text-text-muted">
                          {n.createdBy || 'Unknown'} · {formatDateTime(n.createdAt)}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteContactNote(contact.id, n.id).then(reload)}
                        aria-label="Delete note"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-surface-high text-destructive hover:bg-destructive hover:text-bg"
                      >
                        <Icon name="delete" className="text-[15px]" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      </section>
    </DashboardLayout>
  )
}

function SnapshotBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-high p-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{label}</p>
      <p className="truncate text-sm font-medium" title={value}>
        {value}
      </p>
    </div>
  )
}

function OutcomeBar({ label, n, total, tone }: { label: string; n: number; total: number; tone: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-muted">{label}</span>
        <span className="tabular-nums text-text-muted">
          {n} ({pct(n, total)}%)
        </span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-high">
        <div className={`h-full ${tone}`} style={{ width: `${pct(n, total)}%` }} />
      </div>
    </div>
  )
}
