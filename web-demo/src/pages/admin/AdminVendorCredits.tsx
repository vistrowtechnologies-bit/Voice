import { useEffect, useState } from 'react'
import { AdminCard, EmptyState, PageHeader, Pill, timeAgo } from '../../components/AdminUI'
import { Icon } from '../../components/Icon'
import { adminUpdateVendorCredit, adminVendorCredits, type AdminVendorCredit } from '../../lib/adminApi'

function statusTone(v: AdminVendorCredit): 'suspended' | 'warning' | 'active' | 'neutral' {
  if (v.source === 'live_failed') return 'warning'
  if (v.balance === null) return 'neutral'
  if (v.threshold !== null && v.balance <= v.threshold) return 'suspended'
  return 'active'
}

function statusLabel(v: AdminVendorCredit): string {
  if (v.source === 'live_failed') return 'Live check failed'
  if (v.balance === null) return 'Not set'
  if (v.threshold !== null && v.balance <= v.threshold) return 'Low balance'
  return 'OK'
}

function fmtBalance(v: AdminVendorCredit): string {
  if (v.balance === null) return '—'
  const n = v.balance >= 1000 ? v.balance.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : v.balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })
  return v.unit ? `${n} ${v.unit}` : n
}

export function AdminVendorCredits() {
  const [vendors, setVendors] = useState<AdminVendorCredit[] | null>(null)
  const [error, setError] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)

  const load = () => adminVendorCredits().then((r) => setVendors(r.vendors)).catch(() => setError(true))
  useEffect(() => {
    load()
  }, [])

  if (error) return <EmptyState icon="error" message="Couldn't load vendor credits." />
  if (!vendors) return <div className="h-40 animate-pulse rounded-xl border border-border bg-surface" />

  const lowCount = vendors.filter((v) => statusTone(v) === 'suspended' || statusTone(v) === 'warning').length

  return (
    <>
      <PageHeader
        title="Vendor Credits"
        subtitle="Balances on Vistrow's own upstream vendor accounts — top these up before a live call breaks, not after."
        action={
          lowCount > 0 ? (
            <Pill tone="suspended">
              <Icon name="warning" className="text-[12px]" /> {lowCount} need attention
            </Pill>
          ) : (
            <Pill tone="active">All healthy</Pill>
          )
        }
      />

      <AdminCard className="overflow-hidden">
        <div className="grid grid-cols-[1.4fr_1fr_0.9fr_0.9fr_auto] gap-3 border-b border-border px-5 py-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">
          <span>Vendor</span>
          <span>Balance</span>
          <span>Status</span>
          <span>Last checked</span>
          <span />
        </div>
        <div className="divide-y divide-border/60">
          {vendors.map((v) =>
            editingKey === v.key ? (
              <EditRow
                key={v.key}
                vendor={v}
                onCancel={() => setEditingKey(null)}
                onSaved={(updated) => {
                  setVendors(updated)
                  setEditingKey(null)
                }}
              />
            ) : (
              <div key={v.key} className="grid grid-cols-[1.4fr_1fr_0.9fr_0.9fr_auto] items-center gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold">{v.name}</div>
                  <div className="text-[11px] text-text-muted">{v.category}</div>
                </div>
                <span className="tabular-nums">{fmtBalance(v)}</span>
                <Pill tone={statusTone(v)}>{statusLabel(v)}</Pill>
                <span className="text-xs text-text-muted">
                  {v.mode === 'live' && <Icon name="bolt" className="mr-1 inline text-[13px] text-cyan" />}
                  {timeAgo(v.checkedAt)}
                </span>
                <button
                  onClick={() => setEditingKey(v.key)}
                  className="justify-self-end rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-text-muted transition-colors hover:border-primary hover:text-primary"
                >
                  Edit
                </button>
              </div>
            ),
          )}
        </div>
      </AdminCard>
    </>
  )
}

function EditRow({
  vendor,
  onCancel,
  onSaved,
}: {
  vendor: AdminVendorCredit
  onCancel: () => void
  onSaved: (vendors: AdminVendorCredit[]) => void
}) {
  const [balance, setBalance] = useState(vendor.balance === null ? '' : String(vendor.balance))
  const [unit, setUnit] = useState(vendor.unit)
  const [threshold, setThreshold] = useState(vendor.threshold === null ? '' : String(vendor.threshold))
  const [notes, setNotes] = useState(vendor.notes)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const result = await adminUpdateVendorCredit(vendor.key, {
        balance: balance.trim() === '' ? null : Number(balance),
        unit: unit.trim(),
        threshold: threshold.trim() === '' ? null : Number(threshold),
        notes,
      })
      onSaved(result.vendors)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 bg-surface-high/30 px-5 py-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{vendor.name}</div>
          <div className="text-[11px] text-text-muted">{vendor.category}</div>
        </div>
        {vendor.mode === 'live' && (
          <span className="flex items-center gap-1 text-[11px] text-text-muted">
            <Icon name="bolt" className="text-[13px] text-cyan" /> Live-checked — balance/unit refresh automatically; edit threshold/notes here
          </span>
        )}
      </div>
      {vendor.lastError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Last live check failed: {vendor.lastError}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Balance
          <input
            type="number"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            disabled={vendor.mode === 'live'}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Unit
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            disabled={vendor.mode === 'live'}
            placeholder="e.g. USD, credits"
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Low-balance alert below
          <input
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Notes
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. account email, plan"
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary"
          />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-text">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
