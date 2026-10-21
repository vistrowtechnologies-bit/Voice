import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'

// The Overview's date filter (owner, 21 Oct 2026): presets on the left, a
// range calendar, the picked dates and Cancel / Apply at the foot. Dates are
// the viewer's local calendar days as YYYY-MM-DD; the server counts calls by
// the same local days (tz is sent with every request).

export type RangePreset = 'today' | 'yesterday' | 'last7' | 'last14' | 'last30' | 'last90' | 'thisMonth' | 'lastMonth' | 'custom'

export interface DateRange {
  preset: RangePreset
  start: string
  end: string
}

/** The server's limit: a range of one year or less. */
const MAX_DAYS = 366

function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
function parse(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}
function todayLocal(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}
/** Days in the range, both ends counted. */
export function rangeDays(range: DateRange): number {
  return Math.round((parse(range.end).getTime() - parse(range.start).getTime()) / 86_400_000) + 1
}

const PRESETS: { key: Exclude<RangePreset, 'custom'>; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last14', label: 'Last 14 days' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'last90', label: 'Last 90 days' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
]

/** A preset's dates as of today, so "Last 14 days" keeps rolling. */
export function presetRange(key: Exclude<RangePreset, 'custom'>): DateRange {
  const t = todayLocal()
  const last = (n: number) => ({ start: iso(addDays(t, -(n - 1))), end: iso(t) })
  const dates = {
    today: { start: iso(t), end: iso(t) },
    yesterday: { start: iso(addDays(t, -1)), end: iso(addDays(t, -1)) },
    last7: last(7),
    last14: last(14),
    last30: last(30),
    last90: last(90),
    thisMonth: { start: iso(new Date(t.getFullYear(), t.getMonth(), 1)), end: iso(t) },
    lastMonth: { start: iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)), end: iso(new Date(t.getFullYear(), t.getMonth(), 0)) },
  }[key]
  return { preset: key, ...dates }
}

const short = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })
const long = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

/** "8 Oct – 21 Oct", or one date for a single day; the year only when it is not this year. */
export function formatRange(start: string, end: string): string {
  const a = parse(start)
  const b = parse(end)
  const thisYear = todayLocal().getFullYear()
  const fmt = a.getFullYear() === thisYear && b.getFullYear() === thisYear ? short : long
  return start === end ? fmt.format(a) : `${fmt.format(a)} – ${fmt.format(b)}`
}

/** The range's name for buttons and sentences: "Last 14 days", "This month", "8 Oct – 21 Oct". */
export function rangeLabel(range: DateRange): string {
  return PRESETS.find((p) => p.key === range.preset)?.label ?? formatRange(range.start, range.end)
}

/** The range inside a sentence: "in the last 14 days", "today", "on 8 Oct", "from 8 Oct – 21 Oct". */
export function rangePhrase(range: DateRange): string {
  if (range.preset.startsWith('last') && range.preset !== 'lastMonth') return `in the ${rangeLabel(range).toLowerCase()}`
  if (range.preset !== 'custom') return rangeLabel(range).toLowerCase()
  return range.start === range.end ? `on ${formatRange(range.start, range.end)}` : `from ${formatRange(range.start, range.end)}`
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const monthName = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' })

function MonthGrid({ month, start, end, hover, today, onPick, onHover }: {
  month: Date
  start: string | null
  end: string | null
  hover: string | null
  today: string
  onPick: (day: string) => void
  onHover: (day: string | null) => void
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const lead = (first.getDay() + 6) % 7 // Monday first
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  // While picking the end, the hovered day previews the range.
  const to = end ?? (start && hover && hover >= start ? hover : null)
  return (
    <div className="w-full sm:w-[252px]">
      <p className="mb-2 text-center text-sm font-bold">{monthName.format(month)}</p>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-text-muted">
        {WEEKDAYS.map((d) => <span key={d} className="py-1">{d}</span>)}
      </div>
      <div className="grid grid-cols-7" onMouseLeave={() => onHover(null)}>
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: count }, (_, i) => {
          const day = iso(new Date(month.getFullYear(), month.getMonth(), i + 1))
          const future = day > today
          const isStart = day === start
          const isEnd = day === to
          const inside = !!start && !!to && day > start && day < to
          const edge = isStart || isEnd
          return (
            <span key={day} className={`relative flex h-9 items-center justify-center ${inside ? 'bg-primary/10' : ''} ${isStart && to && to !== start ? 'bg-gradient-to-r from-transparent from-50% to-primary/10 to-50%' : ''} ${isEnd && start && start !== to ? 'bg-gradient-to-l from-transparent from-50% to-primary/10 to-50%' : ''}`}>
              <button
                type="button"
                disabled={future}
                onClick={() => onPick(day)}
                onMouseEnter={() => onHover(day)}
                aria-label={long.format(parse(day))}
                aria-pressed={edge}
                className={`relative h-9 w-9 rounded-full text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:text-text-muted/40 ${
                  edge ? 'bg-primary text-white' : 'bg-transparent text-text hover:bg-surface-high'
                }`}
              >
                {i + 1}
                {day === today && !edge && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />}
              </button>
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function DateRangeFilter({ value, onChange, loading = false }: {
  value: DateRange
  onChange: (range: DateRange) => void
  /** Data for the applied range is still loading. */
  loading?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<{ preset: RangePreset; start: string | null; end: string | null }>(value)
  const [hover, setHover] = useState<string | null>(null)
  const today = iso(todayLocal())
  // The right-hand month on wide screens; one month on phones.
  const [month, setMonth] = useState(() => {
    const e = parse(value.end)
    return new Date(e.getFullYear(), e.getMonth(), 1)
  })
  const rootRef = useRef<HTMLDivElement>(null)

  const openPicker = () => {
    setDraft(value)
    const e = parse(value.end)
    setMonth(new Date(e.getFullYear(), e.getMonth(), 1))
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    // On phones it is a bottom sheet: the help launcher would sit on top of it.
    const sheet = window.matchMedia('(max-width: 639.98px)').matches
    if (sheet) document.documentElement.classList.add('vv-sheet-open')
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      if (sheet) document.documentElement.classList.remove('vv-sheet-open')
    }
  }, [open])

  const pick = (day: string) => {
    // First click (or a click before the start) begins a new range.
    if (!draft.start || draft.end || day < draft.start) setDraft({ preset: 'custom', start: day, end: null })
    else setDraft({ preset: 'custom', start: draft.start, end: day })
  }
  const tooLong = !!draft.start && !!draft.end && rangeDays({ preset: 'custom', start: draft.start, end: draft.end }) > MAX_DAYS
  const canApply = !!draft.start && !!draft.end && !tooLong
  const apply = () => {
    if (!draft.start || !draft.end || tooLong) return
    onChange({ preset: draft.preset, start: draft.start, end: draft.end })
    setOpen(false)
  }
  const prevMonth = useMemo(() => new Date(month.getFullYear(), month.getMonth() - 1, 1), [month])
  const atCurrentMonth = month.getFullYear() === todayLocal().getFullYear() && month.getMonth() === todayLocal().getMonth()

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-10 min-w-0 max-w-full items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-left text-sm font-semibold text-text transition-colors hover:border-primary/50"
      >
        <Icon name={loading ? 'progress_activity' : 'calendar_month'} className={`shrink-0 text-[18px] text-primary ${loading ? 'animate-spin' : ''}`} />
        <span className="truncate">{rangeLabel(value)}</span>
        {value.preset !== 'custom' && <span className="hidden truncate text-xs font-medium text-text-muted md:inline">{formatRange(value.start, value.end)}</span>}
        <Icon name="expand_more" className="shrink-0 text-[18px] text-text-muted" />
      </button>

      {open && (
        <>
          <div className="vv-sheet-fade fixed inset-0 z-40 bg-black/40 sm:hidden" aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Choose dates"
            className="vv-sheet-up vv-range-pop fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col overflow-y-auto rounded-t-[28px] border border-border bg-surface shadow-2xl sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:mt-2 sm:max-h-none sm:flex-row sm:overflow-visible sm:rounded-2xl"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-border sm:hidden" />
            {/* Presets: a column on wide screens, a scrolling row of chips on phones. */}
            <div className="flex shrink-0 gap-1.5 overflow-x-auto px-4 pt-3 [scrollbar-width:none] sm:w-40 sm:flex-col sm:gap-0.5 sm:overflow-visible sm:border-r sm:border-border sm:p-3 [&::-webkit-scrollbar]:hidden">
              {PRESETS.map((p) => {
                const active = draft.preset === p.key
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      const r = presetRange(p.key)
                      setDraft(r)
                      const e = parse(r.end)
                      setMonth(new Date(e.getFullYear(), e.getMonth(), 1))
                    }}
                    className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-left text-[13px] font-semibold transition-colors sm:rounded-lg sm:px-2.5 sm:py-2 ${
                      active ? 'bg-primary/12 text-primary' : 'bg-surface-high/50 text-text-muted hover:bg-surface-high hover:text-text sm:bg-transparent'
                    }`}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>

            <div className="flex min-w-0 flex-col">
              <div className="relative flex gap-6 px-4 pt-4 sm:px-5">
                <button type="button" onClick={() => setMonth(prevMonth)} aria-label="Previous month" className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-transparent text-text-muted hover:bg-surface-high hover:text-text">
                  <Icon name="chevron_left" className="text-[20px]" />
                </button>
                <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} disabled={atCurrentMonth} aria-label="Next month" className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-transparent text-text-muted hover:bg-surface-high hover:text-text disabled:opacity-30">
                  <Icon name="chevron_right" className="text-[20px]" />
                </button>
                <div className="hidden lg:block">
                  <MonthGrid month={prevMonth} start={draft.start} end={draft.end} hover={hover} today={today} onPick={pick} onHover={setHover} />
                </div>
                <MonthGrid month={month} start={draft.start} end={draft.end} hover={hover} today={today} onPick={pick} onHover={setHover} />
              </div>

              <div className="mt-3 flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className={`text-[13px] font-semibold ${tooLong ? 'text-destructive' : 'text-text'}`}>
                  {tooLong
                    ? 'Pick a range of one year or less'
                    : draft.start
                      ? draft.end ? formatRange(draft.start, draft.end) : `${formatRange(draft.start, draft.start)} – pick an end date`
                      : 'Pick a start date'}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-text hover:bg-surface-high">
                    Cancel
                  </button>
                  <button type="button" onClick={apply} disabled={!canApply} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40">
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
