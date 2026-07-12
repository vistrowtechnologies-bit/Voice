import { useEffect, useState } from 'react'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { fetchIntegrations, formatRelativeTime, testIntegration, updateIntegration } from '../lib/api'
import type { Integration } from '../lib/types'
import { hasRole, useAuth } from '../lib/auth'

const ICONS: Record<string, string> = {
  webhook: 'webhook',
  slack: 'forum',
  whatsapp: 'chat',
  sheets: 'table_chart',
  calcom: 'event_available',
}

// Lead-delivery integrations — a qualified lead is POSTed to each connected
// one when a call captures it (agent/tools.py fan-out) and they support a
// "Send test" from here. calcom is a mid-call booking action, not a delivery
// target, so it stays "coming soon" on this page.
const DELIVERY = new Set(['webhook', 'slack', 'whatsapp', 'sheets'])

const URL_PLACEHOLDER: Record<string, string> = {
  webhook: 'https://your-crm.example.com/webhook',
  slack: 'https://hooks.slack.com/services/T000/B000/XXXX',
  whatsapp: 'https://your-provider.example.com/whatsapp/send',
  sheets: 'https://script.google.com/macros/s/…/exec',
}

const CONNECT_HINT: Record<string, string> = {
  webhook: 'Every qualified lead POSTs to this URL as JSON in real time.',
  slack: 'Paste a Slack Incoming Webhook URL — you’ll get a message per qualified lead.',
  whatsapp: 'Your provider’s send endpoint receives { to, message } per lead.',
  sheets: 'Paste a Google Apps Script web-app URL that appends the lead JSON as a row.',
}

export function Integrations() {
  const { user } = useAuth()
  const canManage = hasRole(user, 'admin')
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [configuring, setConfiguring] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, string>>({})

  const reload = () => fetchIntegrations().then(setIntegrations).catch(() => setIntegrations([]))

  useEffect(() => {
    reload()
  }, [])

  const connected = integrations.filter((i) => i.status === 'connected').length

  const handleConnect = async (key: string) => {
    if (!url.trim()) return
    await updateIntegration(key, 'connected', { url: url.trim() })
    setConfiguring(null)
    setUrl('')
    reload()
  }

  const handleDisconnect = async (key: string) => {
    await updateIntegration(key, 'not_connected', {})
    reload()
  }

  const handleTest = async (key: string) => {
    setTesting(key)
    setTestResult((r) => ({ ...r, [key]: '' }))
    try {
      const res = await testIntegration(key)
      setTestResult((r) => ({ ...r, [key]: res.ok ? 'Test lead delivered ✓' : `Failed: ${res.detail}` }))
      reload()
    } catch {
      setTestResult((r) => ({ ...r, [key]: 'Test failed' }))
    } finally {
      setTesting(null)
      setTimeout(() => setTestResult((r) => ({ ...r, [key]: '' })), 5000)
    }
  }

  return (
    <DashboardLayout>
      <PageHeader title="Integrations" subtitle="Connect and manage external tools that power your agents" />

      <section className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard icon="link" label="Connected Integrations" value={String(connected)} hint={connected === 0 ? 'None connected' : 'live and syncing'} />
          <StatCard icon="apps" label="Available Integrations" value={String(integrations.length)} hint="Ready to connect" />
          <StatCard icon="monitoring" label="Sync Status" value={connected > 0 ? 'Live' : 'Idle'} hint={connected > 0 ? 'events push in real time' : 'No integrations connected yet'} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {integrations.map((integration) => (
            <div key={integration.key} className="flex flex-col rounded-xl border border-border bg-surface p-5">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 text-primary">
                    <Icon name={ICONS[integration.key] ?? 'extension'} className="text-[20px]" />
                  </div>
                  <div>
                    <p className="font-semibold">{integration.name}</p>
                    <p className="text-[11px] text-text-muted">{integration.category}</p>
                  </div>
                </div>
                <span
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    integration.status === 'connected'
                      ? 'border-cyan/30 bg-cyan/10 text-cyan'
                      : 'border-border text-text-muted'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${integration.status === 'connected' ? 'bg-cyan' : 'bg-muted'}`} />
                  {integration.status === 'connected' ? 'Connected' : 'Not Connected'}
                </span>
              </div>

              <p className="mb-4 text-xs text-text-muted">{integration.description}</p>

              <dl className="mb-4 flex flex-col gap-1.5 rounded-lg border border-border bg-surface-high/40 p-3 text-xs">
                <InfoRow label="Status" value={integration.status === 'connected' ? 'Connected' : 'Not Connected'} />
                <InfoRow label="Endpoint" value={integration.config.url ? integration.config.url.slice(0, 40) : '—'} />
                <InfoRow label="Last Sync" value={integration.lastSync ? formatRelativeTime(integration.lastSync) : '—'} />
              </dl>

              {testResult[integration.key] && (
                <p className={`mb-2 text-[11px] font-semibold ${testResult[integration.key].includes('✓') ? 'text-success' : 'text-destructive'}`}>
                  {testResult[integration.key]}
                </p>
              )}

              {configuring === integration.key ? (
                <div className="flex flex-col gap-2">
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder={URL_PLACEHOLDER[integration.key] ?? 'https://…'}
                    className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setConfiguring(null)} className="flex-1 rounded-lg border border-border py-2 text-xs font-bold">
                      Cancel
                    </button>
                    <button onClick={() => handleConnect(integration.key)} className="flex-1 rounded-lg bg-primary py-2 text-xs font-bold text-bg">
                      Save &amp; Connect
                    </button>
                  </div>
                  <p className="text-[11px] text-text-muted">{CONNECT_HINT[integration.key] ?? ''}</p>
                </div>
              ) : !canManage ? (
                <p className="mt-auto text-center text-[11px] text-text-muted">Admin access required to configure</p>
              ) : integration.status === 'connected' ? (
                <div className="mt-auto flex gap-2">
                  {DELIVERY.has(integration.key) && (
                    <button
                      onClick={() => handleTest(integration.key)}
                      disabled={testing === integration.key}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-cyan/40 py-2 text-xs font-bold text-cyan hover:bg-cyan/10 disabled:opacity-50"
                    >
                      <Icon name="send" className="text-[15px]" />
                      {testing === integration.key ? 'Sending…' : 'Send test'}
                    </button>
                  )}
                  <button
                    onClick={() => handleDisconnect(integration.key)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-destructive/40 py-2 text-xs font-bold text-destructive hover:bg-destructive/10"
                  >
                    <Icon name="link_off" className="text-[15px]" />
                    Disconnect
                  </button>
                </div>
              ) : DELIVERY.has(integration.key) ? (
                <button
                  onClick={() => setConfiguring(integration.key)}
                  className="mt-auto flex items-center justify-center gap-1.5 rounded-lg border border-cyan/40 py-2 text-xs font-bold text-cyan hover:bg-cyan/10"
                >
                  <Icon name="link" className="text-[15px]" />
                  Connect
                </button>
              ) : (
                <button
                  disabled
                  className="mt-auto flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-bold text-text-muted opacity-60"
                >
                  Coming soon
                </button>
              )}
            </div>
          ))}
        </div>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-text-muted">{label}</span>
      <span className="truncate font-semibold">{value}</span>
    </div>
  )
}
