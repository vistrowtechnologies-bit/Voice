import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { Card } from '../ui/Card'
import { checkAppointmentAvailability, createAppointment, formatTime12h, rescheduleAppointment } from '../../lib/api'
import type { Appointment } from '../../lib/types'

export interface ModalState {
  mode: 'create' | 'reschedule'
  date?: string
  time?: string
  appt?: Appointment
}

const DURATIONS = ['15', '30', '45', '60', '90']
const field = 'w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm text-text outline-none focus:border-primary'

/**
 * New appointment, or reschedule an existing one. Open times for the chosen day and length come
 * from the workspace's availability; "Another time" is there for a slot the grid does not offer
 * and is checked by the server.
 */
export function AppointmentModal({ state, onClose, onDone }: { state: ModalState; onClose: () => void; onDone: () => void }) {
  const reschedule = state.mode === 'reschedule'
  const a = state.appt
  const [form, setForm] = useState({
    name: a?.name ?? '',
    phone: a?.phone ?? '',
    email: a?.email ?? '',
    purpose: a?.purpose ?? '',
    notes: a?.notes ?? '',
    date: state.date ?? a?.date ?? '',
    time: state.time ?? '',
    duration: String(a?.durationMinutes ?? 30),
  })
  const [slots, setSlots] = useState<string[] | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [custom, setCustom] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const first = useRef<HTMLInputElement>(null)

  useEffect(() => { first.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!form.date) { setSlots(null); return }
    let cancelled = false
    setLoadingSlots(true)
    checkAppointmentAvailability(form.date, Number(form.duration) || 30)
      .then((r) => { if (!cancelled) setSlots(r.slots) })
      .catch(() => { if (!cancelled) setSlots([]) })
      .finally(() => { if (!cancelled) setLoadingSlots(false) })
    return () => { cancelled = true }
  }, [form.date, form.duration])

  const set = (k: keyof typeof form, v: string) => { setForm((f) => ({ ...f, [k]: v })); setError('') }
  const canSave = Boolean(form.date && form.time && (reschedule || form.name.trim() || form.phone.trim()))

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    setError('')
    try {
      if (reschedule && a) await rescheduleAppointment(a.id, form.date, form.time)
      else
        await createAppointment({
          name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), purpose: form.purpose.trim(),
          notes: form.notes.trim(), date: form.date, time: form.time, durationMinutes: Number(form.duration) || 30,
        })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this appointment.')
    } finally {
      setSaving(false)
    }
  }

  const lab = 'flex flex-col gap-1 text-xs font-semibold text-text-muted'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={reschedule ? 'Reschedule appointment' : 'New appointment'}>
      <Card padding="sm" className="flex max-h-[92vh] w-full max-w-xl flex-col bg-surface shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{reschedule ? 'Reschedule appointment' : 'New appointment'}</h2>
            <p className="text-xs text-text-muted">
              {reschedule ? `${a?.name || a?.phone || 'This appointment'} will move to the new time.` : 'Pick a day and an open time. Name or phone is enough.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-2 text-text-muted hover:bg-surface-high hover:text-text"><Icon name="close" /></button>
        </div>

        <div className="-mx-2 flex-1 overflow-y-auto px-2 py-1">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {!reschedule && (
              <>
                <label className={lab}>Name<input ref={first} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Full name" className={field} /></label>
                <label className={lab}>Phone<input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 98123 45678" className={field} /></label>
                <label className={lab}>Email<input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@example.com" className={field} /></label>
                <label className={lab}>Purpose<input value={form.purpose} onChange={(e) => set('purpose', e.target.value)} placeholder="Site visit, demo, follow-up…" className={field} /></label>
              </>
            )}
            <label className={lab}>Date<input ref={reschedule ? first : undefined} type="date" value={form.date} onChange={(e) => { set('date', e.target.value); set('time', '') }} className={field} /></label>
            <label className={lab}>
              Length
              <select value={form.duration} onChange={(e) => { set('duration', e.target.value); set('time', '') }} disabled={reschedule} className={field}>
                {DURATIONS.map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
            </label>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-text-muted">Time</span>
              <button type="button" onClick={() => setCustom((c) => !c)} className="text-xs font-semibold text-primary hover:underline">
                {custom ? 'Pick from open times' : 'Another time'}
              </button>
            </div>
            {custom ? (
              <input type="time" value={form.time} onChange={(e) => set('time', e.target.value)} aria-label="Start time" className={`${field} sm:w-40`} />
            ) : !form.date ? (
              <p className="text-sm text-text-muted">Choose a date to see open times.</p>
            ) : loadingSlots ? (
              <p className="text-sm text-text-muted">Checking availability…</p>
            ) : slots && slots.length === 0 ? (
              <p className="text-sm text-text-muted">No open times on this day. Try another date, or use “Another time”.</p>
            ) : (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Open times">
                {(slots ?? []).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={form.time === s}
                    onClick={() => set('time', s)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      form.time === s ? 'border-primary bg-primary text-bg' : 'border-border bg-surface text-text hover:border-primary'
                    }`}
                  >
                    {formatTime12h(s)}
                  </button>
                ))}
              </div>
            )}
            {form.time && custom && <p className="mt-1 text-xs text-text-muted">Starts at {formatTime12h(form.time)}.</p>}
          </div>

          {!reschedule && (
            <label className={`${lab} mt-4`}>
              Notes
              <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} placeholder="Anything the person taking it should know" className={field} />
            </label>
          )}
          {error && <p role="alert" className="mt-3 text-sm font-semibold text-destructive">{error}</p>}
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-muted hover:text-text">Cancel</button>
          <button type="button" onClick={save} disabled={!canSave || saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-50">
            {saving ? 'Saving…' : reschedule ? 'Move appointment' : 'Save appointment'}
          </button>
        </div>
      </Card>
    </div>
  )
}
