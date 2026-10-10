import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArthaleadsRouting } from '../components/ArthaleadsRouting'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { IntegrationLogo } from '../components/IntegrationLogo'
import { Card } from '../components/ui/Card'
import {
  disconnectGoogleSheets,
  facebookIntegrationStartUrl,
  fetchAgents,
  fetchFacebookLeads,
  fetchIntegrationDeliveries,
  fetchIntegrations,
  fetchLeadWebhook,
  formatDateTime,
  formatRelativeTime,
  googleSheetsIntegrationStartUrl,
  slackIntegrationStartUrl,
  testIntegration,
  updateAgent,
  updateIntegration,
  updateIntegrationSettings,
  zohoIntegrationStartUrl,
} from '../lib/api'
import type { FacebookLead, IntegrationDeliveries } from '../lib/api'
import type { AgentConfig, Integration } from '../lib/types'
import { hasRole, useAuth } from '../lib/auth'
import { StatusPill, hostOf, utcTime } from '../components/IntegrationBits'

// ------------------------------------------------------------ shared rules

// Lead-delivery integrations: agent/tools.py's fan-out sends to these.
const DELIVERY_KEYS = ['arthaleads', 'webhook', 'slack', 'whatsapp', 'sheets', 'zoho_crm']
// Saved by pasting a URL/key on this page (the others connect by signing in).
const FORM_KEYS = new Set(['arthaleads', 'webhook', 'whatsapp', 'sheets'])

// Same list and defaults as server/calls_db.py INTEGRATION_EVENTS and
// agent/tools.py _integration_wants_event.
const EVENTS: Array<{ id: string; label: string; hint: string }> = [
  { id: 'call_completed', label: 'End of call', hint: 'One record when the call ends, with the summary, details and recording link.' },
  { id: 'lead_update', label: 'Lead details during the call', hint: 'Each time the agent saves new details (name, need, budget) while the caller is still on the line.' },
  { id: 'appointment_booked', label: 'Appointment booked', hint: 'When the agent books a slot on your calendar.' },
  { id: 'callback_requested', label: 'Callback requested', hint: 'When the caller asks to be called back later.' },
]
const EVENT_LABELS: Record<string, string> = {
  call_completed: 'End of call',
  lead_update: 'Lead details',
  platform_lead_update: 'Lead details',
  appointment_booked: 'Appointment',
  callback_requested: 'Callback',
  test: 'Test',
}

// Owner-selectable fields (server/calls_db.py INTEGRATION_FIELDS). A
// left-out field is never sent; in a sheet its column is hidden and empty.
const FIELDS: Array<{ id: string; label: string; hint: string; sheetColumn?: string }> = [
  { id: 'name', label: 'Name', hint: 'Caller’s name', sheetColumn: 'Name' },
  { id: 'phone', label: 'Phone', hint: 'Caller’s phone number', sheetColumn: 'Phone' },
  { id: 'email', label: 'Email', hint: 'Caller’s email', sheetColumn: 'Email' },
  { id: 'company', label: 'Company', hint: 'Company, if mentioned', sheetColumn: 'Company' },
  { id: 'channel', label: 'Channel', hint: 'Phone, widget or web', sheetColumn: 'Channel' },
  { id: 'agent', label: 'Agent', hint: 'Which agent took the call', sheetColumn: 'Agent' },
  { id: 'language', label: 'Language', hint: 'Language of the call', sheetColumn: 'Language' },
  { id: 'duration', label: 'Call length', hint: 'In seconds', sheetColumn: 'Duration (s)' },
  { id: 'details', label: 'Details & summary', hint: 'Budget, location, needs… and the summary', sheetColumn: 'Details' },
  { id: 'transcript', label: 'Transcript', hint: 'The full conversation' },
  { id: 'page', label: 'Website page', hint: 'Page the visitor called from', sheetColumn: 'Page' },
  { id: 'recording', label: 'Recording', hint: 'Link that plays the call audio', sheetColumn: 'Recording' },
  { id: 'call_id', label: 'Call ID', hint: 'Vistrow call number', sheetColumn: 'Call ID' },
]
const fieldsConfigurable = (i: Integration) => ['webhook', 'slack', 'sheets'].includes(i.key)
const effectiveFields = (i: Integration): string[] =>
  Array.isArray(i.config.fields) && i.config.fields.length ? i.config.fields : FIELDS.map((f) => f.id)

const isSheetsOauth = (i: Integration) => i.key === 'sheets' && i.config.mode === 'oauth'
const eventsConfigurable = (i: Integration) =>
  ['webhook', 'slack', 'whatsapp', 'sheets'].includes(i.key) && !isSheetsOauth(i)
const defaultEvents = (key: string) => (key === 'whatsapp' ? ['call_completed'] : EVENTS.map((e) => e.id))
const effectiveEvents = (i: Integration): string[] =>
  Array.isArray(i.config.events) && i.config.events.length ? i.config.events : defaultEvents(i.key)

const DEFAULT_WHATSAPP_MESSAGE = 'Hi {name}, thanks for your call with us. We’ll follow up shortly.'

/** A sent/failed reason → what to do about it. */
function fixFor(detail: string): string | null {
  const d = detail.toLowerCase()
  if (d.includes('sign in with google') || d.includes('reconnect') || d.includes('invalid token'))
    return 'Use Reconnect at the top of this page, then Send test.'
  if (d.includes('sheet was deleted')) return 'Reconnect to create a new leads sheet.'
  if (d.includes('busy')) return 'Nothing to do - the next lead tries again.'
  if (d.includes('growth') || d.includes('plan')) return 'Automatic delivery needs the Growth plan or higher.'
  if (d.startsWith('http 4')) return 'The receiving app rejected the data. Check the URL and token on the Settings tab.'
  if (d.startsWith('http 5') || d.includes('network')) return 'The receiving app was down or slow (we wait 5 seconds). Send test again later.'
  if (d.includes('no phone or email')) return 'Expected: a caller who left no phone or email is not sent.'
  return null
}

// --------------------------------------------------------------- page

type Tab = 'overview' | 'settings' | 'activity' | 'help'

export function IntegrationDetail() {
  const { key = '' } = useParams()
  const { user } = useAuth()
  const canManage = hasRole(user, 'admin')
  const [integration, setIntegration] = useState<Integration | null | undefined>(undefined)
  const [deliveries, setDeliveries] = useState<IntegrationDeliveries | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [testing, setTesting] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  // Result of an OAuth round-trip (?sheets=connected|failed, ?zoho=failed...),
  // read once on arrival and then dropped from the URL.
  const [oauthResult] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    for (const name of ['sheets', 'slack', 'zoho', 'facebook']) {
      const value = params.get(name)
      if (value) return value
    }
    return null
  })

  const isDelivery = DELIVERY_KEYS.includes(key)

  const reload = useCallback(() => {
    fetchIntegrations()
      .then((list) => setIntegration(list.find((i) => i.key === key) ?? null))
      .catch(() => setIntegration(null))
    if (DELIVERY_KEYS.includes(key)) {
      fetchIntegrationDeliveries(key).then(setDeliveries).catch(() => setDeliveries(null))
    }
  }, [key])

  useEffect(() => {
    // Back/forward between two integration pages reuses this component:
    // start clean so Slack's data never shows under Zoho's header.
    setIntegration(undefined)
    setDeliveries(null)
    setTab('overview')
    setNotice(null)
    setConfirmDisconnect(false)
    if (oauthResult) window.history.replaceState(null, '', window.location.pathname)
    reload()
  }, [reload, oauthResult])

  useEffect(() => {
    if (oauthResult === 'connected') setNotice({ tone: 'ok', text: 'Connected. Send a test to check that everything arrives.' })
    if (oauthResult === 'failed') setNotice({ tone: 'error', text: 'The connection did not finish. Please try again.' })
  }, [oauthResult])

  if (integration === undefined) {
    return (
      <DashboardLayout>
        <PageHeader title="Integrations" />
        <p className="p-6 text-sm text-text-muted">Loading…</p>
      </DashboardLayout>
    )
  }
  if (integration === null) {
    return (
      <DashboardLayout>
        <PageHeader title="Integrations" />
        <div className="flex flex-col items-start gap-3 p-6">
          <p className="text-sm text-text-muted">This integration doesn’t exist.</p>
          <Link to="/dashboard/integrations" className="text-sm font-semibold text-primary hover:underline">
            Back to Integrations
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  const connected = integration.status === 'connected'

  const startOAuth = () => {
    const url =
      key === 'slack'
        ? slackIntegrationStartUrl
        : key === 'facebook'
          ? facebookIntegrationStartUrl
          : key === 'zoho_crm'
            ? zohoIntegrationStartUrl
            : key === 'sheets'
              ? googleSheetsIntegrationStartUrl
              : null
    if (url) window.location.href = url
  }

  const runTest = async () => {
    setTesting(true)
    setNotice(null)
    try {
      const res = await testIntegration(key)
      setNotice(
        res.ok
          ? { tone: 'ok', text: key === 'sheets' && isSheetsOauth(integration) ? 'Test row added to your sheet.' : 'Test delivered.' }
          : { tone: 'error', text: `Test failed: ${res.detail}` },
      )
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Test failed' })
    } finally {
      setTesting(false)
      reload()
    }
  }

  const disconnect = async () => {
    setConfirmDisconnect(false)
    try {
      if (isSheetsOauth(integration)) await disconnectGoogleSheets()
      else await updateIntegration(key, 'not_connected', {})
      setNotice({ tone: 'ok', text: `${integration.name} disconnected.` })
      setTab('overview')
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not disconnect' })
    }
    reload()
  }

  const usesOAuth = ['slack', 'facebook', 'zoho_crm'].includes(key) || isSheetsOauth(integration) || (key === 'sheets' && !connected)
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'settings', label: 'Settings' },
    { id: 'activity', label: key === 'facebook' ? 'Leads' : 'Activity' },
    { id: 'help', label: 'Setup help' },
  ]

  return (
    <DashboardLayout>
      <PageHeader title={integration.name} subtitle={integration.category} />

      <section className="flex flex-col gap-4 p-4 sm:p-6">
        <Link to="/dashboard/integrations" className="flex w-fit items-center gap-1 text-xs font-semibold text-text-muted hover:text-text">
          <Icon name="arrow_back" className="text-[15px]" /> All integrations
        </Link>

        <Card>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <IntegrationLogo integrationKey={key} size="lg" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold">{integration.name}</h2>
                  <StatusPill connected={connected} />
                </div>
                <p className="mt-1 text-xs text-text-muted">{integration.description}</p>
              </div>
            </div>

            {canManage && (
              <div className="flex flex-wrap gap-2">
                {!connected ? (
                  key === 'sheets' ? (
                    <GoogleSignInButton onClick={startOAuth} />
                  ) : usesOAuth ? (
                    <PrimaryButton icon="link" onClick={startOAuth}>
                      {key === 'zoho_crm' ? 'Connect with Zoho' : `Connect ${integration.name}`}
                    </PrimaryButton>
                  ) : (
                    <PrimaryButton icon="link" onClick={() => setTab('settings')}>
                      Connect
                    </PrimaryButton>
                  )
                ) : (
                  <>
                    {isDelivery && (
                      <PrimaryButton icon="send" onClick={runTest} disabled={testing}>
                        {testing ? 'Sending…' : 'Send test'}
                      </PrimaryButton>
                    )}
                    {usesOAuth && (
                      <SecondaryButton icon="refresh" onClick={startOAuth}>
                        Reconnect
                      </SecondaryButton>
                    )}
                    {confirmDisconnect ? (
                      <>
                        <button
                          onClick={disconnect}
                          className="rounded-lg bg-destructive px-3 py-2 text-xs font-bold text-white hover:opacity-90"
                        >
                          Yes, disconnect
                        </button>
                        <SecondaryButton icon="close" onClick={() => setConfirmDisconnect(false)}>
                          Cancel
                        </SecondaryButton>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDisconnect(true)}
                        className="flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-bold text-destructive hover:bg-destructive/10"
                      >
                        <Icon name="link_off" className="text-[15px]" /> Disconnect
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          {confirmDisconnect && (
            <p className="mt-3 rounded-lg bg-destructive/10 p-3 text-xs text-text">
              {key === 'facebook'
                ? 'New Facebook leads will stop arriving. Leads already received stay in Contacts.'
                : isSheetsOauth(integration)
                  ? 'New leads stop going to the sheet and Google access is removed. The sheet itself stays in your Drive.'
                  : 'New leads stop going here. Saved details for this integration are removed.'}
            </p>
          )}
          {!canManage && <p className="mt-3 text-xs text-text-muted">Admin access is needed to change this integration.</p>}
        </Card>

        {notice && (
          <p
            className={`flex items-start gap-2 rounded-lg border p-3 text-xs font-semibold ${
              notice.tone === 'ok' ? 'border-success/30 bg-success/10 text-success' : 'border-destructive/30 bg-destructive/10 text-destructive'
            }`}
          >
            <Icon name={notice.tone === 'ok' ? 'check_circle' : 'error'} className="text-[15px]" />
            <span className="flex-1">{notice.text}</span>
            <button onClick={() => setNotice(null)} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
              <Icon name="close" className="text-[15px]" />
            </button>
          </p>
        )}

        {connected && integration.lastError && (
          <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs sm:flex-row sm:items-center">
            <div className="flex flex-1 items-start gap-2">
              <Icon name="error" className="text-[16px] text-destructive" />
              <div>
                <p className="font-semibold text-destructive">Last delivery failed: {integration.lastError}</p>
                {fixFor(integration.lastError) && <p className="mt-0.5 text-text-muted">{fixFor(integration.lastError)}</p>}
              </div>
            </div>
            {canManage && isDelivery && (
              <SecondaryButton icon="send" onClick={runTest} disabled={testing}>
                {testing ? 'Sending…' : 'Send test again'}
              </SecondaryButton>
            )}
          </div>
        )}

        {key === 'facebook' ? (
          <FacebookHealth integration={integration} />
        ) : (
          isDelivery && <DeliveryHealth integration={integration} deliveries={deliveries} />
        )}

        <div role="tablist" aria-label={`${integration.name} sections`} className="flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                tab === t.id ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <OverviewTab integration={integration} />}
        {tab === 'settings' && (
          <SettingsTab integration={integration} canManage={canManage} onSaved={reload} onNotice={setNotice} />
        )}
        {tab === 'activity' &&
          (key === 'facebook' ? (
            <FacebookLeadsTab />
          ) : (
            <ActivityTab integrationKey={key} connected={connected} />
          ))}
        {tab === 'help' && <HelpTab integration={integration} />}
      </section>
    </DashboardLayout>
  )
}

// ------------------------------------------------------------- health

function DeliveryHealth({ integration, deliveries }: { integration: Integration; deliveries: IntegrationDeliveries | null }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile icon="schedule" label="Last delivery" value={integration.lastSync ? formatRelativeTime(utcTime(integration.lastSync)) : 'Never'} />
      <Tile icon="check_circle" label="Delivered · 7 days" value={deliveries ? String(deliveries.stats.sent7d) : '-'} />
      <Tile
        icon="error"
        label="Failed · 7 days"
        value={deliveries ? String(deliveries.stats.failed7d) : '-'}
        alert={Boolean(deliveries && deliveries.stats.failed7d > 0)}
      />
      <Tile icon="filter_alt" label="Skipped · 7 days" value={deliveries ? String(deliveries.stats.skipped7d) : '-'} />
    </div>
  )
}

function FacebookHealth({ integration }: { integration: Integration }) {
  const [leads, setLeads] = useState<FacebookLead[] | null>(null)
  useEffect(() => {
    fetchFacebookLeads().then(setLeads).catch(() => setLeads([]))
  }, [])
  const last = leads?.[0]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <Tile icon="flag" label="Page" value={integration.config.pageName || '-'} />
      <Tile icon="group_add" label="Leads · last 50" value={leads ? String(leads.length) : '-'} />
      <Tile icon="schedule" label="Last lead" value={last ? formatRelativeTime(utcTime(last.createdAt)) : 'None yet'} />
    </div>
  )
}

function Tile({ icon, label, value, alert = false }: { icon: string; label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${alert ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-primary'}`}>
        <Icon name={icon} className="text-[18px]" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">{label}</p>
        <p className={`truncate text-base font-bold ${alert ? 'text-destructive' : ''}`}>{value}</p>
      </div>
    </div>
  )
}

// ----------------------------------------------------------- overview

const SHEET_COLUMNS = [
  'Date/time (IST)', 'Name', 'Phone', 'Email', 'Company', 'Channel', 'Agent',
  'Language', 'Duration (s)', 'Details', 'Page', 'Recording', 'Call ID',
]

const SAMPLE_PAYLOAD = {
  type: 'call_completed',
  name: 'Asha Verma',
  phone: '+919876543210',
  email: 'asha@example.com',
  channel: 'phone',
  duration_seconds: 184,
  language: 'hi',
  agent_name: 'Artha',
  page_path: '',
  call_id: 1204,
  extracted_data: { budget: '80 lakh', location: 'Baner, Pune', timeline: 'Within 3 months' },
  transcript: [
    { role: 'assistant', text: 'Namaste! How can I help you today?' },
    { role: 'user', text: 'I am looking for a 2BHK in Baner.' },
  ],
  recording_url: 'https://api.vistrowvoice.com/public/calls/1204/recording?token=…',
  recording_mime_type: 'audio/wav',
}

function OverviewTab({ integration }: { integration: Integration }) {
  const key = integration.key
  const connected = integration.status === 'connected'
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="flex flex-col gap-4">
        <Panel title="Connection" icon="link">
          <dl className="flex flex-col gap-2 text-xs">
            <Row label="Status" value={connected ? 'Connected' : 'Not connected'} />
            {connected && <ConnectionRows integration={integration} />}
            {connected && DELIVERY_KEYS.includes(key) && (
              <Row label="Last delivery" value={integration.lastSync ? formatDateTime(utcTime(integration.lastSync)) : 'Never'} />
            )}
          </dl>
        </Panel>
        <Panel title="When it sends" icon="bolt">
          <WhenItSends integration={integration} />
        </Panel>
      </div>
      <Panel title={key === 'facebook' ? 'What happens to a lead' : 'What we send'} icon={key === 'facebook' ? 'route' : 'data_object'}>
        <WhatWeSend integration={integration} />
      </Panel>
    </div>
  )
}

function ConnectionRows({ integration }: { integration: Integration }) {
  const c = integration.config
  switch (integration.key) {
    case 'sheets':
      return isSheetsOauth(integration) ? (
        <>
          <Row label="Google account" value={c.google_email || '-'} />
          <Row label="Tab" value={c.sheet_title || 'Leads'} />
          <div className="flex items-center justify-between gap-2">
            <dt className="text-text-muted">Sheet</dt>
            {c.spreadsheet_url ? (
              <a href={c.spreadsheet_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-semibold text-primary hover:underline">
                Vistrow Voice — Leads <Icon name="north_east" className="text-[13px]" />
              </a>
            ) : (
              <dd className="font-semibold">-</dd>
            )}
          </div>
        </>
      ) : (
        <Row label="Apps Script URL" value={c.url ? hostOf(c.url) : '-'} />
      )
    case 'zoho_crm':
      return <Row label="Zoho data centre" value={c.api_domain ? c.api_domain.replace(/^https?:\/\//, '') : '-'} />
    case 'slack':
      return <Row label="Channel" value={c.channel || '-'} />
    case 'facebook':
      return <Row label="Page" value={c.pageName || '-'} />
    case 'arthaleads':
      return <Row label="Connection key" value={c.token ? 'Saved' : 'Missing'} />
    case 'whatsapp':
      return (
        <>
          <Row label="Provider" value={c.url ? hostOf(c.url) : '-'} />
          <Row label="Message" value={c.template ? 'Your own message' : 'Default message'} />
        </>
      )
    default:
      return (
        <>
          <Row label="Endpoint" value={c.url ? hostOf(c.url) : '-'} />
          <Row label="Auth token" value={c.token ? 'Saved' : 'None'} />
        </>
      )
  }
}

function WhenItSends({ integration }: { integration: Integration }) {
  const key = integration.key
  if (key === 'facebook')
    return <p className="text-xs text-text-muted">Every time someone submits a Lead Ads form on your connected Page.</p>
  if (key === 'zoho_crm' || isSheetsOauth(integration))
    return (
      <p className="text-xs text-text-muted">
        Once per call, when it ends, if the caller left a phone number or email. Anonymous visitors are skipped.
        {key === 'zoho_crm' && ' A repeat caller updates their existing lead instead of creating a new one.'}
      </p>
    )
  if (key === 'arthaleads')
    return <p className="text-xs text-text-muted">Once per call, when it ends, if we have the caller’s name and phone number.</p>
  const chosen = effectiveEvents(integration)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {EVENTS.filter((e) => chosen.includes(e.id)).map((e) => (
          <span key={e.id} className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
            {e.label}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-text-muted">Change this on the Settings tab.</p>
    </div>
  )
}

function WhatWeSend({ integration }: { integration: Integration }) {
  const key = integration.key
  if (isSheetsOauth(integration) || (key === 'sheets' && integration.status !== 'connected')) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-text-muted">
          One row per caller in the “Vistrow Voice — Leads” spreadsheet, styled in Vistrow colours with a filter on every column. Each agent
          gets its own tab, named after the agent.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <div className="flex min-w-max">
            {SHEET_COLUMNS.filter((col) => {
              const field = FIELDS.find((f) => f.sheetColumn === col)
              return !field || effectiveFields(integration).includes(field.id)
            }).map((col) => (
              <div key={col} className="border-r border-border last:border-r-0">
                <div className="whitespace-nowrap bg-[#9333ea] px-3 py-2 text-[11px] font-bold text-white">{col}</div>
                <div className="whitespace-nowrap px-3 py-2 text-[11px] text-text-muted">
                  {col === 'Recording' ? <span className="font-bold text-primary">▶ Play recording</span> : sampleCell(col)}
                </div>
              </div>
            ))}
          </div>
        </div>
        <AgentTabStrip integration={integration} />
        <p className="text-[11px] text-text-muted">
          {effectiveFields(integration).includes('recording')
            ? '“▶ Play recording” opens the call audio in a browser player, no sign-in needed.'
            : 'Recordings are left out of this sheet.'}{' '}
          Choose columns on the Settings tab.
        </p>
      </div>
    )
  }
  if (key === 'zoho_crm') {
    const rows: Array<[string, string]> = [
      ['Last Name', 'Caller’s name (or “Website visitor”)'],
      ['Phone / Email', 'As given on the call - used to find a repeat caller'],
      ['Company', 'Company, if mentioned'],
      ['Lead Source', 'Phone, Website Widget or Web'],
      ['Description', 'Call summary, captured details, agent, call length and recording link'],
    ]
    return <MappingTable left="Zoho field" right="Filled with" rows={rows} />
  }
  if (key === 'arthaleads') {
    const rows: Array<[string, string]> = [
      ['Contact', 'Name, phone, email'],
      ['Conversation', 'Full transcript, summary and sentiment'],
      ['Call', 'Channel, language, agent, length, page'],
      ['Recording', 'Playable link to the call audio'],
      ['Details', 'Everything the agent captured (budget, location, timeline…)'],
    ]
    return <MappingTable left="ArthaLeads gets" right="" rows={rows} />
  }
  if (key === 'slack') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-text-muted">A message like this in {integration.config.channel || 'your channel'}:</p>
        <div className="rounded-lg border border-border bg-surface-high/40 p-3 text-xs">
          <p className="font-bold">New qualified lead · Phone</p>
          <p className="mt-1 font-semibold">Asha Verma</p>
          <p className="text-text-muted">Looking for a 2BHK in Baner, budget 80 lakh, within 3 months.</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
            {[['Phone', '+91 98765 43210'], ['Language', 'hi'], ['Agent', 'Artha'], ['Duration', '184s'], ['Outcome', 'Qualified']].map(([k, v]) => (
              <div key={k}>
                <p className="font-bold">{k}</p>
                <p className="text-text-muted">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }
  if (key === 'whatsapp') {
    const message = (integration.config.template || DEFAULT_WHATSAPP_MESSAGE).replace(/\{name\}/g, 'Asha')
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-text-muted">
          Your provider receives <code className="rounded bg-surface-high px-1">{'{ "to": "+91…", "message": "…" }'}</code> and sends this to the caller on WhatsApp:
        </p>
        <WhatsAppBubble text={message} />
      </div>
    )
  }
  if (key === 'facebook') {
    return (
      <ol className="flex flex-col gap-3 text-xs">
        {[
          ['Someone fills your Lead Ads form', 'Meta tells us within seconds.'],
          ['We add them to Contacts', 'With the name and phone from the form.'],
          ['Your agent calls them', 'Through the instant follow-up campaign, usually within 15-30 seconds.'],
          ['Your rules still apply', 'Do-not-call list and calling hours are checked before every call.'],
        ].map(([title, hint], i) => (
          <li key={title} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">{i + 1}</span>
            <div>
              <p className="font-semibold">{title}</p>
              <p className="text-text-muted">{hint}</p>
            </div>
          </li>
        ))}
      </ol>
    )
  }
  // webhook, Apps Script sheets
  return <JsonSample />
}

function AgentTabStrip({ integration }: { integration: Integration }) {
  const tabs = Object.keys((integration.config.agent_tabs as Record<string, number> | undefined) ?? {})
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="text-text-muted">Tabs:</span>
      <span className="rounded-md bg-surface-high px-2 py-1 font-semibold">{integration.config.sheet_title || 'Leads'}</span>
      {tabs.length ? (
        tabs.map((t) => (
          <span key={t} className="rounded-md border-b-2 border-primary bg-primary/10 px-2 py-1 font-semibold text-primary">
            {t}
          </span>
        ))
      ) : (
        <span className="text-text-muted">- an agent’s tab appears with its first lead</span>
      )}
    </div>
  )
}

function sampleCell(col: string): string {
  const values: Record<string, string> = {
    'Date/time (IST)': '2026-10-10 14:32', Name: 'Asha Verma', Phone: '+91 98765 43210', Email: 'asha@example.com',
    Company: '-', Channel: 'Phone', Agent: 'Artha', Language: 'hi', 'Duration (s)': '184',
    Details: 'Budget: 80 lakh · Location: Baner', Page: '-', 'Call ID': '1204',
  }
  return values[col] ?? ''
}

function JsonSample() {
  const [copied, setCopied] = useState(false)
  const text = JSON.stringify(SAMPLE_PAYLOAD, null, 2)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-text-muted">A POST with this JSON body (end-of-call event). Mid-call events carry the same lead fields with their own type.</p>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-[11px] font-semibold text-text-muted hover:text-text"
        >
          <Icon name={copied ? 'check' : 'content_copy'} className="text-[13px]" /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-surface-high/40 p-3 text-[11px] leading-relaxed">{text}</pre>
    </div>
  )
}

function MappingTable({ left, right, rows }: { left: string; right: string; rows: Array<[string, string]> }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border text-xs">
      {(left || right) && (
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] bg-surface-high/60 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      )}
      {rows.map(([a, b]) => (
        <div key={a} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2 border-t border-border px-3 py-2">
          <span className="font-semibold">{a}</span>
          <span className="text-text-muted">{b}</span>
        </div>
      ))}
    </div>
  )
}

function WhatsAppBubble({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-[#e5ddd5] p-4 dark:bg-[#0b141a]">
      <div className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-xs text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
        {text}
      </div>
    </div>
  )
}

// ----------------------------------------------------------- settings

function SettingsTab({
  integration,
  canManage,
  onSaved,
  onNotice,
}: {
  integration: Integration
  canManage: boolean
  onSaved: () => void
  onNotice: (n: { tone: 'ok' | 'error'; text: string } | null) => void
}) {
  const key = integration.key
  const connected = integration.status === 'connected'
  const showForm = FORM_KEYS.has(key) && !isSheetsOauth(integration)
  return (
    <div className="flex flex-col gap-4">
      {showForm && <ConnectionForm integration={integration} canManage={canManage} onSaved={onSaved} onNotice={onNotice} />}
      {!connected && !showForm && (
        <Panel title="Not connected" icon="link_off">
          <p className="text-xs text-text-muted">Connect {integration.name} with the button at the top of this page to see its settings.</p>
        </Panel>
      )}
      {connected && key === 'whatsapp' && <TemplateEditor integration={integration} canManage={canManage} onSaved={onSaved} onNotice={onNotice} />}
      {connected && DELIVERY_KEYS.includes(key) && (
        <EventsPanel integration={integration} canManage={canManage} onSaved={onSaved} onNotice={onNotice} />
      )}
      {connected && fieldsConfigurable(integration) && (
        <FieldsPanel integration={integration} canManage={canManage} onSaved={onSaved} onNotice={onNotice} />
      )}
      {connected && DELIVERY_KEYS.includes(key) && <AgentsPanel integration={integration} canManage={canManage} onNotice={onNotice} />}
      {key === 'arthaleads' && <ArthaleadsRouting canManage={canManage} />}
      {key === 'facebook' && <LeadWebhookPanel />}
      {key === 'sheets' && isSheetsOauth(integration) && (
        <Panel title="Your sheet" icon="table_chart">
          <p className="text-xs text-text-muted">
            You can rename the spreadsheet, move it to another folder or share it with your team - delivery keeps working. Don’t delete the
            “{integration.config.sheet_title || 'Leads'}” tab. Reconnect re-applies the Vistrow styling to the same sheet.
          </p>
        </Panel>
      )}
    </div>
  )
}

function ConnectionForm({
  integration,
  canManage,
  onSaved,
  onNotice,
}: {
  integration: Integration
  canManage: boolean
  onSaved: () => void
  onNotice: (n: { tone: 'ok' | 'error'; text: string } | null) => void
}) {
  const key = integration.key
  const connected = integration.status === 'connected'
  const [url, setUrl] = useState<string>(integration.config.url || '')
  const [token, setToken] = useState<string>(integration.config.token || '')
  const [name, setName] = useState(key === 'webhook' && connected ? integration.name : '')
  const [showToken, setShowToken] = useState(false)
  const [saving, setSaving] = useState(false)

  const needsUrl = key !== 'arthaleads'
  const canSave = canManage && !saving && (needsUrl ? /^https:\/\/\S+$/.test(url.trim()) : token.trim().length > 0)

  const save = async () => {
    setSaving(true)
    onNotice(null)
    try {
      if (key === 'arthaleads') await updateIntegration(key, 'connected', { token: token.trim() })
      else {
        const config: Record<string, string> = { url: url.trim() }
        if (key === 'webhook' && token.trim()) config.token = token.trim()
        await updateIntegration(key, 'connected', config, key === 'webhook' ? name.trim() || undefined : undefined)
      }
      onNotice({ tone: 'ok', text: connected ? 'Saved.' : `${integration.name} connected. Send a test to check it.` })
      onSaved()
    } catch (error) {
      onNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save' })
    } finally {
      setSaving(false)
    }
  }

  const title =
    key === 'arthaleads' ? 'Connection key' : key === 'whatsapp' ? 'Provider' : key === 'sheets' ? 'Apps Script web app' : 'Endpoint'
  return (
    <Panel title={title} icon="settings_ethernet">
      <div className="flex flex-col gap-3">
        {key === 'sheets' && (
          <p className="text-xs text-text-muted">
            Advanced: a Google Apps Script web-app URL that appends the lead JSON as a row. Most people should use Sign in with Google at the top
            of this page instead.
          </p>
        )}
        {key === 'webhook' && (
          <Field label="Display name" hint="Shown on your Integrations page, e.g. “ArthaLeads CRM”.">
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} placeholder="CRM / Webhook" className={INPUT} />
          </Field>
        )}
        {needsUrl && (
          <Field
            label={key === 'whatsapp' ? 'Send endpoint' : 'URL'}
            hint={key === 'whatsapp' ? 'Your provider’s endpoint that accepts { to, message }.' : 'Must start with https:// and answer within 5 seconds.'}
          >
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={!canManage}
              placeholder={
                key === 'whatsapp'
                  ? 'https://your-provider.example.com/whatsapp/send'
                  : key === 'sheets'
                    ? 'https://script.google.com/macros/s/…/exec'
                    : 'https://your-crm.example.com/webhook'
              }
              className={INPUT}
            />
          </Field>
        )}
        {(key === 'webhook' || key === 'arthaleads') && (
          <Field
            label={key === 'arthaleads' ? 'Connection key' : 'Auth token (optional)'}
            hint={key === 'arthaleads' ? 'In ArthaLeads, open Integrations → Vistrow Voice and copy the connection key.' : 'Sent as a "token" field in the JSON body.'}
          >
            <div className="flex gap-2">
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={!canManage}
                autoComplete="off"
                placeholder={key === 'arthaleads' ? 'Paste your ArthaLeads connection key' : 'Optional'}
                className={`${INPUT} flex-1`}
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="rounded-lg border border-border bg-surface px-3 text-text-muted hover:text-text"
                aria-label={showToken ? 'Hide' : 'Show'}
              >
                <Icon name={showToken ? 'visibility_off' : 'visibility'} className="text-[16px]" />
              </button>
            </div>
          </Field>
        )}
        {canManage && (
          <div>
            <PrimaryButton icon={connected ? 'save' : 'link'} onClick={save} disabled={!canSave}>
              {saving ? 'Saving…' : connected ? 'Save changes' : 'Save & connect'}
            </PrimaryButton>
          </div>
        )}
      </div>
    </Panel>
  )
}

function EventsPanel({
  integration,
  canManage,
  onSaved,
  onNotice,
}: {
  integration: Integration
  canManage: boolean
  onSaved: () => void
  onNotice: (n: { tone: 'ok' | 'error'; text: string } | null) => void
}) {
  const [chosen, setChosen] = useState<string[]>(effectiveEvents(integration))
  const [saving, setSaving] = useState(false)
  const saved = effectiveEvents(integration)
  const dirty = chosen.length !== saved.length || chosen.some((e) => !saved.includes(e))

  if (!eventsConfigurable(integration)) {
    return (
      <Panel title="What gets sent" icon="tune">
        <p className="text-xs text-text-muted">
          {integration.key === 'arthaleads'
            ? 'ArthaLeads always gets one complete record per call, when the call ends - with the transcript and recording. This keeps your CRM free of half-filled duplicates.'
            : 'One record per caller, when the call ends, only if they left a phone number or email. This keeps the list free of duplicates and anonymous visitors, so it isn’t adjustable.'}
        </p>
      </Panel>
    )
  }

  const save = async () => {
    setSaving(true)
    onNotice(null)
    try {
      await updateIntegrationSettings(integration.key, { events: chosen })
      onNotice({ tone: 'ok', text: 'Saved. Applies from the next call.' })
      onSaved()
    } catch (error) {
      onNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel title="What gets sent" icon="tune" subtitle="Choose which moments in a call send to this integration.">
      <div className="flex flex-col gap-2">
        {EVENTS.map((e) => (
          <label key={e.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:border-primary/50">
            <input
              type="checkbox"
              className="mt-0.5 accent-primary"
              checked={chosen.includes(e.id)}
              disabled={!canManage || saving}
              onChange={(ev) => setChosen((cur) => (ev.target.checked ? [...cur, e.id] : cur.filter((x) => x !== e.id)))}
            />
            <span>
              <span className="block text-sm font-semibold">{e.label}</span>
              <span className="block text-[11px] text-text-muted">{e.hint}</span>
            </span>
          </label>
        ))}
        {integration.key === 'whatsapp' && chosen.length > 1 && (
          <p className="rounded-lg bg-warning/10 p-2 text-[11px] text-text">
            Each chosen event sends the caller a WhatsApp message, so they may get several during one call.
          </p>
        )}
        {canManage && (
          <div className="mt-1 flex items-center gap-3">
            <PrimaryButton icon="save" onClick={save} disabled={!dirty || saving || chosen.length === 0}>
              {saving ? 'Saving…' : 'Save'}
            </PrimaryButton>
            {chosen.length === 0 && <span className="text-[11px] text-destructive">Pick at least one.</span>}
          </div>
        )}
      </div>
    </Panel>
  )
}

function FieldsPanel({
  integration,
  canManage,
  onSaved,
  onNotice,
}: {
  integration: Integration
  canManage: boolean
  onSaved: () => void
  onNotice: (n: { tone: 'ok' | 'error'; text: string } | null) => void
}) {
  const isSheet = integration.key === 'sheets'
  const options = isSheet ? FIELDS.filter((f) => f.sheetColumn) : FIELDS
  const [chosen, setChosen] = useState<string[]>(effectiveFields(integration))
  const [saving, setSaving] = useState(false)
  const saved = effectiveFields(integration)
  const dirty = chosen.length !== saved.length || chosen.some((f) => !saved.includes(f))
  const identifies = chosen.some((f) => ['name', 'phone', 'email'].includes(f))

  const save = async () => {
    setSaving(true)
    onNotice(null)
    try {
      const res = await updateIntegrationSettings(integration.key, { fields: chosen })
      if (res.sheetColumns && res.sheetColumns !== 'updated') {
        onNotice({ tone: 'error', text: `Saved, but the sheet’s columns could not be updated yet: ${res.sheetColumns}` })
      } else {
        onNotice({ tone: 'ok', text: isSheet ? 'Saved. Left-out columns are now hidden in your sheet and stay empty.' : 'Saved. Applies from the next call.' })
      }
      onSaved()
    } catch (error) {
      onNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel
      title={isSheet ? 'Columns in your sheet' : 'Fields to send'}
      icon="checklist_rtl"
      subtitle={
        isSheet
          ? 'Untick what your team shouldn’t see - for example the recording. Left-out data is never written to the sheet.'
          : 'Untick anything this integration shouldn’t receive. Left-out data is never sent.'
      }
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {options.map((f) => (
          <label key={f.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:border-primary/50">
            <input
              type="checkbox"
              className="mt-0.5 accent-primary"
              checked={chosen.includes(f.id)}
              disabled={!canManage || saving}
              onChange={(ev) => setChosen((cur) => (ev.target.checked ? [...cur, f.id] : cur.filter((x) => x !== f.id)))}
            />
            <span>
              <span className="block text-sm font-semibold">{f.label}</span>
              <span className="block text-[11px] text-text-muted">{f.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {isSheet && <p className="text-[11px] text-text-muted">Date/time is always included.</p>}
      {canManage && (
        <div className="flex flex-wrap items-center gap-3">
          <PrimaryButton icon="save" onClick={save} disabled={!dirty || saving || !identifies}>
            {saving ? 'Saving…' : 'Save'}
          </PrimaryButton>
          <button
            type="button"
            onClick={() => setChosen(FIELDS.map((f) => f.id))}
            className="bg-surface text-xs text-text-muted hover:text-text hover:underline"
            disabled={saving}
          >
            Select all
          </button>
          {!identifies && <span className="text-[11px] text-destructive">Keep at least one of name, phone or email.</span>}
        </div>
      )}
    </Panel>
  )
}

function TemplateEditor({
  integration,
  canManage,
  onSaved,
  onNotice,
}: {
  integration: Integration
  canManage: boolean
  onSaved: () => void
  onNotice: (n: { tone: 'ok' | 'error'; text: string } | null) => void
}) {
  const [text, setText] = useState<string>(integration.config.template || DEFAULT_WHATSAPP_MESSAGE)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    onNotice(null)
    try {
      // Saving the default text stores nothing, so a later change to the
      // default still reaches this account.
      await updateIntegrationSettings('whatsapp', { template: text.trim() === DEFAULT_WHATSAPP_MESSAGE ? '' : text })
      onNotice({ tone: 'ok', text: 'Message saved.' })
      onSaved()
    } catch (error) {
      onNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save' })
    } finally {
      setSaving(false)
    }
  }
  return (
    <Panel title="Message to the caller" icon="chat" subtitle="Use {name} for the caller’s name.">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            rows={5}
            disabled={!canManage}
            className={`${INPUT} resize-y`}
          />
          <div className="flex items-center justify-between text-[11px] text-text-muted">
            <button type="button" onClick={() => setText(DEFAULT_WHATSAPP_MESSAGE)} className="hover:text-text hover:underline" disabled={!canManage}>
              Reset to default
            </button>
            <span>{text.length}/1000</span>
          </div>
          {canManage && (
            <div>
              <PrimaryButton icon="save" onClick={save} disabled={saving || !text.trim()}>
                {saving ? 'Saving…' : 'Save message'}
              </PrimaryButton>
            </div>
          )}
        </div>
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">Preview</p>
          <WhatsAppBubble text={text.replace(/\{name\}/g, 'Asha')} />
        </div>
      </div>
    </Panel>
  )
}

// Agents keep their own allow-list (crmIntegrationKeys) - the same field
// the agent's page edits, so the two pages always agree. Empty = every
// integration. ['none'] = none (an empty list would mean "all").
function agentSendsTo(agent: AgentConfig, key: string): boolean {
  const keys = agent.crmIntegrationKeys ?? []
  return keys.length === 0 || keys.includes(key)
}

function nextAgentKeys(agent: AgentConfig, key: string, on: boolean): string[] {
  const keys = (agent.crmIntegrationKeys ?? []).filter((k) => k !== 'none')
  if (on) {
    if (keys.length === 0) return []
    const next = Array.from(new Set([...keys, key]))
    return DELIVERY_KEYS.every((k) => next.includes(k)) ? [] : next
  }
  const base = keys.length === 0 ? DELIVERY_KEYS : keys
  const next = base.filter((k) => k !== key)
  return next.length ? next : ['none']
}

function AgentsPanel({
  integration,
  canManage,
  onNotice,
}: {
  integration: Integration
  canManage: boolean
  onNotice: (n: { tone: 'ok' | 'error'; text: string } | null) => void
}) {
  const [agents, setAgents] = useState<AgentConfig[] | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  useEffect(() => {
    fetchAgents()
      .then((list) => setAgents(list.filter((a) => !a.isPlatformDemo)))
      .catch(() => setAgents([]))
  }, [])

  const toggle = async (agent: AgentConfig, on: boolean) => {
    const crmIntegrationKeys = nextAgentKeys(agent, integration.key, on)
    setBusy(agent.id)
    onNotice(null)
    try {
      await updateAgent(agent.id, { crmIntegrationKeys })
      setAgents((cur) => (cur ?? []).map((a) => (a.id === agent.id ? { ...a, crmIntegrationKeys } : a)))
    } catch (error) {
      onNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not update the agent' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel title="Agents that send here" icon="support_agent" subtitle="Turn an agent off to keep its calls out of this integration. Applies from its next call.">
      {agents === null ? (
        <p className="text-xs text-text-muted">Loading agents…</p>
      ) : agents.length === 0 ? (
        <p className="text-xs text-text-muted">No agents yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {agents.map((agent) => {
            const on = agentSendsTo(agent, integration.key)
            return (
              <div key={agent.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <Link to={`/dashboard/agents/${agent.id}`} className="block truncate text-sm font-semibold hover:text-primary">
                    {agent.name}
                  </Link>
                  <p className="text-[11px] text-text-muted">{agent.status === 'live' ? 'Live' : 'Draft'}</p>
                </div>
                <Switch
                  checked={on}
                  disabled={!canManage || busy === agent.id}
                  onChange={(v) => toggle(agent, v)}
                  label={`${agent.name} sends to ${integration.name}`}
                />
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

function LeadWebhookPanel() {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    fetchLeadWebhook().then((r) => setUrl(r.url)).catch(() => setUrl(null))
  }, [])
  return (
    <Panel title="Other lead sources" icon="webhook" subtitle="Leads from Zapier, your website forms or any tool that can send a webhook.">
      {url === undefined ? (
        <p className="text-xs text-text-muted">Loading…</p>
      ) : url === null ? (
        <p className="text-xs text-text-muted">Not available in this environment.</p>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-high/40 p-3 text-xs">
          <span className="flex-1 truncate font-mono">{`${url.split('?')[0]}?token=${'•'.repeat(16)}`}</span>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(url)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
            className="shrink-0 text-text-muted hover:text-text"
            aria-label="Copy webhook URL"
          >
            <Icon name={copied ? 'check' : 'content_copy'} className="text-[15px]" />
          </button>
        </div>
      )}
    </Panel>
  )
}

// ----------------------------------------------------------- activity

function ActivityTab({ integrationKey, connected }: { integrationKey: string; connected: boolean }) {
  const [status, setStatus] = useState('')
  const [data, setData] = useState<IntegrationDeliveries | null>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(() => {
    setLoading(true)
    fetchIntegrationDeliveries(integrationKey, status)
      .then(setData)
      .catch(() => setData({ items: [], stats: { sent7d: 0, failed7d: 0, skipped7d: 0 } }))
      .finally(() => setLoading(false))
  }, [integrationKey, status])
  useEffect(load, [load])

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {[['', 'All'], ['sent', 'Delivered'], ['failed', 'Failed'], ['skipped', 'Skipped']].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setStatus(value)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                status === value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface text-text-muted hover:text-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button onClick={load} className="flex items-center gap-1 text-xs font-semibold text-text-muted hover:text-text">
          <Icon name="refresh" className="text-[15px]" /> Refresh
        </button>
      </div>
      {loading && !data ? (
        <p className="py-6 text-center text-xs text-text-muted">Loading…</p>
      ) : !data || data.items.length === 0 ? (
        <div className="py-8 text-center">
          <Icon name="inbox" className="text-[28px] text-text-muted" />
          <p className="mt-2 text-sm font-semibold">Nothing here yet</p>
          <p className="text-xs text-text-muted">
            {connected ? 'Deliveries from calls and tests appear here. History is kept for 30 days.' : 'Connect this integration to start sending leads.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-widest text-text-muted">
                <th className="py-2 pr-3 font-bold">When</th>
                <th className="py-2 pr-3 font-bold">Event</th>
                <th className="py-2 pr-3 font-bold">Caller</th>
                <th className="py-2 pr-3 font-bold">Result</th>
                <th className="py-2 font-bold">Details</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((d) => (
                <tr key={d.id} className="border-b border-border/60 align-top last:border-0">
                  <td className="whitespace-nowrap py-2.5 pr-3 text-text-muted" title={formatDateTime(utcTime(d.createdAt))}>
                    {formatDateTime(utcTime(d.createdAt))}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3">{EVENT_LABELS[d.eventType] ?? (d.eventType || '-')}</td>
                  <td className="py-2.5 pr-3">
                    {d.callId ? (
                      <Link to={`/dashboard/calls/${d.callId}`} className="font-semibold text-primary hover:underline">
                        {d.leadName || `Call #${d.callId}`}
                      </Link>
                    ) : (
                      <span className="font-semibold">{d.leadName || '-'}</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <ResultBadge status={d.status} />
                  </td>
                  <td className="py-2.5 text-text-muted">
                    {d.detail || (d.status === 'sent' ? 'Delivered' : '-')}
                    {d.status === 'failed' && fixFor(d.detail) && <span className="block text-[11px]">{fixFor(d.detail)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function ResultBadge({ status }: { status: string }) {
  const style =
    status === 'sent'
      ? 'bg-success/10 text-success'
      : status === 'failed'
        ? 'bg-destructive/10 text-destructive'
        : 'bg-surface-high text-text-muted'
  const label = status === 'sent' ? 'Delivered' : status === 'failed' ? 'Failed' : 'Skipped'
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${style}`}>{label}</span>
}

const CALL_STATUS: Record<string, string> = {
  pending: 'Queued',
  calling: 'Calling now',
  done: 'Called',
  completed: 'Called',
  failed: 'Call failed',
  blocked: 'Blocked by your rules',
  not_queued: 'Not called',
}

function FacebookLeadsTab() {
  const [leads, setLeads] = useState<FacebookLead[] | null>(null)
  useEffect(() => {
    fetchFacebookLeads().then(setLeads).catch(() => setLeads([]))
  }, [])
  return (
    <Card>
      {leads === null ? (
        <p className="py-6 text-center text-xs text-text-muted">Loading…</p>
      ) : leads.length === 0 ? (
        <div className="py-8 text-center">
          <Icon name="inbox" className="text-[28px] text-text-muted" />
          <p className="mt-2 text-sm font-semibold">No Facebook leads yet</p>
          <p className="text-xs text-text-muted">Leads from your Lead Ads forms appear here as they arrive.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-widest text-text-muted">
                <th className="py-2 pr-3 font-bold">Received</th>
                <th className="py-2 pr-3 font-bold">Name</th>
                <th className="py-2 pr-3 font-bold">Phone</th>
                <th className="py-2 font-bold">Call</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.leadId} className="border-b border-border/60 last:border-0">
                  <td className="whitespace-nowrap py-2.5 pr-3 text-text-muted">{formatDateTime(utcTime(lead.createdAt))}</td>
                  <td className="py-2.5 pr-3 font-semibold">{lead.name || '-'}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3">{lead.phone || '-'}</td>
                  <td className="py-2.5">
                    {lead.callId ? (
                      <Link to={`/dashboard/calls/${lead.callId}`} className="font-semibold text-primary hover:underline">
                        {CALL_STATUS[lead.callStatus] ?? lead.callStatus}
                      </Link>
                    ) : (
                      CALL_STATUS[lead.callStatus] ?? lead.callStatus
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// --------------------------------------------------------------- help

const HELP: Record<string, { steps: string[]; problems: Array<[string, string]> }> = {
  sheets: {
    steps: [
      'Click Sign in with Google and pick the Google account that should own the sheet.',
      'We create “Vistrow Voice — Leads” in that account’s Drive, styled and ready. Each agent gets its own tab.',
      'Click Send test - a row marked “TEST — safe to delete” appears.',
      'From then on, every caller who leaves a phone number or email becomes a row in their agent’s tab when the call ends.',
      'Optional: on the Settings tab, untick columns your team shouldn’t see, such as the recording.',
    ],
    problems: [
      ['“Google access was removed”', 'Someone removed Vistrow Voice from the Google account, or its password changed. Click Reconnect.'],
      ['“The leads sheet was deleted”', 'Click Reconnect - a fresh sheet is created.'],
      ['A caller is missing', 'Callers who left no phone or email are skipped on purpose. Check the Activity tab.'],
    ],
  },
  zoho_crm: {
    steps: [
      'Click Connect with Zoho and sign in with a Zoho CRM admin account.',
      'Approve access to Leads.',
      'Click Send test - “Test Lead” appears in Zoho → Leads.',
      'Each caller who leaves a phone or email becomes a lead; repeat callers update their existing lead.',
    ],
    problems: [
      ['“Delivery failed - check connection”', 'The Zoho grant expired or was revoked. Click Reconnect.'],
      ['Duplicate leads in Zoho', 'Leads are matched on phone, then email. A caller who gives a different number creates a new lead.'],
    ],
  },
  arthaleads: {
    steps: [
      'In ArthaLeads, open Integrations → Vistrow Voice and copy the connection key.',
      'Paste it on the Settings tab here and save.',
      'Click Send test and check it arrived in ArthaLeads.',
      'Optional: on the Settings tab, choose which new ArthaLeads leads your agents should call.',
    ],
    problems: [
      ['“Invalid token - reconnect”', 'The key was changed in ArthaLeads. Copy the new key and save it on the Settings tab.'],
      ['A lead was skipped', 'ArthaLeads needs both a name and a phone number. You can push any call by hand from its lead page.'],
    ],
  },
  webhook: {
    steps: [
      'Paste a URL that accepts a JSON POST (your CRM, Zapier, Make, n8n…).',
      'Optionally add a token; it is sent as a “token” field in the body.',
      'Click Send test and check your receiver got it.',
      'Pick which call events to send on the Settings tab.',
    ],
    problems: [
      ['HTTP 4xx', 'The receiver rejected the request - usually a wrong URL or token.'],
      ['HTTP 5xx or network error', 'The receiver was down or took longer than 5 seconds to answer.'],
    ],
  },
  slack: {
    steps: [
      'Click Connect Slack and choose the channel for lead alerts.',
      'Click Send test - a sample lead is posted to that channel.',
      'Pick which call events to post on the Settings tab.',
      'To use a different channel, click Reconnect and choose it.',
    ],
    problems: [['Nothing is posted', 'The Slack app may have been removed from the workspace. Click Reconnect.']],
  },
  whatsapp: {
    steps: [
      'Paste your WhatsApp provider’s send endpoint (Gupshup, Twilio, Interakt…) that accepts { to, message }.',
      'Write the message the caller should receive on the Settings tab.',
      'Click Send test - the sample goes to +91 99999 99999, so check your provider’s logs.',
      'By default the caller gets one message, when the call ends.',
    ],
    problems: [
      ['Message not delivered', 'WhatsApp only allows free-form messages within 24 hours of the customer messaging you; outside that, your provider needs an approved template.'],
    ],
  },
  facebook: {
    steps: [
      'Click Connect Facebook and choose the Page that runs your Lead Ads.',
      'We subscribe that Page to new leads automatically.',
      'Each new lead is added to Contacts and called by your instant follow-up campaign.',
      'Make sure the instant follow-up campaign is running and has a phone number, or leads won’t be called.',
    ],
    problems: [
      ['Leads aren’t arriving', 'Check the Page is the one running the ads, then click Reconnect.'],
      ['Leads arrive but aren’t called', 'The instant follow-up campaign is paused or has no number, or your calling hours are closed.'],
    ],
  },
}

function HelpTab({ integration }: { integration: Integration }) {
  const help = HELP[integration.key] ?? HELP.webhook
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title="Set it up" icon="checklist">
        <ol className="flex flex-col gap-3 text-xs">
          {help.steps.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">{i + 1}</span>
              <span className="pt-1">{step}</span>
            </li>
          ))}
        </ol>
      </Panel>
      <Panel title="If something goes wrong" icon="help">
        <div className="flex flex-col gap-3 text-xs">
          {help.problems.map(([problem, fix]) => (
            <div key={problem}>
              <p className="font-semibold">{problem}</p>
              <p className="text-text-muted">{fix}</p>
            </div>
          ))}
          <Link to="/dashboard/support" className="mt-1 w-fit font-semibold text-primary hover:underline">
            Still stuck? Contact support
          </Link>
        </div>
      </Panel>
    </div>
  )
}

// ---------------------------------------------------------------- bits

const INPUT = 'w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60'

function Panel({ title, icon, subtitle, children }: { title: string; icon: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card variant="flat" className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <Icon name={icon} className="mt-0.5 text-[18px] text-primary" />
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {subtitle && <p className="text-[11px] text-text-muted">{subtitle}</p>}
        </div>
      </div>
      {children}
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="truncate font-semibold">{value}</dd>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-text-muted">{hint}</span>}
    </label>
  )
}

function Switch({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-surface-high ring-1 ring-border'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

/** Google's sign-in branding: the "G" mark on a white, lightly bordered
 * button with the text "Sign in with Google", never recoloured. */
function GoogleSignInButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-2.5 rounded-lg border border-[#dadce0] bg-white px-4 py-2 text-xs font-bold text-[#3c4043] hover:bg-[#f8f9fa]"
      style={{ fontFamily: 'Roboto, Inter, system-ui, sans-serif' }}
    >
      <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden="true">
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
        <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
      </svg>
      Sign in with Google
    </button>
  )
}

function PrimaryButton({ icon, onClick, disabled, children }: { icon: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon name={icon} className="text-[15px]" />
      {children}
    </button>
  )
}

function SecondaryButton({ icon, onClick, disabled, children }: { icon: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-bold text-text hover:border-primary disabled:opacity-50"
    >
      <Icon name={icon} className="text-[15px]" />
      {children}
    </button>
  )
}
