import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { AppointmentDetails } from '../components/calendar/AppointmentDetails'
import { AppointmentModal } from '../components/calendar/AppointmentModal'
import type { ModalState } from '../components/calendar/AppointmentModal'
import { CalendarHeader } from '../components/calendar/CalendarHeader'
import type { PageView } from '../components/calendar/CalendarHeader'
import { MiniCalendar } from '../components/calendar/MiniCalendar'
import { MonthView } from '../components/calendar/MonthView'
import { TimeGrid } from '../components/calendar/TimeGrid'
import { DataTable } from '../components/ui/DataTable'
import type { DataTableColumn } from '../components/ui/DataTable'
import { StatTile } from '../components/ui/StatTile'
import { fetchAppointments, formatTime12h, updateAppointmentStatus } from '../lib/api'
import { STATUS_META, groupByDate, parseDateStr, rangeForMonth, step, toDateStr, weekDays } from '../lib/calendar'
import type { Appointment, AppointmentStatus } from '../lib/types'

const STATUS_FILTERS: { value: AppointmentStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'rescheduled', label: 'Rescheduled' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No-show' },
]
const SOURCE_FILTERS: { value: 'all' | 'agent' | 'manual'; label: string }[] = [
  { value: 'all', label: 'All sources' },
  { value: 'agent', label: 'Booked by the agent' },
  { value: 'manual', label: 'Added by your team' },
]

const VIEW_KEY = 'appointments.view'
const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

export function Appointments() {
  const [view, setView] = useState<PageView>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY)
      if (v === 'day' || v === 'week' || v === 'month' || v === 'list') return v
    } catch { /* storage can be unavailable */ }
    return window.innerWidth < 640 ? 'day' : 'month'
  })
  const [anchor, setAnchor] = useState(() => new Date())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'agent' | 'manual'>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Appointment | null>(null) // Day view side panel
  const [dialogAppt, setDialogAppt] = useState<Appointment | null>(null) // Month / Week / List
  const [modal, setModal] = useState<ModalState | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const monthKey = `${anchor.getFullYear()}-${anchor.getMonth()}`
  const reload = useCallback(() => {
    const { start, end } = rangeForMonth(anchor)
    return fetchAppointments({ start, end, status: statusFilter === 'all' ? undefined : statusFilter, search: search || undefined })
      .then((list) => { setAppointments(list); setLoadError(false) })
      .catch(() => { setAppointments([]); setLoadError(true) })
    // anchor matters only through its month
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey, statusFilter, search])
  useEffect(() => { void reload() }, [reload])

  const changeView = useCallback((v: PageView) => {
    setView(v)
    setSelected(null)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* ignore */ }
  }, [])
  const go = useCallback((a: Date) => { setAnchor(a); setSelected(null) }, [])
  const stepView = useCallback((dir: 1 | -1) => go(step(view === 'list' ? 'month' : view, anchor, dir)), [anchor, go, view])
  const openDay = useCallback((d: Date) => { go(d); changeView('day') }, [changeView, go])

  const filtered = useMemo(
    () => (sourceFilter === 'all' ? appointments : appointments.filter((a) => a.source === sourceFilter)),
    [appointments, sourceFilter],
  )
  // Rescheduling keeps the old booking as "Rescheduled" and creates a new one. The calendar shows
  // only the live one; the old ones stay in List view and under the Rescheduled filter.
  const onCalendar = useMemo(
    () => (statusFilter === 'rescheduled' ? filtered : filtered.filter((a) => a.status !== 'rescheduled')),
    [filtered, statusFilter],
  )
  const datesWithAppointments = useMemo(() => new Set(onCalendar.map((a) => a.date)), [onCalendar])
  const kpis = useMemo(() => ({
    total: appointments.length,
    confirmed: appointments.filter((a) => a.status === 'confirmed').length,
    completed: appointments.filter((a) => a.status === 'completed').length,
    noShow: appointments.filter((a) => a.status === 'no_show').length,
  }), [appointments])

  const select = (a: Appointment) => (view === 'day' ? setSelected(a) : setDialogAppt(a))
  const newOn = (date?: string, time?: string) => setModal({ mode: 'create', date: date ?? toDateStr(anchor), time })

  const setStatus = async (id: number, status: AppointmentStatus) => {
    setBusy(true)
    try {
      await updateAppointmentStatus(id, status)
      setSelected(null)
      setDialogAppt(null)
      await reload()
    } finally {
      setBusy(false)
    }
  }

  // Keyboard: D / W / M / L switch view, T today, N new, arrows page, "/" search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || modal || dialogAppt) return
      const k = e.key.toLowerCase()
      const map: Record<string, () => void> = {
        d: () => changeView('day'), w: () => changeView('week'), m: () => changeView('month'), l: () => changeView('list'),
        t: () => go(new Date()), n: () => newOn(), arrowleft: () => stepView(-1), arrowright: () => stepView(1),
        '/': () => searchRef.current?.focus(),
      }
      if (map[k]) { e.preventDefault(); map[k]() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, dialogAppt, view, anchor, changeView, go, stepView])

  const dayList = useMemo(() => groupByDate(onCalendar).get(toDateStr(anchor)) ?? [], [onCalendar, anchor])

  const columns: DataTableColumn<Appointment>[] = [
    { key: 'name', header: 'Contact', primary: true, render: (a) => (<div><p className="text-sm font-semibold">{a.name || a.phone}</p><p className="text-[11px] text-text-muted">{a.phone}</p></div>) },
    { key: 'when', header: 'When', render: (a) => <span className="text-sm">{parseDateStr(a.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · {formatTime12h(a.time)}</span> },
    { key: 'purpose', header: 'Purpose', render: (a) => <span className="text-sm text-text-muted">{a.purpose || '-'}</span> },
    { key: 'status', header: 'Status', render: (a) => <span className={`whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold ${STATUS_META[a.status].pill}`}>{STATUS_META[a.status].label}</span> },
    { key: 'source', header: 'Source', render: (a) => <span className="text-sm text-text-muted">{a.source === 'agent' ? 'Agent' : 'Team'}</span> },
  ]

  const select_ = 'h-9 rounded-lg border border-border bg-surface-high px-2.5 text-sm font-semibold text-text outline-none focus:border-primary'

  return (
    <DashboardLayout>
      <PageHeader title="Appointments" subtitle="Meetings your AI agent - or your team - has booked" />
      <section className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile compact label="Total" value={String(kpis.total)} icon="event" tone="primary" />
          <StatTile compact label="Confirmed" value={String(kpis.confirmed)} icon="check_circle" tone="cyan" />
          <StatTile compact label="Completed" value={String(kpis.completed)} icon="task_alt" tone="success" />
          <StatTile compact label="No-shows" value={String(kpis.noShow)} icon="person_off" tone="muted" />
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <CalendarHeader
            view={view}
            anchor={anchor}
            onView={changeView}
            onPrev={() => stepView(-1)}
            onNext={() => stepView(1)}
            onToday={() => go(new Date())}
            onNew={() => newOn()}
            search={search}
            onSearch={setSearch}
            searchRef={searchRef}
          />

          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 sm:px-6">
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)} aria-label="Filter by source" className={select_}>
              {SOURCE_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} aria-label="Filter by status" className={select_}>
              {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <div className="ml-auto hidden items-center gap-3 text-xs font-medium text-text-muted lg:flex" aria-hidden="true">
              {(['confirmed', 'completed', 'rescheduled', 'cancelled', 'no_show'] as const).map((s) => (
                <span key={s} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${STATUS_META[s].dot}`} />{STATUS_META[s].label}</span>
              ))}
            </div>
          </div>

          {loadError && (
            <p role="alert" className="border-b border-border bg-destructive/10 px-4 py-2 text-sm font-semibold text-destructive sm:px-6">
              Could not load appointments. Check your connection and try again.
            </p>
          )}

          {view === 'month' && (
            <MonthView anchor={anchor} appointments={onCalendar} onOpenDay={openDay} onSelect={select} onNewOnDate={(d) => newOn(d)} />
          )}
          {view === 'week' && (
            <TimeGrid days={weekDays(anchor)} appointments={onCalendar} selectedId={null} onSelect={select} onSlotClick={(d, t) => newOn(d, t)} />
          )}
          {view === 'day' && (
            <div className="grid lg:grid-cols-[minmax(0,1fr)_21rem]">
              <TimeGrid days={[anchor]} appointments={onCalendar} selectedId={selected?.id ?? null} onSelect={select} onSlotClick={(d, t) => newOn(d, t)} />
              <aside className="flex flex-col gap-5 border-t border-border p-4 lg:border-l lg:border-t-0">
                <MiniCalendar selected={anchor} datesWithAppointments={datesWithAppointments} onSelect={go} />
                <div className="border-t border-border pt-4">
                  {selected ? (
                    <AppointmentDetails appt={selected} busy={busy} onStatus={setStatus} onReschedule={(a) => setModal({ mode: 'reschedule', appt: a, date: a.date })} onClose={() => setSelected(null)} />
                  ) : dayList.length > 0 ? (
                    <div>
                      <h3 className="mb-2 text-sm font-bold">{anchor.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
                      <ul className="flex flex-col gap-1.5">
                        {dayList.map((a) => (
                          <li key={a.id}>
                            <button type="button" onClick={() => setSelected(a)} className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-surface-high">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_META[a.status].dot}`} />
                              <span className="min-w-0 flex-1 truncate font-semibold">{a.name || a.phone}</span>
                              <span className="shrink-0 text-xs text-text-muted">{formatTime12h(a.time)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-4 text-center">
                      <Icon name="event_available" className="text-[32px] text-text-muted" />
                      <p className="text-sm font-semibold">Nothing booked this day</p>
                      <button type="button" onClick={() => newOn()} className="text-sm font-semibold text-primary hover:underline">New appointment</button>
                    </div>
                  )}
                </div>
              </aside>
            </div>
          )}
          {view === 'list' && (
            <div className="p-4 sm:p-6">
              <DataTable
                columns={columns}
                rows={filtered}
                rowKey={(a) => a.id}
                onRowClick={(a) => setDialogAppt(a)}
                rowAriaLabel={(a) => `Open appointment with ${a.name || a.phone}`}
                emptyMessage="No appointments in this range yet."
                footer={`Showing ${filtered.length} of ${appointments.length} appointments`}
              />
            </div>
          )}
        </div>
      </section>

      {dialogAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Appointment details" onClick={() => setDialogAppt(null)}>
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <AppointmentDetails appt={dialogAppt} busy={busy} onStatus={setStatus} onReschedule={(a) => { setDialogAppt(null); setModal({ mode: 'reschedule', appt: a, date: a.date }) }} onClose={() => setDialogAppt(null)} />
          </div>
        </div>
      )}

      {modal && (
        <AppointmentModal
          state={modal}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); setSelected(null); void reload() }}
        />
      )}
    </DashboardLayout>
  )
}
