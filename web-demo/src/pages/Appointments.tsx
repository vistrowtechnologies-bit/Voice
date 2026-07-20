import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { Card } from '../components/ui/Card'
import { CalendarGrid } from '../components/ui/CalendarGrid'
import { DataTable } from '../components/ui/DataTable'
import type { DataTableColumn } from '../components/ui/DataTable'
import { StatTile } from '../components/ui/StatTile'
import {
  checkAppointmentAvailability,
  createAppointment,
  fetchAppointments,
  formatTime12h,
  rescheduleAppointment,
  updateAppointmentStatus,
} from '../lib/api'
import type { Appointment, AppointmentStatus } from '../lib/types'

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  confirmed: 'bg-cyan/20 text-cyan border-cyan/30',
  cancelled: 'bg-destructive/20 text-destructive border-destructive/30',
  rescheduled: 'bg-amber/20 text-amber border-amber/30',
  completed: 'bg-primary/20 text-primary border-primary/30',
  no_show: 'bg-muted/20 text-text-muted border-muted/30',
}

const STATUS_FILTERS: { value: AppointmentStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'rescheduled', label: 'Rescheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'no_show', label: 'No-show' },
]

const SOURCE_FILTERS: { value: 'all' | 'agent' | 'manual'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'agent', label: 'Agent' },
  { value: 'manual', label: 'Manual' },
]

function monthRange(month: Date): { start: string; end: string } {
  const start = new Date(month.getFullYear(), month.getMonth(), 1)
  const startOffset = start.getDay()
  const gridStart = new Date(start.getFullYear(), start.getMonth(), 1 - startOffset)
  const gridEnd = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + 41)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: fmt(gridStart), end: fmt(gridEnd) }
}

export function Appointments() {
  const [month, setMonth] = useState(() => new Date())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'agent' | 'manual'>('all')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', email: '', purpose: '', date: '', durationMinutes: '30' })
  const [slots, setSlots] = useState<string[] | null>(null)

  const reload = () => {
    const { start, end } = monthRange(month)
    fetchAppointments({ start, end, status: statusFilter === 'all' ? undefined : statusFilter, search: search || undefined })
      .then(setAppointments)
      .catch(() => setAppointments([]))
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, statusFilter, search])

  const filtered = useMemo(() => {
    if (sourceFilter === 'all') return appointments
    return appointments.filter((a) => a.source === sourceFilter)
  }, [appointments, sourceFilter])

  const kpis = useMemo(() => {
    const confirmed = appointments.filter((a) => a.status === 'confirmed').length
    const completed = appointments.filter((a) => a.status === 'completed').length
    const noShow = appointments.filter((a) => a.status === 'no_show').length
    return { total: appointments.length, confirmed, completed, noShow }
  }, [appointments])

  const checkSlots = async () => {
    if (!form.date) return
    const result = await checkAppointmentAvailability(form.date, Number(form.durationMinutes) || 30)
    setSlots(result.slots)
  }

  const handleAdd = async (time: string) => {
    if (!form.name && !form.phone) return
    await createAppointment({
      name: form.name,
      phone: form.phone,
      email: form.email,
      purpose: form.purpose,
      date: form.date,
      time,
      durationMinutes: Number(form.durationMinutes) || 30,
    })
    setForm({ name: '', phone: '', email: '', purpose: '', date: '', durationMinutes: '30' })
    setSlots(null)
    setShowAdd(false)
    reload()
  }

  const handleStatus = async (id: number, status: AppointmentStatus) => {
    await updateAppointmentStatus(id, status)
    setSelected(null)
    reload()
  }

  const columns: DataTableColumn<Appointment>[] = [
    {
      key: 'name',
      header: 'Contact',
      primary: true,
      render: (a) => (
        <div>
          <p className="text-sm font-semibold">{a.name}</p>
          <p className="text-[11px] text-text-muted">{a.phone}</p>
        </div>
      ),
    },
    { key: 'when', header: 'When', render: (a) => <span className="text-sm">{a.date} · {formatTime12h(a.time)}</span> },
    { key: 'purpose', header: 'Purpose', render: (a) => <span className="text-sm text-text-muted">{a.purpose || '—'}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (a) => (
        <span className={`whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLES[a.status]}`}>
          {a.status.replace('_', ' ')}
        </span>
      ),
    },
    { key: 'source', header: 'Source', render: (a) => <span className="text-sm capitalize text-text-muted">{a.source}</span> },
  ]

  return (
    <DashboardLayout>
      <PageHeader title="Appointments" subtitle="Meetings and site visits your AI agent — or your team — has booked">
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90"
        >
          <Icon name="add" className="text-[18px]" />
          New Appointment
        </button>
      </PageHeader>

      <section className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile compact label="Total" value={String(kpis.total)} icon="event" tone="primary" />
          <StatTile compact label="Confirmed" value={String(kpis.confirmed)} icon="check_circle" tone="cyan" />
          <StatTile compact label="Completed" value={String(kpis.completed)} icon="task_alt" tone="success" />
          <StatTile compact label="No-shows" value={String(kpis.noShow)} icon="person_off" tone="muted" />
        </div>

        {showAdd && (
          <Card variant="flat" padding="sm" className="flex flex-col gap-3 !border-primary/40">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Name"
                className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Phone"
                className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="Email"
                className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <input
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                placeholder="Purpose"
                className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <input
                type="date"
                value={form.date}
                onChange={(e) => {
                  setForm({ ...form, date: e.target.value })
                  setSlots(null)
                }}
                className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="flex items-center gap-3">
              <select
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
                className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
              >
                {['15', '30', '45', '60'].map((m) => (
                  <option key={m} value={m}>{m} min</option>
                ))}
              </select>
              <button
                onClick={checkSlots}
                disabled={!form.date}
                className="rounded-lg border border-border px-3 py-2 text-sm font-bold hover:border-primary disabled:opacity-50"
              >
                Check availability
              </button>
            </div>
            {slots !== null && (
              <div className="flex flex-wrap gap-2">
                {slots.length === 0 ? (
                  <span className="text-sm text-text-muted">No open slots on this date.</span>
                ) : (
                  slots.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleAdd(s)}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:border-primary hover:text-primary"
                    >
                      {formatTime12h(s)}
                    </button>
                  ))
                )}
              </div>
            )}
          </Card>
        )}

        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="flex w-full shrink-0 flex-col gap-4 lg:w-56">
            <Card padding="sm" className="flex flex-col gap-1">
              <span className="px-2 pb-1 text-[11px] font-bold uppercase tracking-widest text-text-muted">Source</span>
              {SOURCE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setSourceFilter(f.value)}
                  className={`rounded-lg px-3 py-1.5 text-left text-sm font-semibold ${
                    sourceFilter === f.value ? 'bg-primary text-bg' : 'text-text-muted hover:text-text'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </Card>
            <Card padding="sm" className="flex flex-col gap-1">
              <span className="px-2 pb-1 text-[11px] font-bold uppercase tracking-widest text-text-muted">Status</span>
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`rounded-lg px-3 py-1.5 text-left text-sm font-semibold ${
                    statusFilter === f.value ? 'bg-primary text-bg' : 'text-text-muted hover:text-text'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </Card>
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search attendee..."
                className="w-full rounded-lg border border-border bg-surface-high py-2 pl-10 pr-3 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:border-primary"
                >
                  <Icon name="chevron_left" className="text-[18px]" />
                </button>
                <span className="text-sm font-bold">
                  {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </span>
                <button
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:border-primary"
                >
                  <Icon name="chevron_right" className="text-[18px]" />
                </button>
                <button onClick={() => setMonth(new Date())} className="text-xs font-bold text-cyan hover:underline">
                  Today
                </button>
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                {(['calendar', 'list'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${
                      view === v ? 'bg-primary text-bg' : 'text-text-muted hover:text-text'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {view === 'calendar' ? (
              <CalendarGrid
                month={month}
                appointments={filtered}
                onDayClick={(date) => setForm((f) => ({ ...f, date }))}
                onChipClick={setSelected}
                onOverflowClick={(_date, hidden) => setSelected(hidden[0])}
              />
            ) : (
              <DataTable
                columns={columns}
                rows={filtered}
                rowKey={(a) => a.id}
                emptyMessage="No appointments in this range yet."
                footer={`Showing ${filtered.length} of ${appointments.length} appointments`}
              />
            )}
          </div>
        </div>
      </section>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelected(null)}>
          <Card padding="md" className="w-full max-w-sm" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-base font-bold">{selected.name}</p>
                <p className="text-sm text-text-muted">{selected.phone}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-text-muted hover:text-text">
                <Icon name="close" className="text-[20px]" />
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-1 text-sm">
              <span>{selected.date} · {formatTime12h(selected.time)} ({selected.durationMinutes} min)</span>
              {selected.purpose && <span className="text-text-muted">{selected.purpose}</span>}
              <span className={`mt-1 w-fit rounded border px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLES[selected.status]}`}>
                {selected.status.replace('_', ' ')}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => handleStatus(selected.id, 'completed')}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:border-primary"
              >
                Mark Completed
              </button>
              <button
                onClick={() => handleStatus(selected.id, 'no_show')}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:border-primary"
              >
                Mark No-show
              </button>
              <button
                onClick={() => handleStatus(selected.id, 'cancelled')}
                className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const newDate = prompt('New date (YYYY-MM-DD)', selected.date)
                  const newTime = newDate ? prompt('New time (HH:MM)', selected.time) : null
                  if (newDate && newTime) {
                    await rescheduleAppointment(selected.id, newDate, newTime)
                    setSelected(null)
                    reload()
                  }
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:border-primary"
              >
                Reschedule
              </button>
            </div>
          </Card>
        </div>
      )}
    </DashboardLayout>
  )
}
