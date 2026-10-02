import { useEffect, useState } from 'react'
import { Icon } from '../Icon'
import { addMonths, monthGrid, sameDay, toDateStr } from '../../lib/calendar'

/** Small month picker for Day view. Dots mark days that have appointments. */
export function MiniCalendar({
  selected,
  datesWithAppointments,
  onSelect,
}: {
  selected: Date
  datesWithAppointments: Set<string>
  onSelect: (d: Date) => void
}) {
  const [shown, setShown] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1))
  // Follow the selected day when it moves to another month (previous / next / today).
  useEffect(() => { setShown(new Date(selected.getFullYear(), selected.getMonth(), 1)) }, [selected])
  const today = new Date()
  const arrow = 'flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-high hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

  return (
    <div className="px-1">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold">{shown.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
        <div className="flex gap-0.5">
          <button type="button" aria-label="Previous month" onClick={() => setShown(addMonths(shown, -1))} className={arrow}><Icon name="chevron_left" className="text-[18px]" /></button>
          <button type="button" aria-label="Next month" onClick={() => setShown(addMonths(shown, 1))} className={arrow}><Icon name="chevron_right" className="text-[18px]" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-text-muted">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => <span key={d} className="py-1">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {monthGrid(shown).map((d) => {
          const ds = toDateStr(d)
          const isSel = sameDay(d, selected)
          const inMonth = d.getMonth() === shown.getMonth()
          return (
            <button
              key={ds}
              type="button"
              onClick={() => onSelect(d)}
              aria-label={d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              aria-current={isSel ? 'date' : undefined}
              className={`relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isSel ? 'bg-primary text-bg' : sameDay(d, today) ? 'text-primary ring-1 ring-primary/50' : inMonth ? 'text-text hover:bg-surface-high' : 'text-text-muted/50 hover:bg-surface-high'
              }`}
            >
              {d.getDate()}
              {datesWithAppointments.has(ds) && <span className={`absolute bottom-0.5 h-1 w-1 rounded-full ${isSel ? 'bg-bg' : 'bg-primary'}`} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
