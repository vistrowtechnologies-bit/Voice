import { useEffect, useState } from 'react'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { Card } from '../components/ui/Card'
import { facebookIntegrationStartUrl, fetchAgents, fetchArthaleadsInboundConfig, fetchIntegrations, fetchKnowledgeBases, fetchLeadWebhook, fetchPhoneNumbers, formatRelativeTime, slackIntegrationStartUrl, testIntegration, updateArthaleadsInboundConfig, updateIntegration, zohoIntegrationStartUrl } from '../lib/api'
import type { ArthaleadsInboundConfig } from '../lib/api'
import type { AgentConfig, Integration, KnowledgeBase, PhoneNumber } from '../lib/types'
import { hasRole, useAuth } from '../lib/auth'
import arthaleadsIcon from '../assets/arthaleads-logo.png'
import { Tooltip } from '../components/ui/Tooltip'

const ICONS: Record<string, string> = {
  webhook: 'webhook',
  whatsapp: 'chat',
  sheets: 'table_chart',
  facebook: 'ads_click',
}

// Integrations that open a local config form. Slack, Facebook, and Zoho CRM
// have their own OAuth install flow so operators can connect without
// hunting for webhook URLs or tokens.
const CONNECTABLE = new Set(['arthaleads', 'webhook', 'whatsapp', 'sheets'])

// The API returns integrations in undefined DB row order - pin a deliberate
// display order instead (ArthaLeads first, since it's the flagship CRM;
// Facebook right after it since it's a lead SOURCE, not a delivery target
// like the rest of this list) rather than leaving card position to chance.
const DISPLAY_ORDER = ['arthaleads', 'zoho_crm', 'facebook', 'webhook', 'slack', 'whatsapp', 'sheets']
const sortIntegrations = (list: Integration[]) =>
  [...list].sort((a, b) => DISPLAY_ORDER.indexOf(a.key) - DISPLAY_ORDER.indexOf(b.key))

// Lead-delivery integrations - a qualified lead is POSTed to each connected
// one when a call captures it (agent/tools.py fan-out) and they support a
// "Send test" from here.
const DELIVERY = new Set(['arthaleads', 'webhook', 'slack', 'whatsapp', 'sheets', 'zoho_crm'])

// arthaleads has no URL field - its endpoint is fixed server-side, so it's
// intentionally absent here (see the token-only form below).
const URL_PLACEHOLDER: Record<string, string> = {
  webhook: 'https://your-crm.example.com/webhook',
  whatsapp: 'https://your-provider.example.com/whatsapp/send',
  sheets: 'https://script.google.com/macros/s/…/exec',
}

const CONNECT_HINT: Record<string, string> = {
  arthaleads: 'Paste the connection key from ArthaLeads. New Vistrow contacts and call details will then be sent to ArthaLeads.',
  webhook: 'Every qualified lead POSTs to this URL as JSON in real time.',
  slack: 'Choose the Slack channel that should receive qualified-lead alerts.',
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
  const [leadWebhookUrl, setLeadWebhookUrl] = useState<string | null | undefined>(undefined)
  const [leadWebhookShown, setLeadWebhookShown] = useState(false)
  const [leadWebhookCopied, setLeadWebhookCopied] = useState(false)
  const [arthaleadsInbound, setArthaleadsInbound] = useState<ArthaleadsInboundConfig | null>(null)
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([])
  const [inboundSaving, setInboundSaving] = useState(false)
  const [inboundMessage, setInboundMessage] = useState('')

  const reload = () => fetchIntegrations().then((list) => setIntegrations(sortIntegrations(list))).catch(() => setIntegrations([]))

  useEffect(() => {
    reload()
    fetchLeadWebhook().then((r) => setLeadWebhookUrl(r.url)).catch(() => setLeadWebhookUrl(null))
    fetchArthaleadsInboundConfig().then(setArthaleadsInbound).catch(() => setArthaleadsInbound(null))
    fetchAgents().then(setAgents).catch(() => setAgents([]))
    fetchKnowledgeBases().then(setKnowledgeBases).catch(() => setKnowledgeBases([]))
    fetchPhoneNumbers().then(setPhoneNumbers).catch(() => setPhoneNumbers([]))
  }, [])

  const saveArthaleadsInbound = async (config = arthaleadsInbound) => {
    if (!config || !canManage) return
    setInboundSaving(true)
    setInboundMessage('')
    try {
      const next = await updateArthaleadsInboundConfig({ sources: config.sources, routes: config.routes })
      setArthaleadsInbound(next)
      setInboundMessage('ArthaLeads routing saved. Only enabled sources with a matching page or project rule will queue calls.')
    } catch (error) {
      setInboundMessage(error instanceof Error ? error.message : 'Could not save the ArthaLeads call setup.')
    } finally {
      setInboundSaving(false)
    }
  }

  const copyLeadWebhook = async () => {
    if (!leadWebhookUrl) return
    await navigator.clipboard.writeText(leadWebhookUrl)
    setLeadWebhookCopied(true)
    setTimeout(() => setLeadWebhookCopied(false), 1500)
  }

  const connected = integrations.filter((i) => i.status === 'connected').length

  const handleConnect = async (key: string) => {
    if (key === 'slack') {
      window.location.href = slackIntegrationStartUrl
      return
    }
    if (key === 'facebook') {
      window.location.href = facebookIntegrationStartUrl
      return
    }
    if (key === 'zoho_crm') {
      window.location.href = zohoIntegrationStartUrl
      return
    }
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

        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">ArthaLeads leads and calls</p>
              <p className="text-xs text-text-muted">Choose which new leads to call and who should call them.</p>
            </div>
            <span className="rounded-full bg-surface-high px-2.5 py-1 text-xs font-semibold text-text-muted">
              {arthaleadsInbound && Object.values(arthaleadsInbound.sources).some(Boolean) ? 'Selected sources on' : 'Calls off'}
            </span>
          </div>
          <p className="mb-4 text-xs text-text-muted">
            New leads are added to Contacts. A call is placed only when you turn on that lead type and choose who should call it. Website pages and campaigns can each go to a different agent. Existing leads are never called by this setup.
          </p>
          {arthaleadsInbound === null ? <p className="text-xs text-text-muted">Loading setup…</p> : <>
            <div className="mb-5 flex flex-wrap gap-4">
              {([['website', 'Website'], ['facebook', 'Facebook'], ['whatsapp', 'WhatsApp']] as const).map(([key, label]) => (
                <label key={key} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text">
                  <input type="checkbox" checked={arthaleadsInbound.sources[key]} disabled={!canManage || inboundSaving}
                    onChange={(event) => setArthaleadsInbound({ ...arthaleadsInbound, sources: { ...arthaleadsInbound.sources, [key]: event.target.checked } })} />
                  Call new {label} leads
                </label>
              ))}
            </div>
            <div className="space-y-3">
              {arthaleadsInbound.routes.map((route, index) => (
                <div key={`${route.source}-${index}`} className="grid gap-2 rounded-xl border border-border p-3 md:grid-cols-[140px_minmax(160px,1fr)_minmax(170px,1fr)_minmax(160px,1fr)_auto]">
                  <label className="text-xs text-text-muted">Lead type
                    <select value={route.source} disabled={!canManage || inboundSaving} onChange={(event) => {
                      const routes = [...arthaleadsInbound.routes]; routes[index] = { ...route, source: event.target.value as typeof route.source }; setArthaleadsInbound({ ...arthaleadsInbound, routes })
                    }} className="mt-1 block w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm text-text">
                      <option value="website">Website</option><option value="facebook">Facebook</option><option value="whatsapp">WhatsApp</option>
                    </select>
                  </label>
                  <label className="text-xs text-text-muted">{route.source === 'website' ? 'Website page' : route.source === 'facebook' ? 'Facebook project or campaign' : 'WhatsApp project or campaign'}
                    <input value={route.match} disabled={!canManage || inboundSaving} placeholder={route.source === 'website' ? 'Paste a page address or part of it' : 'Choose the project or campaign name'} onChange={(event) => {
                      const routes = [...arthaleadsInbound.routes]; routes[index] = { ...route, match: event.target.value }; setArthaleadsInbound({ ...arthaleadsInbound, routes })
                    }} className="mt-1 block w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm text-text" />
                  </label>
                  <label className="text-xs text-text-muted">Who should call these leads?
                    <select value={route.agentId ?? ''} disabled={!canManage || inboundSaving} onChange={(event) => {
                      const routes = [...arthaleadsInbound.routes]; routes[index] = { ...route, agentId: event.target.value ? Number(event.target.value) : null }; setArthaleadsInbound({ ...arthaleadsInbound, routes })
                    }} className="mt-1 block w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm text-text">
                      <option value="">Choose an agent</option>{agents.filter((agent) => agent.status === 'live' && !agent.isPlatformDemo && agent.kbId != null).map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · knows {knowledgeBases.find((kb) => kb.id === agent.kbId)?.name || 'this project'}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-text-muted">Number the agent calls from
                    <select value={route.fromNumber} disabled={!canManage || inboundSaving} onChange={(event) => {
                      const routes = [...arthaleadsInbound.routes]; routes[index] = { ...route, fromNumber: event.target.value }; setArthaleadsInbound({ ...arthaleadsInbound, routes })
                    }} className="mt-1 block w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm text-text">
                      <option value="">Choose number</option>{phoneNumbers.filter((number) => number.status === 'active').map((number) => <option key={number.id} value={number.number}>{number.label || number.number} · {number.number}</option>)}
                    </select>
                  </label>
                  {canManage && <button aria-label={`Remove ${route.source} route`} onClick={() => setArthaleadsInbound({ ...arthaleadsInbound, routes: arthaleadsInbound.routes.filter((_, i) => i !== index) })} className="self-end rounded-lg border border-border px-3 py-2 text-sm text-text-muted">Remove</button>}
                  {route.ready && <p className="md:col-span-5 text-xs text-success">New leads for “{route.match}” will be called by {route.agentName}, using {route.knowledgeBaseName} and phone number {route.fromNumber}.</p>}
                </div>
              ))}
            </div>
            {canManage && <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setArthaleadsInbound({ ...arthaleadsInbound, routes: [...arthaleadsInbound.routes, { source: 'facebook', match: '', agentId: null, agentName: '', knowledgeBaseName: '', fromNumber: '', ready: false }] })} className="rounded-lg border border-border px-3 py-2 text-sm text-text">Choose another page or campaign</button>
              <button disabled={inboundSaving || arthaleadsInbound.routes.some((route) => Boolean(route.match.trim()) && arthaleadsInbound.sources[route.source] && (!route.agentId || !route.fromNumber || !arthaleadsInbound.telephonyConnected))} onClick={() => saveArthaleadsInbound({ ...arthaleadsInbound, routes: arthaleadsInbound.routes.filter((route) => route.match.trim()) })} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{inboundSaving ? 'Saving…' : 'Save call setup'}</button>
            </div>}
          </>}
          {!arthaleadsInbound?.telephonyConnected && <p className="mt-3 rounded-lg bg-warning/10 p-3 text-xs text-text-muted">To place calls, first connect your calling service and add a phone number in Phone settings.</p>}
          {inboundMessage && <p className="mt-3 text-xs text-text-muted">{inboundMessage}</p>}
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {integrations.map((integration) => (
            <Card key={integration.key} className="flex flex-col">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      integration.key === 'arthaleads'
                        ? 'overflow-hidden'
                        : integration.key === 'slack' || integration.key === 'zoho_crm'
                          ? 'bg-white shadow-sm ring-1 ring-border'
                          : 'bg-primary/20 text-primary'
                    }`}
                  >
                    {integration.key === 'arthaleads' ? (
                      <img src={arthaleadsIcon} alt="ArthaLeads" className="h-full w-full object-cover" />
                    ) : integration.key === 'slack' ? (
                      <SlackLogo className="h-6 w-6" />
                    ) : integration.key === 'zoho_crm' ? (
                      <ZohoLogo className="h-5 w-6" />
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
                  <InfoRow label="Sends new contacts and call details" value="ArthaLeads" />
                ) : integration.key === 'slack' ? (
                  <InfoRow label="Channel" value={integration.config.channel || '-'} />
                ) : integration.key === 'facebook' ? (
                  <InfoRow label="Page" value={integration.config.pageName || '-'} />
                ) : integration.key === 'zoho_crm' ? (
                  <InfoRow label="Zoho org" value={integration.config.api_domain || '-'} />
                ) : (
                  <InfoRow label="Endpoint" value={integration.config.url ? integration.config.url.slice(0, 40) : '-'} />
                )}
                <InfoRow label="Last Sync" value={integration.lastSync ? formatRelativeTime(integration.lastSync) : '-'} />
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
                      placeholder="Display name (e.g. ArthaLeads CRM) - defaults to “CRM / Webhook”"
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
                      placeholder={integration.key === 'arthaleads' ? 'Paste your ArthaLeads connection key' : 'Auth token (optional - sent as a token field in the JSON body)'}
                      className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  )}
                  {integration.key === 'arthaleads' && (
                    <p className="text-[11px] text-text-muted">
                      In ArthaLeads, open Integrations → Vistrow Voice and copy the connection key.
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
                    <Tooltip content="Edit URL / token"><button
                      onClick={() => {
                        setUrl(integration.config.url || '')
                        setToken(integration.config.token || '')
                        setDisplayName(integration.key === 'webhook' ? integration.name : '')
                        setConfiguring(integration.key)
                      }}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-text-muted hover:border-primary"
                      aria-label={`Edit ${integration.name}`}
                    >
                      <Icon name="edit" className="text-[15px]" />
                    </button></Tooltip>
                  )}
                  <button
                    onClick={() => handleDisconnect(integration.key)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-destructive/40 py-2 text-xs font-bold text-destructive hover:bg-destructive/10"
                  >
                    <Icon name="link_off" className="text-[15px]" />
                    Disconnect
                  </button>
                </div>
              ) : integration.key === 'slack' ? (
                <button
                  onClick={() => handleConnect('slack')}
                  className="mt-auto flex items-center justify-center gap-1.5 rounded-lg border border-cyan/40 py-2 text-xs font-bold text-cyan hover:bg-cyan/10"
                >
                  <Icon name="link" className="text-[15px]" />
                  Connect Slack
                </button>
              ) : integration.key === 'facebook' ? (
                <button
                  onClick={() => handleConnect('facebook')}
                  className="mt-auto flex items-center justify-center gap-1.5 rounded-lg border border-cyan/40 py-2 text-xs font-bold text-cyan hover:bg-cyan/10"
                >
                  <Icon name="link" className="text-[15px]" />
                  Connect Facebook
                </button>
              ) : integration.key === 'zoho_crm' ? (
                <button
                  onClick={() => handleConnect('zoho_crm')}
                  className="mt-auto flex items-center justify-center gap-1.5 rounded-lg border border-cyan/40 py-2 text-xs font-bold text-cyan hover:bg-cyan/10"
                >
                  <Icon name="link" className="text-[15px]" />
                  Connect with Zoho
                </button>
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

function SlackLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 122.8 122.8" className={className} aria-label="Slack" role="img">
      <path
        d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9Zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6Z"
        fill="#E01E5A"
      />
      <path
        d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2Zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3Z"
        fill="#36C5F0"
      />
      <path
        d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2Zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3Z"
        fill="#2EB67D"
      />
      <path
        d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9Zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6Z"
        fill="#ECB22E"
      />
    </svg>
  )
}

function ZohoLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 70.419 24" className={className} aria-label="Zoho" role="img">
      <g transform="translate(-0.004 0.004)">
        <g transform="translate(16.48 -0.004)">
          <path
            d="M145.954,24a3.8,3.8,0,0,1-1.542-.33L133.055,18.6a3.79,3.79,0,0,1-1.918-5L136.2,2.242a3.794,3.794,0,0,1,5-1.918L152.56,5.386a3.8,3.8,0,0,1,1.918,5l-5.062,11.357A3.8,3.8,0,0,1,145.954,24ZM139.663,2.063a1.724,1.724,0,0,0-1.576,1.021l-5.061,11.357a1.726,1.726,0,0,0,.872,2.275l11.357,5.062h0a1.721,1.721,0,0,0,2.273-.872L152.591,9.55a1.726,1.726,0,0,0-.872-2.275L140.362,2.213A1.708,1.708,0,0,0,139.663,2.063Z"
            transform="translate(-130.808 0.004)"
            fill="#049849"
          />
        </g>
        <g transform="translate(50.411 3.98)">
          <path
            d="M416.423,51.642H403.989a3.793,3.793,0,0,1-3.789-3.789V35.419a3.793,3.793,0,0,1,3.789-3.789h12.434a3.793,3.793,0,0,1,3.789,3.789V47.853a3.793,3.793,0,0,1-3.789,3.789ZM403.989,33.7a1.723,1.723,0,0,0-1.722,1.722V47.852a1.723,1.723,0,0,0,1.722,1.722h12.434a1.723,1.723,0,0,0,1.722-1.722V35.419a1.723,1.723,0,0,0-1.722-1.722H403.989Z"
            transform="translate(-400.2 -31.63)"
            fill="#f6b11b"
          />
        </g>
        <path
          d="M20.593,25.171l-1.537,3.447.7,4.308A1.724,1.724,0,0,1,18.327,34.9L6.051,36.884a1.723,1.723,0,0,1-1.975-1.426L2.094,23.186a1.724,1.724,0,0,1,1.426-1.975l12.276-1.984a1.718,1.718,0,0,1,1.975,1.426l.685,4.241,1.537-3.447-.181-1.124a3.788,3.788,0,0,0-4.345-3.135L3.189,19.17A3.793,3.793,0,0,0,.053,23.516L2.037,35.79a3.791,3.791,0,0,0,3.732,3.187,3.9,3.9,0,0,0,.613-.049l12.274-1.984h0A3.793,3.793,0,0,0,21.793,32.6Z"
          transform="translate(0 -14.983)"
          fill="#e22728"
        />
        <g transform="translate(34.312 2.417)">
          <path
            d="M303.4,48.03h-.024a1.723,1.723,0,0,0-1.722,1.722v.771l1.328,9.755a1.723,1.723,0,0,1-1.475,1.938l-12.321,1.676a1.723,1.723,0,0,1-1.938-1.475l-.561-4.121-1.6,3.586.111.814a3.8,3.8,0,0,0,3.752,3.279,3.737,3.737,0,0,0,.514-.035l12.321-1.676A3.793,3.793,0,0,0,305.031,60Z"
            transform="translate(-283.489 -44.401)"
            fill="#226eb3"
          />
          <path
            d="M274.464,24.914a1.723,1.723,0,0,1,1.475-1.938L288.26,21.3a1.827,1.827,0,0,1,.233-.016,1.722,1.722,0,0,1,1.209.5,3.781,3.781,0,0,1,1.9-.945,3.8,3.8,0,0,0-3.621-1.587l-12.32,1.676a3.789,3.789,0,0,0-3.243,4.266l1.037,7.617,1.6-3.586Z"
            transform="translate(-272.381 -19.216)"
            fill="#226eb3"
          />
        </g>
      </g>
    </svg>
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
