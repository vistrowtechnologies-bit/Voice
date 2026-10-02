import { Link } from 'react-router-dom'
import { Icon } from '../Icon'
import { formatTime12h } from '../../lib/api'
import { STATUS_META, hhmm, minutesOf, parseDateStr } from '../../lib/calendar'
import type { Appointment, AppointmentStatus } from '../../lib/types'

/** Everything about one appointment, with the actions that change it. Used in Day view's side
 *  panel and in the dialog opened from Month and Week view. */
export function AppointmentDetails({
  appt,
  busy,
  onStatus,
  onReschedule,
  onClose,
}: {
  appt: Appointment
  busy: boolean
  onStatus: (id: number, status: AppointmentStatus) => void
  onReschedule: (a: Appointment) => void
  onClose?: () => void
}) {
  const meta = STATUS_META[appt.status]
  const end = hhmm(minutesOf(appt.time) + (appt.durationMinutes || 30))
  const open = appt.status === 'confirmed' || appt.status === 'rescheduled'
  const row = 'flex items-start gap-2.5 text-sm'
  const ico = 'mt-0.5 shrink-0 text-[18px] text-text-muted'
  const action = 'flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-base font-bold">{appt.name || appt.phone || 'Appointment'}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${meta.pill}`}>{meta.label}</span>
            <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold text-text-muted">
              <Icon name={appt.source === 'agent' ? 'smart_toy' : 'person'} className="!text-[13px]" />
              {appt.source === 'agent' ? 'Booked by the agent' : 'Added by your team'}
            </span>
          </div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-text-muted hover:bg-surface-high hover:text-text">
            <Icon name="close" className="text-[20px]" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <div className={row}>
          <Icon name="calendar_today" className={ico} />
          <span>{parseDateStr(appt.date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
        <div className={row}>
          <Icon name="schedule" className={ico} />
          <span>{formatTime12h(appt.time)} – {formatTime12h(end)} <span className="text-text-muted">({appt.durationMinutes || 30} min)</span></span>
        </div>
        {appt.phone && (
          <div className={row}>
            <Icon name="call" className={ico} />
            <a href={`tel:${appt.phone}`} className="font-medium text-primary hover:underline">{appt.phone}</a>
          </div>
        )}
        {appt.email && (
          <div className={row}>
            <Icon name="mail" className={ico} />
            <a href={`mailto:${appt.email}`} className="break-all font-medium text-primary hover:underline">{appt.email}</a>
          </div>
        )}
        {appt.purpose && (
          <div className={row}>
            <Icon name="flag" className={ico} />
            <span className="break-words">{appt.purpose}</span>
          </div>
        )}
        {appt.callId && (
          <div className={row}>
            <Icon name="history" className={ico} />
            <Link to={`/dashboard/calls/${appt.callId}`} className="font-medium text-primary hover:underline">View the call that booked it</Link>
          </div>
        )}
      </div>

      {appt.notes && (
        <div>
          <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-text-muted">Notes</h4>
          <p className="whitespace-pre-wrap break-words text-sm text-text-muted">{appt.notes}</p>
        </div>
      )}

      {open && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={() => onStatus(appt.id, 'completed')} className={`${action} border-success/40 bg-success/10 text-success hover:bg-success/20`}>
            <Icon name="check" className="text-[16px]" /> Mark completed
          </button>
          <button type="button" disabled={busy} onClick={() => onStatus(appt.id, 'no_show')} className={`${action} border-border bg-surface text-text hover:bg-surface-high`}>
            <Icon name="person_off" className="text-[16px]" /> No-show
          </button>
          <button type="button" disabled={busy} onClick={() => onReschedule(appt)} className={`${action} border-border bg-surface text-text hover:bg-surface-high`}>
            <Icon name="event_repeat" className="text-[16px]" /> Reschedule
          </button>
          <button type="button" disabled={busy} onClick={() => onStatus(appt.id, 'cancelled')} className={`${action} border-destructive/40 bg-surface text-destructive hover:bg-destructive/10`}>
            <Icon name="event_busy" className="text-[16px]" /> Cancel
          </button>
        </div>
      )}
    </div>
  )
}
