import { formatTime12h } from '../../lib/api'
import type { Appointment, AppointmentStatus } from '../../lib/types'

const STATUS_CHIP: Record<AppointmentStatus, string> = {
  confirmed: 'bg-cyan/20 text-cyan border-cyan/30',
  cancelled: 'bg-destructive/20 text-destructive border-destructive/30',
  rescheduled: 'bg-amber/20 text-amber border-amber/30',
  completed: 'bg-primary/20 text-primary border-primary/30',
  no_show: 'bg-muted/20 text-text-muted border-muted/30',
}

const MAX_VISIBLE = 3

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Fixed 6x7 grid covering the visible month plus lead/trail days from
 * adjacent months, each cell showing up to MAX_VISIBLE colored appointment
 * chips (sorted by time) plus a "+N more" overflow button. Pure
 * presentational — Appointments.tsx owns all data fetching/state. */
export function CalendarGrid({
  month,
  appointments,
  onDayClick,
  onChipClick,
  onOverflowClick,
}: {
  month: Date
  appointments: Appointment[]
  onDayClick: (date: string) => void
  onChipClick: (appt: Appointment) => void
  onOverflowClick: (date: string, hidden: Appointment[]) => void
}) {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const firstOfMonth = new Date(year, monthIndex, 1)
  const startOffset = firstOfMonth.getDay() // 0=Sun
  const gridStart = new Date(year, monthIndex, 1 - startOffset)
  const todayStr = toDateStr(new Date())

  const byDate = new Map<string, Appointment[]>()
  for (const appt of appointments) {
    const list = byDate.get(appt.date) ?? []
    list.push(appt)
    byDate.set(appt.date, list)
  }
  for (const list of byDate.values()) list.sort((a, b) => a.time.localeCompare(b.time))

  const cells: Date[] = []
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i))
  }

  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
        <div key={d} className="bg-surface-high px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-widest text-text-muted">
          {d}
        </div>
      ))}
      {cells.map((date) => {
        const dateStr = toDateStr(date)
        const inMonth = date.getMonth() === monthIndex
        const dayAppts = byDate.get(dateStr) ?? []
        const visible = dayAppts.slice(0, MAX_VISIBLE)
        const hidden = dayAppts.slice(MAX_VISIBLE)
        return (
          <div
            key={dateStr}
            onClick={() => onDayClick(dateStr)}
            className={`flex min-h-[92px] cursor-pointer flex-col gap-1 bg-surface p-1.5 transition-colors hover:bg-surface-high/40 ${
              inMonth ? '' : 'opacity-40'
            }`}
          >
            <span
              className={`self-end text-xs font-semibold ${
                dateStr === todayStr ? 'flex h-5 w-5 items-center justify-center rounded-full bg-primary text-bg' : 'text-text-muted'
              }`}
            >
              {date.getDate()}
            </span>
            <div className="flex flex-col gap-0.5">
              {visible.map((appt) => (
                <button
                  key={appt.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    onChipClick(appt)
                  }}
                  className={`truncate rounded border px-1.5 py-0.5 text-left text-[11px] font-semibold ${STATUS_CHIP[appt.status]}`}
                >
                  {formatTime12h(appt.time)} {appt.name}
                </button>
              ))}
              {hidden.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onOverflowClick(dateStr, hidden)
                  }}
                  className="text-left text-[11px] font-semibold text-text-muted hover:text-primary"
                >
                  +{hidden.length} more
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
