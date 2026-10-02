import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { Tooltip } from '../ui/Tooltip'
import { formatRange, isoWeek } from '../../lib/calendar'
import type { CalendarView } from '../../lib/calendar'

export type PageView = CalendarView | 'list'

const VIEWS: { value: PageView; label: string; key: string }[] = [
  { value: 'day', label: 'Day view', key: 'D' },
  { value: 'week', label: 'Week view', key: 'W' },
  { value: 'month', label: 'Month view', key: 'M' },
  { value: 'list', label: 'List view', key: 'L' },
]

/**
 * Date badge, title and range on the left; search, previous / today / next, the view
 * switcher and "New appointment" on the right. Wraps onto two rows on small screens.
 */
export function CalendarHeader({
  view,
  anchor,
  onView,
  onPrev,
  onNext,
  onToday,
  onNew,
  search,
  onSearch,
  searchRef,
}: {
  view: PageView
  anchor: Date
  onView: (v: PageView) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onNew: () => void
  search: string
  onSearch: (s: string) => void
  searchRef: React.RefObject<HTMLInputElement | null>
}) {
  const [menu, setMenu] = useState(false)
  const [searchOpen, setSearchOpen] = useState(Boolean(search))
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const onDown = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey) }
  }, [menu])

  useEffect(() => { if (searchOpen) searchRef.current?.focus() }, [searchOpen, searchRef])

  const current = VIEWS.find((v) => v.value === view)!
  const nav = 'flex h-9 items-center justify-center bg-surface px-3 text-sm font-semibold text-text hover:bg-surface-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-4 py-4 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-border bg-surface text-center">
          <span className="text-[10px] font-bold uppercase leading-none tracking-widest text-text-muted">
            {anchor.toLocaleDateString(undefined, { month: 'short' })}
          </span>
          <span className="mt-0.5 text-lg font-bold leading-none text-primary">{anchor.getDate()}</span>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-bold sm:text-xl">
              {anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </h2>
            {view !== 'month' && (
              <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] font-semibold text-text-muted">
                Week {isoWeek(anchor)}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-text-muted">{formatRange(view === 'list' ? 'month' : view, anchor)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {searchOpen ? (
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-text-muted" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              onBlur={() => { if (!search) setSearchOpen(false) }}
              onKeyDown={(e) => { if (e.key === 'Escape') { onSearch(''); setSearchOpen(false) } }}
              placeholder="Search attendee…"
              aria-label="Search appointments by attendee"
              className="h-9 w-40 rounded-lg border border-border bg-surface-high py-1 pl-8 pr-2 text-sm outline-none focus:border-primary sm:w-52"
            />
          </div>
        ) : (
          <Tooltip content="Search attendees (/)">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search attendees"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-surface-high hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Icon name="search" className="text-[20px]" />
            </button>
          </Tooltip>
        )}

        <div className="flex overflow-hidden rounded-lg border border-border">
          <Tooltip content="Previous"><button type="button" onClick={onPrev} aria-label="Previous" className={nav}><Icon name="arrow_back" className="text-[18px]" /></button></Tooltip>
          <button type="button" onClick={onToday} className={`${nav} border-x border-border`}>Today</button>
          <Tooltip content="Next"><button type="button" onClick={onNext} aria-label="Next" className={nav}><Icon name="arrow_forward" className="text-[18px]" /></button></Tooltip>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-haspopup="menu"
            aria-expanded={menu}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-semibold hover:bg-surface-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {current.label}
            <Icon name="expand_more" className="text-[18px] text-text-muted" />
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 top-full z-30 mt-1.5 w-48 rounded-xl border border-border bg-surface p-1 shadow-xl">
              {VIEWS.map((v) => (
                <button
                  key={v.value}
                  role="menuitemradio"
                  aria-checked={v.value === view}
                  type="button"
                  onClick={() => { onView(v.value); setMenu(false) }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-text hover:bg-surface-high"
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${v.value === view ? 'border-primary' : 'border-border'}`}>
                    {v.value === view && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </span>
                  <span className="flex-1">{v.label}</span>
                  <kbd className="rounded border border-border px-1.5 text-[10px] font-semibold text-text-muted">{v.key}</kbd>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onNew}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-bold text-bg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          <Icon name="add" className="text-[18px]" />
          <span className="hidden sm:inline">New appointment</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>
    </div>
  )
}
