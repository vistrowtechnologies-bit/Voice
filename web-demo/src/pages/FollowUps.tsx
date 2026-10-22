import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { InfoTip } from '../components/ui/Tooltip'
import { ScheduleFollowUpModal } from '../components/ScheduleFollowUpModal'
import { fetchFollowUps, followUpCallNow, followUpCancel, followUpReschedule, onCopilotChange } from '../lib/api'
import { hasRole, useAuth } from '../lib/auth'
import type { FollowUp, FollowUpList } from '../lib/types'
import { formatWhen } from '../lib/followUps'

// Every follow-up call the AI scheduled (owner, 22 Oct 2026: a follow-up rang
// at 11:00 with nothing on the dashboard beforehand). A follow-up is created
// after a call when the caller asked to be called back, booked a visit, or
// showed interest; the agent's follow-up settings decide when.

type View = 'upcoming' | 'done' | 'cancelled'

const VIEWS: { key: View; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'done', label: 'Done' },
  { key: 'cancelled', label: 'Cancelled' },
]

const KIND_STYLE: Record<string, { icon: string; tone: string }> = {
  callback: { icon: 'phone_callback', tone: 'bg-primary/10 text-primary' },
  visit_reminder: { icon: 'event_available', tone: 'bg-cyan/10 text-cyan' },
  nurture: { icon: 'event_repeat', tone: 'bg-magenta/10 text-magenta' },
}

/** "in 2 h", "in 15 min", "5 min ago". */
function relative(iso: string | null): string {
  if (!iso) return ''
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60_000)
  const abs = Math.abs(mins)
  const span = abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} d`
  return mins >= 0 ? `in ${span}` : `${span} ago`
}

/** A datetime-local value ("2026-10-22T11:00") for a Date, in local time. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function outcomeText(f: FollowUp): string {
  if (f.status === 'done') return 'Connected'
  if (f.status === 'blocked') return f.outcome || 'Blocked'
  const text = (f.outcome || f.status).replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function FollowUpRow({ f, canAct, onChanged }: { f: FollowUp; canAct: boolean; onChanged: (f: FollowUp) => void }) {
  const [busy, setBusy] = useState<'call' | 'cancel' | 'move' | null>(null)
  const [error, setError] = useState('')
  const [moving, setMoving] = useState(false)
  const [moveTo, setMoveTo] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const style = KIND_STYLE[f.kind] ?? { icon: 'call', tone: 'bg-surface-high text-text-muted' }
  const overdue = f.state === 'upcoming' && f.status === 'pending' && !!f.dueAt && new Date(f.dueAt).getTime() < Date.now() - 15 * 60_000
  const calling = f.status === 'calling'

  const run = async (kind: 'call' | 'cancel' | 'move', action: () => Promise<FollowUp>) => {
    setBusy(kind)
    setError('')
    try {
      onChanged(await action())
      setMoving(false)
      setConfirmCancel(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <li className="bento-tile flex flex-col gap-3 sm:flex-row sm:items-center" style={{ padding: '1rem 1.25rem' }}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.tone}`}>
          <Icon name={style.icon} className="text-[20px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-semibold text-text">{f.name}</span>
            {f.phone && f.phone !== f.name && <span className="text-xs text-text-muted">{f.phone}</span>}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {f.label}
            {f.agentName && <> · {f.agentName}</>}
            {f.sourceCallId != null && (
              <> · <Link to={`/dashboard/calls/${f.sourceCallId}`} className="bg-transparent font-semibold text-primary hover:underline">from call #{f.sourceCallId}</Link></>
            )}
          </p>
          {f.summary && <p className="mt-1 line-clamp-2 text-xs text-text-muted/90">{f.summary}</p>}
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
        {f.state === 'upcoming' ? (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {calling ? (
              <span className="flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-bold text-success">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> Calling now
              </span>
            ) : (
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${overdue ? 'bg-amber/12 text-amber' : 'bg-surface-high text-text'}`}>
                {formatWhen(f.dueAt)} <span className="font-medium text-text-muted">· {overdue ? 'not called yet' : relative(f.dueAt)}</span>
              </span>
            )}
            {f.status !== 'pending' && !calling && (
              <span className="rounded-full bg-surface-high px-2.5 py-1 text-[11px] font-semibold text-text-muted">Retry after {outcomeText(f).toLowerCase()}</span>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${f.state === 'cancelled' ? 'bg-surface-high text-text-muted' : f.status === 'done' ? 'bg-success/10 text-success' : 'bg-amber/12 text-amber'}`}>
              {f.state === 'cancelled' ? (f.outcome.startsWith('Skipped') ? f.outcome : 'Cancelled') : outcomeText(f)}
            </span>
            {f.lastAttemptAt && <span className="text-xs text-text-muted">{formatWhen(f.lastAttemptAt)}</span>}
            {f.callId != null && (
              <Link to={`/dashboard/calls/${f.callId}`} className="flex items-center gap-1 bg-transparent text-xs font-semibold text-primary hover:underline">
                Follow-up call #{f.callId} <Icon name="arrow_forward" className="text-[14px]" />
              </Link>
            )}
          </div>
        )}
        {f.state === 'upcoming' && f.campaignPaused && (
          <p className="text-[11px] font-semibold text-amber">The follow-up campaign is paused, so this will not ring until it is resumed.</p>
        )}

        {f.state === 'upcoming' && canAct && !calling && (
          <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
            {moving ? (
              <>
                <input
                  type="datetime-local"
                  value={moveTo}
                  min={toLocalInput(new Date())}
                  onChange={(e) => setMoveTo(e.target.value)}
                  aria-label={`New time for ${f.name}`}
                  className="h-8 rounded-lg border border-border bg-surface px-2 text-xs outline-none focus:border-primary"
                />
                <button type="button" disabled={!moveTo || busy !== null} onClick={() => run('move', () => followUpReschedule(f.id, new Date(moveTo).toISOString()))} className="h-8 rounded-lg bg-primary px-3 text-xs font-bold text-white disabled:opacity-50">
                  {busy === 'move' ? 'Saving…' : 'Save'}
                </button>
                <button type="button" onClick={() => setMoving(false)} className="h-8 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-text">Cancel</button>
              </>
            ) : confirmCancel ? (
              <>
                <span className="text-xs font-semibold text-text">Cancel this follow-up?</span>
                <button type="button" disabled={busy !== null} onClick={() => run('cancel', () => followUpCancel(f.id))} className="h-8 rounded-lg bg-destructive px-3 text-xs font-bold text-white disabled:opacity-50">
                  {busy === 'cancel' ? 'Cancelling…' : 'Yes, cancel'}
                </button>
                <button type="button" onClick={() => setConfirmCancel(false)} className="h-8 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-text">Keep it</button>
              </>
            ) : (
              <>
                <button type="button" disabled={busy !== null} onClick={() => run('call', () => followUpCallNow(f.id))} className="flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-bold text-white disabled:opacity-50">
                  <Icon name="call" className="text-[15px]" /> {busy === 'call' ? 'Queuing…' : 'Call now'}
                </button>
                <button
                  type="button"
                  onClick={() => { setMoveTo(toLocalInput(f.dueAt ? new Date(Math.max(new Date(f.dueAt).getTime(), Date.now() + 60 * 60_000)) : new Date(Date.now() + 60 * 60_000))); setMoving(true) }}
                  className="flex h-8 items-center gap-1 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-text hover:border-primary"
                >
                  <Icon name="schedule" className="text-[15px]" /> Reschedule
                </button>
                <button type="button" onClick={() => setConfirmCancel(true)} className="flex h-8 items-center gap-1 rounded-lg bg-transparent px-2 text-xs font-semibold text-text-muted hover:text-destructive">
                  <Icon name="cancel" className="text-[15px]" /> Cancel
                </button>
              </>
            )}
          </div>
        )}
        {error && <p role="alert" className="text-xs font-semibold text-destructive">{error}</p>}
      </div>
    </li>
  )
}

export function FollowUps() {
  const { user } = useAuth()
  const canAct = hasRole(user, 'member')
  const [view, setView] = useState<View>('upcoming')
  const [data, setData] = useState<FollowUpList | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [notice, setNotice] = useState('')
  const request = useRef(0)

  const load = useCallback(() => {
    const id = ++request.current
    fetchFollowUps(view)
      .then((d) => { if (id === request.current) { setData(d); setLoadError(false) } })
      .catch(() => { if (id === request.current) setLoadError(true) })
  }, [view])

  useEffect(() => {
    setData(null)
    load()
    // A follow-up rings on its own: keep the list current while it is open.
    const timer = window.setInterval(load, 30_000)
    return () => window.clearInterval(timer)
  }, [load])
  useEffect(() => onCopilotChange(load), [load])

  const replace = (f: FollowUp) => {
    setData((d) => {
      if (!d) return d
      // An item that left this view (cancelled) drops out; counts refresh on the next load.
      const items = d.items.map((i) => (i.id === f.id ? f : i)).filter((i) => i.state === view)
      return { ...d, items }
    })
    load()
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Follow-ups"
        subtitle="Calls the AI will make back to people"
        lead={
          <p className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className="hidden sm:inline">Scheduled after calls by each agent's follow-up settings</span>
            <InfoTip label="How follow-ups are scheduled" side="bottom">
              After a call, the agent schedules a follow-up when the caller asked to be called back, booked a visit
              (a reminder before it), or showed interest. The time comes from the agent's follow-up settings. The AI
              places the call on its own; you can call now, move it, or cancel it here.
            </InfoTip>
          </p>
        }
      >
        {canAct && (
          <button type="button" onClick={() => { setNotice(''); setScheduling(true) }} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90">
            <Icon name="add" className="text-[18px]" /> Schedule follow-up
          </button>
        )}
      </PageHeader>

      {scheduling && (
        <ScheduleFollowUpModal
          onClose={() => setScheduling(false)}
          onScheduled={(item, replaced) => {
            setScheduling(false)
            setNotice(`${replaced ? 'Moved the follow-up already waiting for' : 'Scheduled a follow-up for'} ${item.name} · ${formatWhen(item.dueAt)}`)
            if (view === 'upcoming') load()
            else setView('upcoming')
          }}
        />
      )}

      <section className="flex flex-col gap-4 p-4 sm:p-6">
        {notice && (
          <p role="status" className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-3 py-2 text-sm font-semibold text-success">
            <Icon name="check_circle" className="text-[18px]" /> {notice}
          </p>
        )}
        <div role="tablist" aria-label="Follow-up status" className="flex w-fit gap-1 rounded-full bg-surface p-1 ring-1 ring-border">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              onClick={() => setView(v.key)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold ${view === v.key ? 'bg-primary text-white' : 'bg-transparent text-text-muted hover:text-text'}`}
            >
              {v.label}
              {data && <span className={view === v.key ? 'text-white/80' : 'text-text-muted/70'}>{data.counts[v.key]}</span>}
            </button>
          ))}
        </div>

        {loadError && !data ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Could not load follow-ups. Check your connection and refresh.</p>
        ) : !data ? (
          <ul className="flex flex-col gap-3" aria-hidden="true">
            {[0, 1, 2].map((i) => <li key={i} className="bento-tile h-20 animate-pulse" />)}
          </ul>
        ) : data.items.length === 0 ? (
          <div className="bento-tile flex flex-col items-center gap-2 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon name="event_repeat" className="text-[24px]" /></span>
            <p className="font-semibold">{view === 'upcoming' ? 'No follow-ups waiting' : view === 'done' ? 'No follow-up calls made yet' : 'Nothing cancelled'}</p>
            <p className="max-w-sm text-xs text-text-muted">
              {view === 'upcoming'
                ? 'When a caller asks to be called back, books a visit, or shows interest, the follow-up the AI schedules appears here.'
                : 'Follow-up calls show here once the AI has placed them.'}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.items.map((f) => <FollowUpRow key={f.id} f={f} canAct={canAct} onChanged={replace} />)}
          </ul>
        )}
      </section>
    </DashboardLayout>
  )
}
