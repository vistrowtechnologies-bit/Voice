import { Icon } from '../Icon'
import { Tooltip } from '../ui/Tooltip'
import { formatTime12h } from '../../lib/api'
import { STATUS_META, groupByDate, monthGrid, sameDay, toDateStr } from '../../lib/calendar'
import type { Appointment } from '../../lib/types'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_CHIPS = 3

/**
 * Month grid, Monday first. Desktop shows up to three chips per day and "N more…"; a phone shows
 * a row of status dots per day instead (a chip is unreadable at that width). Clicking a day, or
 * "N more…", opens that day; clicking a chip opens that appointment.
 */
export function MonthView({
  anchor,
  appointments,
  onOpenDay,
  onSelect,
  onNewOnDate,
}: {
  anchor: Date
  appointments: Appointment[]
  onOpenDay: (d: Date) => void
  onSelect: (a: Appointment) => void
  onNewOnDate: (date: string) => void
}) {
  const days = monthGrid(anchor)
  const by = groupByDate(appointments)
  const today = new Date()

  return (
    <div role="grid" aria-label={anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}>
      <div role="row" className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((d) => (
          <div key={d} role="columnheader" className="py-2.5 text-center text-xs font-semibold text-text-muted">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const ds = toDateStr(d)
          const list = by.get(ds) ?? []
          const inMonth = d.getMonth() === anchor.getMonth()
          const isToday = sameDay(d, today)
          const hidden = list.length - MAX_CHIPS
          return (
            <div
              key={ds}
              role="gridcell"
              aria-label={`${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}, ${list.length} appointment${list.length === 1 ? '' : 's'}`}
              onClick={() => onOpenDay(d)}
              className={`group relative flex min-h-[64px] cursor-pointer flex-col gap-1 border-b border-r border-border p-1 hover:bg-surface-high/60 sm:min-h-[112px] sm:p-2 ${
                i % 7 === 6 ? 'border-r-0' : ''
              } ${i >= 35 ? 'border-b-0' : ''} ${inMonth ? '' : 'bg-bg/40'}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold sm:text-sm ${
                    isToday ? 'bg-primary text-bg' : inMonth ? 'text-text' : 'text-text-muted/60'
                  }`}
                >
                  {d.getDate()}
                </span>
              </div>

              {/* Desktop: chips */}
              <div className="hidden flex-col gap-1 sm:flex">
                {list.slice(0, MAX_CHIPS).map((a) => (
                  <Tooltip key={a.id} content={`${a.name || a.phone || 'Appointment'} · ${formatTime12h(a.time)} · ${STATUS_META[a.status].label}`}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onSelect(a) }}
                      className={`flex w-full items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-left text-xs font-semibold ${STATUS_META[a.status].chip} ${inMonth ? '' : 'opacity-60'} hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
                    >
                      {a.source === 'agent' && <Icon name="smart_toy" className="hidden !text-[12px] shrink-0 lg:inline-block" />}
                      <span className="min-w-0 flex-1 truncate">{a.name || a.phone || 'Appointment'}</span>
                      <span className="hidden shrink-0 font-medium opacity-80 lg:inline">{formatTime12h(a.time)}</span>
                    </button>
                  </Tooltip>
                ))}
                {hidden > 0 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenDay(d) }}
                    className="px-1.5 text-left text-xs font-semibold text-text-muted hover:text-text hover:underline"
                  >
                    {hidden} more…
                  </button>
                )}
              </div>

              {/* Phone: dots */}
              {list.length > 0 && (
                <div className="flex flex-wrap items-center gap-0.5 px-0.5 sm:hidden" aria-hidden="true">
                  {list.slice(0, 4).map((a) => (
                    <span key={a.id} className={`h-1.5 w-1.5 rounded-full ${STATUS_META[a.status].dot}`} />
                  ))}
                  {list.length > 4 && <span className="text-[9px] font-bold text-text-muted">+{list.length - 4}</span>}
                </div>
              )}

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onNewOnDate(ds) }}
                aria-label={`New appointment on ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`}
                className="absolute bottom-1.5 right-1.5 hidden h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface text-text-muted opacity-0 shadow-sm transition-opacity hover:text-text focus-visible:opacity-100 group-hover:opacity-100 sm:flex"
              >
                <Icon name="add" className="text-[16px]" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
