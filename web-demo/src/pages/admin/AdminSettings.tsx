import { useEffect, useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  adminHealth,
  adminOutboundTrunkStatus,
  adminSyncOutboundTrunk,
  adminPricing,
  type AdminHealth,
  type AdminPricing,
  type AdminOutboundTrunkStatus,
} from '../../lib/adminApi'
import { AdminCard, errMsg, ErrorState, fmtINR, PageHeader, useDialog } from '../../components/AdminUI'
import { Icon } from '../../components/Icon'

export function AdminSettings() {
  const [health, setHealth] = useState<AdminHealth | null>(null)
  const [pricing, setPricing] = useState<AdminPricing | null>(null)
  const [pricingError, setPricingError] = useState<string | null>(null)
  const navigate = useNavigate()

  const [trunk, setTrunk] = useState<AdminOutboundTrunkStatus | null>(null)
  const [trunkError, setTrunkError] = useState<string | null>(null)
  const [trunkAddress, setTrunkAddress] = useState('')
  const [trunkCallerId, setTrunkCallerId] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')

  const loadPricing = () => {
    setPricingError(null)
    adminPricing().then(setPricing).catch((e: unknown) => setPricingError(errMsg(e)))
  }

  const loadTrunk = () => {
    setTrunkError(null)
    adminOutboundTrunkStatus()
      .then((s) => {
        setTrunk(s)
        setTrunkAddress((prev) => prev || s.address || '')
        setTrunkCallerId((prev) => prev || s.callerId || '')
      })
      .catch((e: unknown) => {
        setTrunk(null)
        setTrunkError(errMsg(e))
      })
  }

  useEffect(() => {
    adminHealth().then(setHealth).catch(() => setHealth(null))
    loadPricing()
    loadTrunk()
  }, [])

  // Syncing mutates the production LiveKit outbound trunk, so it goes through
  // a confirmation with an audited reason rather than firing on one click.
  const [confirming, setConfirming] = useState(false)

  const handleSyncTrunk = async (reason: string) => {
    if (!trunkAddress.trim() || !trunkCallerId.trim()) return
    setSyncing(true)
    setSyncError('')
    try {
      const s = await adminSyncOutboundTrunk(trunkAddress.trim(), trunkCallerId.trim(), reason)
      setTrunk(s)
      setConfirming(false)
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
        {/* Read from the code that bills (GET /admin/pricing), so it can't drift. */}
        <AdminCard className="overflow-hidden">
          <div className="border-b border-border px-5 py-3 font-display text-base font-semibold">Plan pricing</div>
          {pricingError ? (
            <ErrorState message={`Couldn't load pricing: ${pricingError}`} onRetry={loadPricing} />
          ) : (
            <div className="divide-y divide-border/60">
              {(pricing?.plans || []).map((p) => (
                <div key={p.plan} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="font-semibold capitalize">{p.plan}</span>
                  <span className="tabular-nums text-text-muted">
                    {fmtINR(p.priceInr)}/mo · {p.credits.toLocaleString('en-IN')} credits
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-border px-5 py-2 text-[11px] text-text-muted">
            Source: <code className="text-primary">plan_policy.PLANS</code> (server).
          </div>
        </AdminCard>

        <AdminCard className="overflow-hidden">
          <div className="border-b border-border px-5 py-3 font-display text-base font-semibold">Credit rates per minute</div>
          {pricingError ? (
            <ErrorState message={`Couldn't load rates: ${pricingError}`} onRetry={loadPricing} />
          ) : pricing ? (
            <div className="divide-y divide-border/60 text-sm">
              {([
                ['Channel', pricing.channelRates],
                ['Voice tier', pricing.voiceTiers],
                ['AI model tier', pricing.modelTiers],
              ] as const).map(([label, rates]) => (
                <div key={label} className="px-5 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {Object.entries(rates).map(([k, v]) => (
                      <span key={k} className="tabular-nums">
                        <span className="capitalize">{k.replace(/_/g, ' ')}</span> <span className="text-text-muted">{v}×</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="border-t border-border px-5 py-2 text-[11px] text-text-muted">
            A minute costs channel × voice × model credits, never under {pricing?.minCreditsPerMinute ?? '-'}. Overage bills at{' '}
            {pricing?.overageMultiplier ?? '-'}× the plan's per-credit price.
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
          {trunkError ? (
            <span className="text-xs font-semibold text-destructive">Status unavailable</span>
          ) : trunk?.configured ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-success">
              <Icon name="check_circle" className="text-[16px]" /> Configured
            </span>
          ) : trunk ? (
            <span className="text-xs font-semibold text-text-muted">Not configured</span>
          ) : null}
        </div>
        {/* A failed status check must not look like "no trunk" - that would invite creating a second one. */}
        {trunkError ? (
          <ErrorState message={`Couldn't load the trunk status: ${trunkError}`} onRetry={loadTrunk} />
        ) : !trunk ? (
          <div className="m-5 h-24 animate-pulse rounded-lg bg-surface-high" />
        ) : (
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
          {syncError && !confirming && <div className="text-sm text-destructive">{syncError}</div>}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSyncError('')
                setConfirming(true)
              }}
              disabled={syncing || !trunkAddress.trim() || !trunkCallerId.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : trunk?.configured ? 'Update trunk' : 'Create trunk'}
            </button>
            {trunk?.trunkId && <span className="font-mono text-xs text-text-muted">{trunk.trunkId}</span>}
          </div>
        </div>
        )}
      </AdminCard>

      <AdminCard className="mt-4 flex items-center justify-between p-5">
        <div>
          <div className="font-display text-base font-semibold">Public demo agent</div>
          <div className="text-sm text-text-muted">Which of your own agents powers the "talk to Artha" demo on the marketing site.</div>
        </div>
        <button onClick={() => navigate('/dashboard/agents')} className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold hover:border-primary">
          Manage in Agents
        </button>
      </AdminCard>

      {confirming && (
        <TrunkConfirmModal
          address={trunkAddress.trim()}
          callerId={trunkCallerId.trim()}
          busy={syncing}
          error={syncError}
          onClose={() => setConfirming(false)}
          onConfirm={handleSyncTrunk}
        />
      )}
    </>
  )
}

const MIN_REASON = 5

function TrunkConfirmModal({
  address,
  callerId,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  address: string
  callerId: string
  busy: boolean
  error: string
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const valid = reason.trim().length >= MIN_REASON
  const dialogRef = useDialog(onClose)
  const titleId = useId()
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md">
      <AdminCard className="p-6">
        <h2 id={titleId} className="mb-2 font-display text-lg font-semibold">Sync the production outbound trunk?</h2>
        <p className="text-sm text-text-muted">
          This creates or updates the shared LiveKit outbound trunk used by every tenant's outbound calls, pointing it at{' '}
          <span className="font-mono text-text">{address}</span> with caller ID <span className="font-mono text-text">{callerId}</span>.
        </p>
        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-text-muted">Reason (logged to the audit trail)</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you changing the trunk?"
            className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        {!valid && <p className="mt-1 text-[11px] text-text-muted">At least {MIN_REASON} characters.</p>}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-semibold text-text-muted hover:text-text">
            Cancel
          </button>
          <button
            disabled={busy || !valid}
            onClick={() => onConfirm(reason.trim())}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Syncing…' : 'Sync trunk'}
          </button>
        </div>
      </AdminCard>
      </div>
    </div>

  )
}
