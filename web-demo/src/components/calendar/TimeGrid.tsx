import { useEffect, useMemo, useRef, useState } from 'react'
import { formatTime12h } from '../../lib/api'
import { STATUS_META, groupByDate, hhmm, layoutDay, minutesOf, sameDay, toDateStr } from '../../lib/calendar'
import type { Appointment } from '../../lib/types'

const HOUR_PX = 64
const SNAP_MINUTES = 15

const hourLabel = (h: number) => (h === 0 ? '' : formatTime12h(`${String(h).padStart(2, '0')}:00`).replace(':00', ''))

/**
 * Hour grid for one day or a week. Appointments are positioned by start time and length, and
 * overlapping ones share the width. A line marks the current time when today is visible; clicking
 * an empty slot starts a new appointment at that time. Scrolls to the working day on open.
 */
export function TimeGrid({
  days,
  appointments,
  selectedId,
  onSelect,
  onSlotClick,
}: {
  days: Date[]
  appointments: Appointment[]
  selectedId: number | null
  onSelect: (a: Appointment) => void
  onSlotClick: (date: string, time: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(() => new Date())
  const by = useMemo(() => groupByDate(appointments), [appointments])
  const multi = days.length > 1
  const today = days.find((d) => sameDay(d, now))
  const firstKey = toDateStr(days[0])

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(t)
  }, [])

  // Land on the working day: an hour before "now" when today is showing, else 8am.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const target = today ? now.getHours() * 60 + now.getMinutes() - 60 : 8 * 60 - 30
    el.scrollTop = Math.max(0, (target / 60) * HOUR_PX)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstKey, days.length])

  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX
  const gridCols = multi ? 'grid-cols-[repeat(7,minmax(7.5rem,1fr))]' : 'grid-cols-[minmax(0,1fr)]'

  return (
    <div ref={scroller} className="relative max-h-[68vh] min-h-[420px] overflow-auto" role="grid" aria-label="Schedule">
      <div className={multi ? 'min-w-[56rem]' : ''}>
        {multi && (
          <div className="sticky top-0 z-20 flex border-b border-border bg-surface">
            <div className="sticky left-0 z-30 w-14 shrink-0 border-r border-border bg-surface" />
            <div className={`grid flex-1 ${gridCols}`}>
              {days.map((d) => {
                const isToday = sameDay(d, now)
                return (
                  <div key={toDateStr(d)} role="columnheader" className="flex items-center justify-center gap-1.5 border-r border-border py-2.5 text-xs font-semibold text-text-muted last:border-r-0">
                    {d.toLocaleDateString(undefined, { weekday: 'short' })}
                    <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm ${isToday ? 'bg-primary text-bg' : 'text-text'}`}>{d.getDate()}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex" style={{ height: HOUR_PX * 24 }}>
          <div className="sticky left-0 z-10 w-14 shrink-0 border-r border-border bg-surface">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} style={{ height: HOUR_PX }} className="relative pr-2 text-right text-[11px] font-medium text-text-muted">
                <span className="absolute right-2 top-0 -translate-y-1/2">{hourLabel(h)}</span>
              </div>
            ))}
            {today && (
              <span style={{ top: nowTop }} className="absolute right-1 z-20 -translate-y-1/2 rounded bg-primary px-1 text-[10px] font-bold text-bg">
                {formatTime12h(hhmm(now.getHours() * 60 + now.getMinutes())).replace(' ', '')}
              </span>
            )}
          </div>

          <div className={`relative grid flex-1 ${gridCols}`}>
            {days.map((d) => {
              const ds = toDateStr(d)
              const placed = layoutDay(by.get(ds) ?? [])
              return (
                <div
                  key={ds}
                  role="gridcell"
                  aria-label={d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return
                    const y = e.clientY - e.currentTarget.getBoundingClientRect().top
                    const mins = Math.min(23 * 60 + 45, Math.round(((y / HOUR_PX) * 60) / SNAP_MINUTES) * SNAP_MINUTES)
                    onSlotClick(ds, hhmm(mins))
                  }}
                  className="relative cursor-cell border-r border-border last:border-r-0"
                  style={{
                    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, var(--color-border) ${HOUR_PX - 1}px, var(--color-border) ${HOUR_PX}px)`,
                  }}
                >
                  {placed.map((p) => {
                    const meta = STATUS_META[p.appt.status]
                    const tall = p.height >= 45
                    return (
                      <button
                        key={p.appt.id}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onSelect(p.appt) }}
                        style={{
                          top: (p.top / 60) * HOUR_PX + 1,
                          height: (p.height / 60) * HOUR_PX - 2,
                          left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
                          width: `calc(${100 / p.cols}% - 4px)`,
                        }}
                        className={`absolute z-[1] flex flex-col overflow-hidden rounded-lg border px-2 py-1 text-left ${meta.block} ${selectedId === p.appt.id ? 'ring-2 ring-primary' : ''} hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
                      >
                        <span className="truncate text-xs font-bold">{p.appt.name || p.appt.phone || 'Appointment'}</span>
                        <span className="truncate text-[11px] font-medium opacity-80">
                          {formatTime12h(p.appt.time)} – {formatTime12h(hhmm(minutesOf(p.appt.time) + (p.appt.durationMinutes || 30)))}
                        </span>
                        {tall && p.appt.purpose && <span className="mt-0.5 line-clamp-2 text-[11px] opacity-80">{p.appt.purpose}</span>}
                      </button>
                    )
                  })}
                </div>
              )
            })}
            {today && (
              <div style={{ top: nowTop }} className="pointer-events-none absolute inset-x-0 z-[2] h-px bg-primary">
                <span className="absolute -left-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-primary" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
