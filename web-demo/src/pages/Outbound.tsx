import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { createCampaign, fetchAgents, fetchCampaigns, updateCampaignStatus } from '../lib/api'
import type { AgentConfig, Campaign } from '../lib/types'

const FILTERS = ['All', 'Active', 'Scheduled', 'Paused']

export function Outbound() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [filter, setFilter] = useState('All')
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: '', agentId: '' as number | '', contactTag: '', scheduledDate: '', windowStart: '', windowEnd: '' })

  const reload = () => fetchCampaigns().then(setCampaigns).catch(() => setCampaigns([]))

  useEffect(() => {
    reload()
    fetchAgents().then(setAgents).catch(() => setAgents([]))
  }, [])

  const filtered = useMemo(
    () => (filter === 'All' ? campaigns : campaigns.filter((c) => c.status === filter.toLowerCase())),
    [campaigns, filter],
  )

  const handleCreate = async () => {
    if (!form.name.trim()) return
    await createCampaign({
      name: form.name.trim(),
      agentId: form.agentId || null,
      contactTag: form.contactTag,
      scheduledDate: form.scheduledDate || null,
      windowStart: form.windowStart || null,
      windowEnd: form.windowEnd || null,
    })
    setShowNew(false)
    setForm({ name: '', agentId: '', contactTag: '', scheduledDate: '', windowStart: '', windowEnd: '' })
    reload()
  }

  return (
    <DashboardLayout>
      <PageHeader title="Outbound Campaigns" subtitle={`${campaigns.length} total campaigns`} />

      <section className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="rounded-lg border border-amber/30 bg-amber/5 px-4 py-3 text-xs text-amber">
          <Icon name="warning" className="mr-1.5 align-[-3px] text-[15px]" />
          Outbound dialing needs a connected phone number — campaigns save now and start dialing once
          telephony is set up (Phone Numbers page).
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="Total Calls" value={0} />
          <StatCard label="Running Calls" value={0} tone="text-cyan" />
          <StatCard label="Avg Success" value="0%" tone="text-cyan" />
          <StatCard label="Active" value={campaigns.filter((c) => c.status === 'active').length} />
          <StatCard label="Scheduled" value={campaigns.filter((c) => c.status === 'scheduled').length} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  filter === f ? 'bg-primary text-bg' : 'text-text-muted hover:text-text'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <button
            onClick={() => setShowNew((v) => !v)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90"
          >
            <Icon name="add" className="text-[18px]" />
            New Campaign
          </button>
        </div>

        {showNew && (
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-primary/40 bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Campaign name"
              className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <select
              value={form.agentId}
              onChange={(e) => setForm({ ...form, agentId: e.target.value ? Number(e.target.value) : '' })}
              className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm"
            >
              <option value="">Select agent</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <input
              value={form.contactTag}
              onChange={(e) => setForm({ ...form, contactTag: e.target.value })}
              placeholder="Contact tag to dial (blank = all contacts)"
              className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm" />
            <div className="flex items-center gap-2">
              <input type="time" value={form.windowStart} onChange={(e) => setForm({ ...form, windowStart: e.target.value })} className="flex-1 rounded-lg border border-border bg-surface-high px-3 py-2 text-sm" />
              <span className="text-text-muted">–</span>
              <input type="time" value={form.windowEnd} onChange={(e) => setForm({ ...form, windowEnd: e.target.value })} className="flex-1 rounded-lg border border-border bg-surface-high px-3 py-2 text-sm" />
            </div>
            <button onClick={handleCreate} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90">
              Save campaign
            </button>
          </div>
        )}

        <div className="rounded-xl border border-border bg-surface">
          {filtered.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-text-muted">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-high">
                <Icon name="campaign" className="text-[26px]" />
              </div>
              <p className="text-sm font-bold">No campaigns found</p>
              <p className="text-xs">Create your first outbound campaign to start dialing your contact list.</p>
              <button
                onClick={() => setShowNew(true)}
                className="mt-1 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90"
              >
                Create first campaign
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20 text-primary">
                    <Icon name="campaign" className="text-[18px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{c.name}</p>
                    <p className="text-[11px] text-text-muted">
                      {agents.find((a) => a.id === c.agent_id)?.name ?? 'No agent'} ·{' '}
                      {c.contact_tag ? `tag: ${c.contact_tag}` : 'all contacts'} ·{' '}
                      {c.scheduled_date ?? 'unscheduled'}
                    </p>
                  </div>
                  <span
                    className={`rounded border px-2 py-0.5 text-[11px] font-semibold capitalize ${
                      c.status === 'active'
                        ? 'border-cyan/30 bg-cyan/10 text-cyan'
                        : c.status === 'paused'
                          ? 'border-amber/30 bg-amber/10 text-amber'
                          : 'border-border text-text-muted'
                    }`}
                  >
                    {c.status}
                  </span>
                  <button
                    onClick={() =>
                      updateCampaignStatus(c.id, c.status === 'paused' ? 'scheduled' : 'paused').then(reload)
                    }
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:border-primary"
                  >
                    <Icon name={c.status === 'paused' ? 'play_arrow' : 'pause'} className="text-[15px]" />
                    {c.status === 'paused' ? 'Resume' : 'Pause'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </DashboardLayout>
  )
}

function StatCard({ label, value, tone = 'text-text' }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
    </div>
  )
}
