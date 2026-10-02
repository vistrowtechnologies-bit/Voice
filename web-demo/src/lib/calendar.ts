import type { Appointment, AppointmentStatus } from './types'

/** Pure date and layout helpers for the Appointments calendar (no React). */

export type CalendarView = 'day' | 'week' | 'month'

export const pad = (n: number) => String(n).padStart(2, '0')

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Parses "YYYY-MM-DD" as a local date at midnight (never via Date.parse, which reads it as UTC). */
export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1)
export const sameDay = (a: Date, b: Date) => toDateStr(a) === toDateStr(b)

/** Monday is the first day of the week. */
export function startOfWeek(d: Date): Date {
  const offset = (d.getDay() + 6) % 7
  return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -offset)
}

/** The 6 x 7 block of days a month view shows, from the Monday on or before the 1st. */
export function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const start = startOfWeek(first)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** ISO 8601 week number. */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/** The inclusive date range a view needs. Week and day always fall inside their month's grid, so one fetch per month serves all views. */
export function rangeForMonth(anchor: Date): { start: string; end: string } {
  const g = monthGrid(anchor)
  return { start: toDateStr(g[0]), end: toDateStr(g[41]) }
}

export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
export const hhmm = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`

export function formatRange(view: CalendarView, anchor: Date, locale?: string): string {
  const f = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  if (view === 'day') return anchor.toLocaleDateString(locale, { weekday: 'long' })
  if (view === 'week') {
    const days = weekDays(anchor)
    return `${f(days[0])} – ${f(days[6])}`
  }
  return `${f(new Date(anchor.getFullYear(), anchor.getMonth(), 1))} – ${f(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0))}`
}

/** Move the anchor by one page of the current view. */
export function step(view: CalendarView, anchor: Date, dir: 1 | -1): Date {
  if (view === 'day') return addDays(anchor, dir)
  if (view === 'week') return addDays(anchor, 7 * dir)
  return addMonths(anchor, dir)
}

export function groupByDate(list: Appointment[]): Map<string, Appointment[]> {
  const by = new Map<string, Appointment[]>()
  for (const a of list) {
    const arr = by.get(a.date) ?? []
    arr.push(a)
    by.set(a.date, arr)
  }
  for (const arr of by.values()) arr.sort((a, b) => a.time.localeCompare(b.time))
  return by
}

export interface Placed {
  appt: Appointment
  top: number // minutes from midnight
  height: number // minutes
  col: number
  cols: number
}

const MIN_BLOCK_MINUTES = 30

/**
 * Lay a day's appointments out in a time grid. Appointments that overlap share the width of the
 * day: each cluster of overlapping appointments is split into as many columns as it needs.
 */
export function layoutDay(list: Appointment[]): Placed[] {
  const items = list
    .map((appt) => {
      const top = minutesOf(appt.time)
      return { appt, top, height: Math.max(appt.durationMinutes || 30, MIN_BLOCK_MINUTES) }
    })
    .sort((a, b) => a.top - b.top || b.height - a.height)

  const out: Placed[] = []
  let cluster: { item: (typeof items)[number]; col: number }[] = []
  let clusterEnd = -1
  let colEnds: number[] = []

  const flush = () => {
    const cols = colEnds.length || 1
    for (const c of cluster) out.push({ ...c.item, col: c.col, cols })
    cluster = []
    colEnds = []
    clusterEnd = -1
  }

  for (const item of items) {
    if (cluster.length && item.top >= clusterEnd) flush()
    let col = colEnds.findIndex((end) => end <= item.top)
    if (col === -1) {
      col = colEnds.length
      colEnds.push(0)
    }
    colEnds[col] = item.top + item.height
    clusterEnd = Math.max(clusterEnd, item.top + item.height)
    cluster.push({ item, col })
  }
  flush()
  return out
}

/** Colour and label per status. Classes are written out in full so Tailwind keeps them. */
export const STATUS_META: Record<AppointmentStatus, { label: string; chip: string; block: string; dot: string; pill: string }> = {
  confirmed: {
    label: 'Confirmed',
    chip: 'border-primary/30 bg-primary/10 text-primary',
    block: 'border-primary/40 bg-primary/10 text-primary',
    dot: 'bg-primary',
    pill: 'border-primary/30 bg-primary/10 text-primary',
  },
  completed: {
    label: 'Completed',
    chip: 'border-success/30 bg-success/10 text-success',
    block: 'border-success/40 bg-success/10 text-success',
    dot: 'bg-success',
    pill: 'border-success/30 bg-success/10 text-success',
  },
  rescheduled: {
    label: 'Rescheduled',
    chip: 'border-amber/30 bg-amber/10 text-amber',
    block: 'border-amber/40 bg-amber/10 text-amber',
    dot: 'bg-amber',
    pill: 'border-amber/30 bg-amber/10 text-amber',
  },
  cancelled: {
    label: 'Cancelled',
    chip: 'border-destructive/30 bg-destructive/10 text-destructive line-through opacity-70',
    block: 'border-destructive/40 bg-destructive/10 text-destructive line-through opacity-70',
    dot: 'bg-destructive',
    pill: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
  no_show: {
    label: 'No-show',
    chip: 'border-border bg-surface-high text-text-muted',
    block: 'border-border bg-surface-high text-text-muted',
    dot: 'bg-muted',
    pill: 'border-border bg-surface-high text-text-muted',
  },
}
