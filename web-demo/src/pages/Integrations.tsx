import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { IntegrationLogo } from '../components/IntegrationLogo'
import { Card } from '../components/ui/Card'
import { fetchIntegrations, fetchLeadWebhook, formatRelativeTime } from '../lib/api'
import type { Integration } from '../lib/types'
import { StatusPill, integrationSummary, utcTime } from '../components/IntegrationBits'

// The API returns integrations in undefined DB row order - pin a deliberate
// display order instead (ArthaLeads first, since it's the flagship CRM;
// Facebook right after it since it's a lead SOURCE, not a delivery target
// like the rest of this list) rather than leaving card position to chance.
const DISPLAY_ORDER = ['arthaleads', 'zoho_crm', 'facebook', 'webhook', 'slack', 'whatsapp', 'sheets']
const sortIntegrations = (list: Integration[]) =>
  [...list].sort((a, b) => DISPLAY_ORDER.indexOf(a.key) - DISPLAY_ORDER.indexOf(b.key))

export function Integrations() {
  const [integrations, setIntegrations] = useState<Integration[] | null>(null)
  const [leadWebhookUrl, setLeadWebhookUrl] = useState<string | null | undefined>(undefined)
  const [leadWebhookShown, setLeadWebhookShown] = useState(false)
  const [leadWebhookCopied, setLeadWebhookCopied] = useState(false)

  useEffect(() => {
    fetchIntegrations().then((list) => setIntegrations(sortIntegrations(list))).catch(() => setIntegrations([]))
    fetchLeadWebhook().then((r) => setLeadWebhookUrl(r.url)).catch(() => setLeadWebhookUrl(null))
  }, [])

  const copyLeadWebhook = async () => {
    if (!leadWebhookUrl) return
    await navigator.clipboard.writeText(leadWebhookUrl)
    setLeadWebhookCopied(true)
    setTimeout(() => setLeadWebhookCopied(false), 1500)
  }

  const list = integrations ?? []
  const connected = list.filter((i) => i.status === 'connected').length
  const failing = list.filter((i) => i.status === 'connected' && i.lastError).length

  return (
    <DashboardLayout>
      <PageHeader title="Integrations" subtitle="Connect and manage external tools that power your agents" />

      <section className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard icon="link" label="Connected Integrations" value={String(connected)} hint={connected === 0 ? 'None connected' : 'live and syncing'} />
          <StatCard icon="apps" label="Available Integrations" value={String(list.length)} hint="Open one to set it up" />
          <StatCard
            icon={failing ? 'error' : 'monitoring'}
            label="Sync Status"
            value={failing ? `${failing} need attention` : connected > 0 ? 'Live' : 'Idle'}
            hint={failing ? 'open the integration to see why' : connected > 0 ? 'events push in real time' : 'No integrations connected yet'}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {integrations === null && <p className="text-xs text-text-muted">Loading integrations…</p>}
          {list.map((integration) => {
            const isConnected = integration.status === 'connected'
            return (
              <Link
                key={integration.key}
                to={`/dashboard/integrations/${integration.key}`}
                className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Open ${integration.name}`}
              >
                <Card className="flex h-full flex-col transition-colors group-hover:border-primary/60">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <IntegrationLogo integrationKey={integration.key} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{integration.name}</p>
                        <p className="text-[11px] text-text-muted">{integration.category}</p>
                      </div>
                    </div>
                    <StatusPill connected={isConnected} />
                  </div>
                  <p className="mb-4 text-xs text-text-muted">{integration.description}</p>
                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3 text-xs">
                    {isConnected && integration.lastError ? (
                      <span className="flex min-w-0 items-center gap-1 font-semibold text-destructive">
                        <Icon name="error" className="shrink-0 text-[14px]" />
                        <span className="truncate">Last delivery failed</span>
                      </span>
                    ) : (
                      <span className="min-w-0 truncate text-text-muted">
                        {isConnected
                          ? integration.lastSync
                            ? `Last delivery ${formatRelativeTime(utcTime(integration.lastSync))} · ${integrationSummary(integration)}`
                            : integrationSummary(integration)
                          : 'Not set up yet'}
                      </span>
                    )}
                    <span className="flex shrink-0 items-center gap-1 font-bold text-primary">
                      {isConnected ? 'Manage' : 'Set up'}
                      <Icon name="arrow_forward" className="text-[15px] transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>

        <Card>
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <Icon name="bolt" className="text-[20px]" />
            </div>
            <div>
              <p className="font-semibold">Instant Lead Follow-up</p>
              <p className="text-[11px] text-text-muted">Call a new lead within minutes of it arriving</p>
            </div>
          </div>
          <p className="mb-4 text-xs text-text-muted">
            POST a lead to this URL and it's queued for a call within about 15-30 seconds - no dashboard action
            needed. Works with Facebook Lead Ads via a Zapier "Webhooks by Zapier" step (its native "New Lead"
            trigger needs no approval process on our end), or any other source that can send a webhook. Every
            queued call still goes through your compliance settings - DNC and calling-window rules apply exactly
            as they do for a regular campaign.
          </p>
          {leadWebhookUrl === undefined ? (
            <p className="text-xs text-text-muted">Loading…</p>
          ) : leadWebhookUrl === null ? (
            <p className="text-xs text-text-muted">Not available in this environment.</p>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-high/40 p-3 text-xs">
              <span className="flex-1 truncate font-mono">
                {leadWebhookShown ? leadWebhookUrl : `${leadWebhookUrl.split('?')[0]}?token=${'•'.repeat(20)}`}
              </span>
              <button
                onClick={() => setLeadWebhookShown((v) => !v)}
                className="shrink-0 text-text-muted hover:text-text"
                aria-label={leadWebhookShown ? 'Hide webhook URL' : 'Show webhook URL'}
              >
                <Icon name={leadWebhookShown ? 'visibility_off' : 'visibility'} className="text-[15px]" />
              </button>
              <button onClick={copyLeadWebhook} className="shrink-0 text-text-muted hover:text-text" aria-label="Copy webhook URL">
                <Icon name={leadWebhookCopied ? 'check' : 'content_copy'} className="text-[15px]" />
              </button>
            </div>
          )}
        </Card>
      </section>
    </DashboardLayout>
  )
}

function StatCard({ icon, label, value, hint }: { icon: string; label: string; value: string; hint: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 text-primary">
        <Icon name={icon} className="text-[20px]" />
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">{label}</p>
        <p className="text-lg font-bold">{value}</p>
        <p className="text-[11px] text-text-muted">{hint}</p>
      </div>
    </div>
  )
}
