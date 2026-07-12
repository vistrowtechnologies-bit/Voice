import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import {
  addDnc,
  bulkAddDnc,
  fetchCompliance,
  fetchDnc,
  removeDnc,
  updateCompliance,
  type ComplianceSettings,
  type DncEntry,
} from '../lib/api'
import { hasRole, useAuth } from '../lib/auth'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'UTC']

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <div>
        <p className="text-base font-bold">{title}</p>
        <p className="text-xs text-text-muted">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        on ? 'bg-primary' : 'bg-surface-high'
      }`}
      aria-pressed={on}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
          on ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        {hint && <p className="text-xs text-text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

export function Compliance() {
  const { user } = useAuth()
  const canManage = hasRole(user, 'admin')

  const [cfg, setCfg] = useState<ComplianceSettings | null>(null)
  const [dnc, setDnc] = useState<DncEntry[]>([])
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(false)
  const [dncPhone, setDncPhone] = useState('')
  const [dncReason, setDncReason] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const reloadDnc = () => fetchDnc().then(setDnc).catch(() => setDnc([]))

  useEffect(() => {
    fetchCompliance().then(setCfg).catch(() => setCfg(null))
    reloadDnc()
  }, [])

  const patch = (p: Partial<ComplianceSettings>) => setCfg((c) => (c ? { ...c, ...p } : c))

  const toggleDay = (day: string) => {
    if (!cfg) return
    const has = cfg.active_days.includes(day)
    patch({ active_days: has ? cfg.active_days.filter((d) => d !== day) : [...cfg.active_days, day] })
  }

  const save = async () => {
    if (!cfg) return
    setSaving(true)
    try {
      const updated = await updateCompliance(cfg)
      setCfg(updated)
      setSavedAt(true)
      setTimeout(() => setSavedAt(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const submitDnc = async () => {
    if (!dncPhone.trim()) return
    const res = await addDnc(dncPhone.trim(), dncReason.trim())
    setMsg(res.added ? `Added ${dncPhone.trim()} to Do-Not-Call.` : `${dncPhone.trim()} was already blocked.`)
    setDncPhone('')
    setDncReason('')
    reloadDnc()
    setTimeout(() => setMsg(null), 3000)
  }

  const submitBulk = async () => {
    if (!bulkText.trim()) return
    const res = await bulkAddDnc(bulkText)
    setMsg(`Imported ${res.added} new number${res.added === 1 ? '' : 's'} (${res.total - res.added} already blocked).`)
    setBulkText('')
    setBulkOpen(false)
    reloadDnc()
    setTimeout(() => setMsg(null), 4000)
  }

  const filteredDnc = useMemo(() => {
    if (!search) return dnc
    return dnc.filter((d) => d.phone.includes(search) || d.reason.toLowerCase().includes(search.toLowerCase()))
  }, [dnc, search])

  return (
    <DashboardLayout>
      <PageHeader title="Compliance" subtitle="Calling rules, consent, and your Do-Not-Call registry">
        {canManage && (
          <button
            onClick={save}
            disabled={saving || !cfg}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
          >
            {savedAt ? <Icon name="check" className="text-[16px]" /> : <Icon name="save" className="text-[16px]" />}
            {savedAt ? 'Saved' : saving ? 'Saving…' : 'Save rules'}
          </button>
        )}
      </PageHeader>

      <section className="grid max-w-5xl gap-4 p-4 sm:p-6 lg:grid-cols-2">
        {!cfg ? (
          <div className="col-span-full flex justify-center py-16">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            {!canManage && (
              <div className="col-span-full flex items-center gap-2 rounded-lg border-l-[3px] border-amber bg-surface-high px-3 py-2 text-sm text-text-muted">
                <Icon name="lock" className="text-[16px] text-amber" />
                You have view-only access. Ask an admin to change compliance rules.
              </div>
            )}

            <Card title="Calling window" subtitle="TRAI norms limit unsolicited calls to 9am–9pm, Mon–Sat. Dials outside this window are blocked automatically.">
              <Row label="Enforce calling window" hint="Block outbound dials outside the hours/days below">
                <Toggle on={cfg.enforce_window} onChange={(v) => patch({ enforce_window: v })} disabled={!canManage} />
              </Row>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-text-muted">Start</span>
                  <input
                    type="time"
                    value={cfg.window_start}
                    disabled={!canManage || !cfg.enforce_window}
                    onChange={(e) => patch({ window_start: e.target.value })}
                    className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-text-muted">End</span>
                  <input
                    type="time"
                    value={cfg.window_end}
                    disabled={!canManage || !cfg.enforce_window}
                    onChange={(e) => patch({ window_end: e.target.value })}
                    className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                  />
                </label>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-text-muted">Allowed days</span>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS.map((d) => {
                    const on = cfg.active_days.includes(d)
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={!canManage || !cfg.enforce_window}
                        onClick={() => toggleDay(d)}
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
                          on ? 'bg-primary text-bg' : 'bg-surface-high text-text-muted hover:text-text'
                        }`}
                      >
                        {d}
                      </button>
                    )
                  })}
                </div>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-muted">Timezone (callee's local time)</span>
                <select
                  value={cfg.timezone}
                  disabled={!canManage || !cfg.enforce_window}
                  onChange={(e) => patch({ timezone: e.target.value })}
                  className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </label>
            </Card>

            <Card title="Consent, recording & retention" subtitle="Controls that keep you on the right side of DPDP and telecom consent rules.">
              <Row label="Honor Do-Not-Call list" hint="Never dial a number on your DNC registry">
                <Toggle on={cfg.honor_dnc} onChange={(v) => patch({ honor_dnc: v })} disabled={!canManage} />
              </Row>
              <Row label="Require spoken consent" hint="Agent opens with a consent line and logs the reply">
                <Toggle on={cfg.require_consent} onChange={(v) => patch({ require_consent: v })} disabled={!canManage} />
              </Row>
              <Row label="Record calls" hint="Store call audio alongside transcripts">
                <Toggle on={cfg.record_calls} onChange={(v) => patch({ record_calls: v })} disabled={!canManage} />
              </Row>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-muted">Data retention (days)</span>
                <input
                  type="number"
                  min={0}
                  value={cfg.retention_days}
                  disabled={!canManage}
                  onChange={(e) => patch({ retention_days: Math.max(0, Number(e.target.value) || 0) })}
                  className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                />
                <span className="text-xs text-text-muted">0 = keep indefinitely. Otherwise transcripts older than this are purged.</span>
              </label>
            </Card>

            <Card title="Do-Not-Call registry" subtitle={`${dnc.length} number${dnc.length === 1 ? '' : 's'} blocked. Every outbound dial is scrubbed against this list first.`}>
              {msg && (
                <div className="flex items-center gap-2 rounded-lg border-l-[3px] border-success bg-surface-high px-3 py-2 text-sm text-text">
                  <Icon name="check_circle" className="text-[16px] text-success" />
                  {msg}
                </div>
              )}
              {canManage && (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input
                      value={dncPhone}
                      onChange={(e) => setDncPhone(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitDnc()}
                      placeholder="Phone number"
                      className="flex-1 rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <button
                      onClick={submitDnc}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.99]"
                    >
                      Block
                    </button>
                  </div>
                  <input
                    value={dncReason}
                    onChange={(e) => setDncReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => setBulkOpen((v) => !v)}
                    className="self-start text-xs font-semibold text-cyan hover:underline"
                  >
                    {bulkOpen ? 'Cancel bulk import' : 'Bulk import numbers'}
                  </button>
                  {bulkOpen && (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={bulkText}
                        onChange={(e) => setBulkText(e.target.value)}
                        rows={4}
                        placeholder="Paste numbers — one per line or comma-separated"
                        className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                      <button
                        onClick={submitBulk}
                        className="self-start rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg transition-all hover:opacity-90 active:scale-[0.99]"
                      >
                        Import
                      </button>
                    </div>
                  )}
                </div>
              )}
              {dnc.length > 0 && (
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search blocked numbers"
                  className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
                />
              )}
              <div className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {filteredDnc.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-text-muted">
                    {dnc.length === 0 ? 'No blocked numbers yet.' : 'No matches.'}
                  </div>
                ) : (
                  filteredDnc.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{d.phone}</p>
                        <p className="truncate text-xs text-text-muted">
                          {d.reason || 'No reason'} · {d.source}
                        </p>
                      </div>
                      {canManage && (
                        <button
                          onClick={() => removeDnc(d.id).then(reloadDnc)}
                          aria-label="Remove"
                          className="text-text-muted transition-colors hover:text-destructive"
                        >
                          <Icon name="delete" className="text-[17px]" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </Card>
          </>
        )}
      </section>
    </DashboardLayout>
  )
}
