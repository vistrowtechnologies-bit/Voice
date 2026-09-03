import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  adminHealth,
  adminOutboundTrunkStatus,
  adminSyncOutboundTrunk,
  PLAN_PRICING_REF,
  CREDIT_RATES_REF,
  type AdminHealth,
  type AdminOutboundTrunkStatus,
} from '../../lib/adminApi'
import { AdminCard, fmtINR, PageHeader } from '../../components/AdminUI'
import { Icon } from '../../components/Icon'

export function AdminSettings() {
  const [health, setHealth] = useState<AdminHealth | null>(null)
  const navigate = useNavigate()

  const [trunk, setTrunk] = useState<AdminOutboundTrunkStatus | null>(null)
  const [trunkAddress, setTrunkAddress] = useState('')
  const [trunkCallerId, setTrunkCallerId] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')

  const loadTrunk = () =>
    adminOutboundTrunkStatus().then((s) => {
      setTrunk(s)
      setTrunkAddress((prev) => prev || s.address || '')
      setTrunkCallerId((prev) => prev || s.callerId || '')
    })

  useEffect(() => {
    adminHealth().then(setHealth).catch(() => setHealth(null))
    loadTrunk().catch(() => setTrunk(null))
  }, [])

  const handleSyncTrunk = async () => {
    if (!trunkAddress.trim() || !trunkCallerId.trim()) return
    setSyncing(true)
    setSyncError('')
    try {
      const s = await adminSyncOutboundTrunk(trunkAddress.trim(), trunkCallerId.trim())
      setTrunk(s)
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Platform-wide configuration reference and integration status." />

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminCard className="overflow-hidden">
          <div className="border-b border-border px-5 py-3 font-display text-base font-semibold">Plan pricing</div>
          <div className="divide-y divide-border/60">
            {Object.entries(PLAN_PRICING_REF).map(([plan, price]) => (
              <div key={plan} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="font-semibold capitalize">{plan}</span>
                <span className="tabular-nums text-text-muted">{price ? `${fmtINR(price)}/mo` : 'Free'}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-border px-5 py-2 text-[11px] text-text-muted">
            Edit prices in <code className="text-primary">admin_db.PLAN_PRICING</code> + the marketing pricing page.
          </div>
        </AdminCard>

        <AdminCard className="overflow-hidden">
          <div className="border-b border-border px-5 py-3 font-display text-base font-semibold">Default credit rates</div>
          <div className="divide-y divide-border/60">
            {Object.entries(CREDIT_RATES_REF).map(([channel, rate]) => (
              <div key={channel} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="font-semibold capitalize">{channel}</span>
                <span className="tabular-nums text-text-muted">{rate}× per minute</span>
              </div>
            ))}
          </div>
          <div className="border-t border-border px-5 py-2 text-[11px] text-text-muted">
            Per-account overrides live on each account's Billing settings.
          </div>
        </AdminCard>
      </div>

      <AdminCard className="mt-4 overflow-hidden">
        <div className="border-b border-border px-5 py-3 font-display text-base font-semibold">Integration & API status</div>
        <div className="grid grid-cols-2 divide-x divide-y divide-border/60 md:grid-cols-4">
          {(health?.apiKeys || []).map((k) => (
            <div key={k.name} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>{k.name}</span>
              {k.configured ? (
                <Icon name="check_circle" className="text-[18px] text-success" />
              ) : (
                <span className="text-xs text-text-muted">not set</span>
              )}
            </div>
          ))}
        </div>
      </AdminCard>

      <AdminCard className="mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="font-display text-base font-semibold">Outbound SIP trunk (EnableX)</div>
          {trunk?.configured ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-success">
              <Icon name="check_circle" className="text-[16px]" /> Configured
            </span>
          ) : (
            <span className="text-xs font-semibold text-text-muted">Not configured</span>
          )}
        </div>
        <div className="flex flex-col gap-3 p-5">
          <p className="text-sm text-text-muted">
            The bare host/IP EnableX gives us for their SBC, plus the E.164 number we place outbound calls
            from. Once set, this creates or resyncs the shared LiveKit outbound trunk — no deploy needed.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
              SBC address
              <input
                value={trunkAddress}
                onChange={(e) => setTrunkAddress(e.target.value)}
                placeholder="e.g. 35.234.209.8"
                className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm font-normal text-text outline-none focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
              Caller ID (E.164)
              <input
                value={trunkCallerId}
                onChange={(e) => setTrunkCallerId(e.target.value)}
                placeholder="e.g. +917713128715"
                className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm font-normal text-text outline-none focus:border-primary"
              />
            </label>
          </div>
          {syncError && <div className="text-sm text-danger">{syncError}</div>}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSyncTrunk}
              disabled={syncing || !trunkAddress.trim() || !trunkCallerId.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : trunk?.configured ? 'Update trunk' : 'Create trunk'}
            </button>
            {trunk?.trunkId && <span className="font-mono text-xs text-text-muted">{trunk.trunkId}</span>}
          </div>
        </div>
      </AdminCard>

      <AdminCard className="mt-4 flex items-center justify-between p-5">
        <div>
          <div className="font-display text-base font-semibold">Public demo agent</div>
          <div className="text-sm text-text-muted">Which of your own agents powers the "talk to Artha" demo on the marketing site.</div>
        </div>
        <button onClick={() => navigate('/dashboard/agents')} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:border-primary">
          Manage in Agents
        </button>
      </AdminCard>
    </>
  )
}
