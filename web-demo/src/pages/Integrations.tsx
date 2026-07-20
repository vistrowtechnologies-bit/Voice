import { useEffect, useState } from 'react'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { Card } from '../components/ui/Card'
import { fetchIntegrations, formatRelativeTime, testIntegration, updateIntegration } from '../lib/api'
import type { Integration } from '../lib/types'
import { hasRole, useAuth } from '../lib/auth'
import arthaleadsIcon from '../assets/arthaleads-logo.png'

const ICONS: Record<string, string> = {
  webhook: 'webhook',
  slack: 'forum',
  whatsapp: 'chat',
  sheets: 'table_chart',
}

// Integrations that connect with a pasted URL (delivery targets). arthaleads
// connects with just a token — its endpoint is fixed.
const CONNECTABLE = new Set(['arthaleads', 'webhook', 'slack', 'whatsapp', 'sheets'])

// The API returns integrations in undefined DB row order — pin a deliberate
// display order instead (ArthaLeads first, since it's the flagship CRM)
// rather than leaving card position to chance.
const DISPLAY_ORDER = ['arthaleads', 'webhook', 'slack', 'whatsapp', 'sheets']
const sortIntegrations = (list: Integration[]) =>
  [...list].sort((a, b) => DISPLAY_ORDER.indexOf(a.key) - DISPLAY_ORDER.indexOf(b.key))

// Lead-delivery integrations — a qualified lead is POSTed to each connected
// one when a call captures it (agent/tools.py fan-out) and they support a
// "Send test" from here.
const DELIVERY = new Set(['arthaleads', 'webhook', 'slack', 'whatsapp', 'sheets'])

// arthaleads has no URL field — its endpoint is fixed server-side, so it's
// intentionally absent here (see the token-only form below).
const URL_PLACEHOLDER: Record<string, string> = {
  webhook: 'https://your-crm.example.com/webhook',
  slack: 'https://hooks.slack.com/services/T000/B000/XXXX',
  whatsapp: 'https://your-provider.example.com/whatsapp/send',
  sheets: 'https://script.google.com/macros/s/…/exec',
}

const CONNECT_HINT: Record<string, string> = {
  arthaleads: 'Paste your ArthaLeads API token — the endpoint is already wired up. Every qualified lead posts straight into ArthaLeads with the full call transcript.',
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
  const [token, setToken] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, string>>({})

  const reload = () => fetchIntegrations().then((list) => setIntegrations(sortIntegrations(list))).catch(() => setIntegrations([]))

  useEffect(() => {
    reload()
  }, [])

  const connected = integrations.filter((i) => i.status === 'connected').length

  const handleConnect = async (key: string) => {
    if (key === 'arthaleads') {
      if (!token.trim()) return
      await updateIntegration(key, 'connected', { token: token.trim() })
      setConfiguring(null)
      setUrl('')
      setToken('')
      setDisplayName('')
      reload()
      return
    }
    if (!url.trim()) return
    const config: { url: string; token?: string } = { url: url.trim() }
    if (key === 'webhook' && token.trim()) config.token = token.trim()
    await updateIntegration(key, 'connected', config, key === 'webhook' ? displayName.trim() : undefined)
    setConfiguring(null)
    setUrl('')
    setToken('')
    setDisplayName('')
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
            <Card key={integration.key} className="flex flex-col">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      integration.key === 'arthaleads' ? 'overflow-hidden' : 'bg-primary/20 text-primary'
                    }`}
                  >
                    {integration.key === 'arthaleads' ? (
                      <img src={arthaleadsIcon} alt="ArthaLeads" className="h-full w-full object-cover" />
                    ) : (
                      <Icon name={ICONS[integration.key] ?? 'extension'} className="text-[20px]" />
                    )}
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
                {integration.key === 'arthaleads' ? (
                  <InfoRow label="Endpoint" value="api.arthaleads.com" />
                ) : (
                  <InfoRow label="Endpoint" value={integration.config.url ? integration.config.url.slice(0, 40) : '—'} />
                )}
                <InfoRow label="Last Sync" value={integration.lastSync ? formatRelativeTime(integration.lastSync) : '—'} />
              </dl>

              {testResult[integration.key] && (
                <p className={`mb-2 text-[11px] font-semibold ${testResult[integration.key].includes('✓') ? 'text-success' : 'text-destructive'}`}>
                  {testResult[integration.key]}
                </p>
              )}

              {!testResult[integration.key] && integration.status === 'connected' && integration.lastError && (
                <p className="mb-2 flex items-center gap-1 text-[11px] font-semibold text-destructive">
                  <Icon name="error" className="text-[13px]" />
                  Last delivery failed: {integration.lastError}
                </p>
              )}

              {configuring === integration.key ? (
                <div className="flex flex-col gap-2">
                  {integration.key === 'webhook' && (
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Display name (e.g. ArthaLeads CRM) — defaults to “CRM / Webhook”"
                      className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  )}
                  {integration.key !== 'arthaleads' && (
                    <input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder={URL_PLACEHOLDER[integration.key] ?? 'https://…'}
                      className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  )}
                  {(integration.key === 'webhook' || integration.key === 'arthaleads') && (
                    <input
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder={integration.key === 'arthaleads' ? 'Account Token (e.g. AW-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)' : 'Auth token (optional — sent as a token field in the JSON body)'}
                      className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  )}
                  {integration.key === 'arthaleads' && (
                    <p className="text-[11px] text-text-muted">
                      Get this from ArthaLeads → Automation → Vistrow Voice → Add Voice Connection
                    </p>
                  )}
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
                      {testing === integration.key
                        ? 'Testing…'
                        : integration.key === 'arthaleads'
                          ? 'Test Connection'
                          : 'Send test'}
                    </button>
                  )}
                  {CONNECTABLE.has(integration.key) && (
                    <button
                      onClick={() => {
                        setUrl(integration.config.url || '')
                        setToken(integration.config.token || '')
                        setDisplayName(integration.key === 'webhook' ? integration.name : '')
                        setConfiguring(integration.key)
                      }}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-text-muted hover:border-primary"
                      aria-label={`Edit ${integration.name}`}
                      title="Edit URL / token"
                    >
                      <Icon name="edit" className="text-[15px]" />
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
              ) : CONNECTABLE.has(integration.key) ? (
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
            </Card>
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
