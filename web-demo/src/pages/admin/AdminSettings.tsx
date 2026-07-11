import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminHealth, PLAN_PRICING_REF, CREDIT_RATES_REF, type AdminHealth } from '../../lib/adminApi'
import { AdminCard, fmtINR, PageHeader } from '../../components/AdminUI'
import { Icon } from '../../components/Icon'

export function AdminSettings() {
  const [health, setHealth] = useState<AdminHealth | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    adminHealth().then(setHealth).catch(() => setHealth(null))
  }, [])

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
