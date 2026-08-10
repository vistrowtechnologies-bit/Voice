import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { Card } from '../components/ui/Card'
import { SectionCard } from '../components/ui/SectionCard'
import {
  createInboundRoute,
  deleteInboundRoute,
  fetchAgents,
  fetchInboundRoutes,
  fetchPhoneNumbers,
  updateInboundRoute,
} from '../lib/api'
import type { AgentConfig, InboundRoute, PhoneNumber } from '../lib/types'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function Inbound() {
  const [routes, setRoutes] = useState<InboundRoute[]>([])
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [numbers, setNumbers] = useState<PhoneNumber[]>([])
  const [phoneNumber, setPhoneNumber] = useState('')
  const [agentId, setAgentId] = useState<number | ''>('')
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [maxConcurrent, setMaxConcurrent] = useState(1)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [windowStart, setWindowStart] = useState('')
  const [windowEnd, setWindowEnd] = useState('')
  const [activeDays, setActiveDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
  // Non-null while editing an existing saved route instead of creating a
  // new one - the same form doubles as the edit form, submit just calls a
  // different endpoint depending on which mode this is.
  const [editingRouteId, setEditingRouteId] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const reload = () => fetchInboundRoutes().then(setRoutes).catch(() => setRoutes([]))

  useEffect(() => {
    reload()
    fetchAgents().then(setAgents).catch(() => setAgents([]))
    fetchPhoneNumbers().then(setNumbers).catch(() => setNumbers([]))
  }, [])

  const toggleDay = (d: string) =>
    setActiveDays((days) => (days.includes(d) ? days.filter((x) => x !== d) : [...days, d]))

  const resetForm = () => {
    setEditingRouteId(null)
    setPhoneNumber('')
    setAgentId('')
    setTimezone('Asia/Kolkata')
    setMaxConcurrent(1)
    setStartDate('')
    setEndDate('')
    setWindowStart('')
    setWindowEnd('')
    setActiveDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
    setFormError(null)
  }

  const handleEdit = (route: InboundRoute) => {
    setEditingRouteId(route.id)
    setPhoneNumber(route.phone_number || '')
    setAgentId(route.agent_id || '')
    setTimezone(route.timezone || 'Asia/Kolkata')
    setMaxConcurrent(route.max_concurrent || 1)
    setStartDate(route.start_date || '')
    setEndDate(route.end_date || '')
    setWindowStart(route.window_start || '')
    setWindowEnd(route.window_end || '')
    setActiveDays(route.active_days ? route.active_days.split(',').filter(Boolean) : [])
    setFormError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async () => {
    setSaving(true)
    setFormError(null)
    const payload = {
      phoneNumber: phoneNumber || null,
      agentId: agentId || null,
      timezone,
      maxConcurrent,
      startDate: startDate || null,
      endDate: endDate || null,
      windowStart: windowStart || null,
      windowEnd: windowEnd || null,
      activeDays,
    }
    try {
      if (editingRouteId) {
        await updateInboundRoute(editingRouteId, payload)
      } else {
        await createInboundRoute(payload)
      }
      resetForm()
      reload()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save this route.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (routeId: number) => {
    if (!confirm('Delete this inbound route? Calls to this number will stop routing to its agent immediately.')) return
    await deleteInboundRoute(routeId)
    if (editingRouteId === routeId) resetForm()
    reload()
  }

  // A number that already has a saved route can't be picked for a NEW
  // route (that's exactly how one number ended up routing to two
  // different agents at once, reported live) - still shown while editing
  // that same route, since it's not a duplicate against itself.
  const takenNumbers = new Set(
    routes.filter((r) => r.id !== editingRouteId && r.phone_number).map((r) => r.phone_number),
  )
  const availableNumbers = numbers.filter((n) => !takenNumbers.has(n.number))

  return (
    <DashboardLayout>
      <PageHeader title="Inbound Calls" subtitle="Manage inbound call routing and dispatch rules" />

      <section className="flex flex-col gap-4 p-4 sm:p-6">
        <Card>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan/20 text-cyan">
              <Icon name="phone_callback" className="text-[20px]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">{editingRouteId ? 'Edit Route' : 'Inbound Campaign'}</h2>
              <p className="text-xs text-text-muted">
                {editingRouteId
                  ? 'Update this number\'s routing, schedule, or agent.'
                  : 'Link a phone number to an AI agent - all calls to that number will be handled automatically.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Field label="Incoming calls to">
              {numbers.length > 0 ? (
                <>
                  <select
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm"
                  >
                    <option value="">Select a number</option>
                    {availableNumbers.map((n) => (
                      <option key={n.id} value={n.number}>
                        {n.number}
                        {n.label ? ` · ${n.label}` : ''}
                      </option>
                    ))}
                  </select>
                  {!editingRouteId && availableNumbers.length === 0 && (
                    <p className="mt-1 text-[11px] text-text-muted">
                      Every number already has a route - edit an existing one below instead.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-high px-3 py-2 text-sm text-text-muted">
                    <Icon name="dialpad" className="text-[16px]" />
                    No numbers
                  </div>
                  <p className="mt-1 text-[11px] text-destructive">
                    No phone numbers -{' '}
                    <Link to="/dashboard/numbers" className="underline">
                      connect EnableX &amp; add a number first
                    </Link>
                  </p>
                </>
              )}
            </Field>
            <Field label="Routed to agent">
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm"
              >
                <option value="">Select agent</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.status})
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-4 rounded-lg border border-border p-4">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-text-muted">
              <Icon name="event" className="text-[15px]" />
              Schedule &amp; Rules
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Timezone">
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm"
                >
                  <option>Asia/Kolkata</option>
                  <option>Asia/Dubai</option>
                  <option>UTC</option>
                </select>
              </Field>
              <Field label={`Max concurrent calls (1–5)`}>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={maxConcurrent}
                  onChange={(e) => setMaxConcurrent(Math.min(5, Math.max(1, Number(e.target.value))))}
                  className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Start date">
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm" />
              </Field>
              <Field label="End date">
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm" />
              </Field>
              <Field label="Call window start">
                <input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm" />
              </Field>
              <Field label="Call window end">
                <input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm" />
              </Field>
            </div>
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">Active days</p>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    onClick={() => toggleDay(d)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                      activeDays.includes(d)
                        ? 'border-cyan/40 bg-cyan/10 text-cyan'
                        : 'border-border text-text-muted hover:border-primary'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-text-muted">Leave call window blank to allow calls at any time.</p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <p className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <Icon name="verified_user" className="text-[15px] text-cyan" />
                {editingRouteId ? 'Changes apply immediately.' : 'Route becomes live immediately after creation.'}
              </p>
              {formError && <p className="text-[11px] font-semibold text-destructive">{formError}</p>}
            </div>
            <div className="flex items-center gap-2">
              {editingRouteId && (
                <button
                  onClick={resetForm}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-bold text-text-muted hover:bg-surface-high"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSubmit}
                disabled={!agentId || !phoneNumber || saving}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg disabled:opacity-40"
              >
                <Icon name={editingRouteId ? 'save' : 'add'} className="text-[18px]" />
                {saving ? 'Saving...' : editingRouteId ? 'Update Route' : 'Create Route'}
              </button>
            </div>
          </div>
        </Card>

        {routes.length > 0 && (
          <SectionCard title={`Saved routes (${routes.length})`}>
            <div className="divide-y divide-border">
              {routes.map((r) => (
                <div
                  key={r.id}
                  className={`flex flex-wrap items-center gap-3 px-5 py-3 text-sm ${
                    editingRouteId === r.id ? 'bg-primary/5' : ''
                  }`}
                >
                  <Icon name="phone_callback" className="text-[18px] text-cyan" />
                  <span className="font-semibold">{r.phone_number ?? 'No number yet'}</span>
                  <span className="text-text-muted">→ {agents.find((a) => a.id === r.agent_id)?.name ?? 'Unassigned'}</span>
                  <span className="text-[11px] text-text-muted">{r.active_days} · {r.window_start || 'any'}–{r.window_end || 'any'} · max {r.max_concurrent}</span>
                  <span className={`ml-auto rounded border px-2 py-0.5 text-[11px] font-semibold ${r.phone_number ? 'border-cyan/30 bg-cyan/10 text-cyan' : 'border-amber/30 bg-amber/10 text-amber'}`}>
                    {r.phone_number ? 'active' : 'waiting for number'}
                  </span>
                  <button
                    onClick={() => handleEdit(r)}
                    aria-label="Edit route"
                    className="text-text-muted hover:text-primary"
                  >
                    <Icon name="edit" className="text-[18px]" />
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    aria-label="Delete route"
                    className="text-text-muted hover:text-destructive"
                  >
                    <Icon name="delete" className="text-[18px]" />
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>
        )}
      </section>
    </DashboardLayout>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-text-muted">{label}</p>
      {children}
    </div>
  )
}
