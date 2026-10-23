import { useEffect, useMemo, useState } from 'react'
import {
  waBroadcast, waBroadcasts, waEvents, waMessages, waSend, waSetEvent, waStatus, waSyncTemplates, waTemplates,
  type WaBroadcast, type WaEventTemplate, type WaMessage, type WaSenderStatus, type WaTemplate,
} from '../../lib/adminApi'
import { AdminCard, EmptyState, errMsg, ErrorState, FilterChip, fmtDateTime, PageHeader, Pill, timeAgo } from '../../components/AdminUI'

type Tab = 'templates' | 'send' | 'broadcasts' | 'log' | 'automations'

const EVENT_LABELS: Record<string, { label: string; hint: string }> = {
  otp: { label: 'Login / sign-up code', hint: 'Authentication template with a copy-code button. Value 1 = the code.' },
  topup_receipt: { label: 'Top-up confirmation', hint: 'Utility template sent after a successful payment.' },
  invoice: { label: 'Invoice', hint: 'Utility template with the invoice number and amount.' },
  welcome: { label: 'Welcome', hint: 'Utility template after a workspace is created.' },
  low_credit: { label: 'Low credits', hint: 'Utility template when credits drop low.' },
}

const STATUS_TONE: Record<string, 'active' | 'warning' | 'suspended' | 'neutral' | 'primary'> = {
  read: 'active', delivered: 'active', sent: 'primary', queued: 'neutral', failed: 'suspended',
  APPROVED: 'active', PENDING: 'warning', REJECTED: 'suspended', PAUSED: 'warning', DISABLED: 'suspended',
}

/** Admin → WhatsApp: Vistrow's own sender (internal use only). Templates are
 * created and approved in Meta's WhatsApp Manager; this page syncs them,
 * sends one, broadcasts to opted-in numbers, maps platform events to
 * templates and shows delivery. */
export function AdminWhatsApp() {
  const [tab, setTab] = useState<Tab>('templates')
  const [status, setStatus] = useState<WaSenderStatus | null>(null)
  const [templates, setTemplates] = useState<WaTemplate[]>([])
  const [error, setError] = useState<string | null>(null)

  const loadTemplates = () => waTemplates().then((r) => setTemplates(r.templates)).catch((e: unknown) => setError(errMsg(e)))
  useEffect(() => {
    waStatus().then(setStatus).catch((e: unknown) => setError(errMsg(e)))
    loadTemplates()
  }, [])
  const approved = useMemo(() => templates.filter((t) => t.status === 'APPROVED'), [templates])

  return (
    <>
      <PageHeader
        title="WhatsApp"
        subtitle={`Vistrow's own WhatsApp sender${status ? ` · ${status.displayNumber}` : ''}. Internal use only: OTP, top-ups, invoices, updates and opted-in offers.`}
      />
      {status && !status.configured && (
        <div className="mb-4 rounded-lg border border-amber/40 bg-amber/10 px-4 py-3 text-sm" role="status">
          <strong>Not connected yet.</strong> Add a system-user token for WhatsApp account {status.wabaId} as{' '}
          <code className="font-mono text-xs">WA_SENDER_TOKEN</code> on the server. Sending also needs a payment method on the
          WhatsApp account and approved templates.
        </div>
      )}
      {error && <ErrorState message={error} onRetry={() => { setError(null); loadTemplates() }} />}
      <div className="mb-4 flex flex-wrap gap-2">
        {(['templates', 'send', 'broadcasts', 'log', 'automations'] as Tab[]).map((t) => (
          <FilterChip key={t} active={tab === t} onClick={() => setTab(t)}>
            {{ templates: 'Templates', send: 'Send', broadcasts: 'Broadcasts', log: 'Message log', automations: 'Automations' }[t]}
          </FilterChip>
        ))}
      </div>
      {tab === 'templates' && <TemplatesTab templates={templates} onSynced={setTemplates} configured={!!status?.configured} />}
      {tab === 'send' && <SendTab templates={approved} />}
      {tab === 'broadcasts' && <BroadcastsTab templates={approved} />}
      {tab === 'log' && <LogTab />}
      {tab === 'automations' && <AutomationsTab templates={approved} />}
    </>
  )
}

function TemplatesTab({ templates, onSynced, configured }: { templates: WaTemplate[]; onSynced: (t: WaTemplate[]) => void; configured: boolean }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const sync = () => {
    setBusy(true)
    setNote('')
    waSyncTemplates()
      .then((r) => { onSynced(r.templates); setNote(`Synced ${r.synced} template(s) from Meta.`) })
      .catch((e: unknown) => setNote(errMsg(e)))
      .finally(() => setBusy(false))
  }
  return (
    <AdminCard className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <p className="text-sm text-text-muted">Create and submit templates in Meta's WhatsApp Manager, then sync them here.</p>
        <button onClick={sync} disabled={busy || !configured} className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy ? 'Syncing…' : 'Sync from Meta'}
        </button>
      </div>
      {note && <p className="px-4 py-2 text-sm" role="status">{note}</p>}
      {templates.length === 0 ? (
        <EmptyState icon="chat" message="No templates synced yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2.5 font-semibold">Template</th>
                <th className="px-4 py-2.5 font-semibold">Category</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Text</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={`${t.name}-${t.language}`} className="border-b border-border/60 last:border-0 align-top">
                  <td className="px-4 py-3 font-mono text-xs">{t.name}<span className="block text-text-muted">{t.language}</span></td>
                  <td className="px-4 py-3 text-xs">{t.category}</td>
                  <td className="px-4 py-3"><Pill tone={STATUS_TONE[t.status] ?? 'neutral'}>{t.status}</Pill></td>
                  <td className="px-4 py-3 text-xs text-text-muted whitespace-pre-line">{t.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
  )
}

function TemplatePicker({ templates, value, onChange }: { templates: WaTemplate[]; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm">
      <option value="">Choose an approved template…</option>
      {templates.map((t) => (
        <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{t.name} · {t.language} · {t.category}</option>
      ))}
    </select>
  )
}

function useTemplateParams(templates: WaTemplate[], picked: string) {
  const template = templates.find((t) => `${t.name}|${t.language}` === picked)
  const [params, setParams] = useState<string[]>([])
  useEffect(() => setParams(Array(template?.param_count ?? 0).fill('')), [template?.name, template?.language, template?.param_count])
  return { template, params, setParams }
}

function ParamInputs({ params, setParams }: { params: string[]; setParams: (p: string[]) => void }) {
  return (
    <>
      {params.map((v, i) => (
        <input key={i} value={v} onChange={(e) => setParams(params.map((p, j) => (j === i ? e.target.value : p)))}
          placeholder={`Value {{${i + 1}}}`} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
      ))}
    </>
  )
}

function SendTab({ templates }: { templates: WaTemplate[] }) {
  const [picked, setPicked] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const { template, params, setParams } = useTemplateParams(templates, picked)
  const send = () => {
    if (!template) return
    setBusy(true)
    setNote('')
    waSend({ to, template: template.name, language: template.language, params })
      .then((r) => setNote(r.status === 'sent' ? 'Sent. Delivery shows in the message log.' : `Failed: ${r.error ?? ''}`))
      .catch((e: unknown) => setNote(errMsg(e)))
      .finally(() => setBusy(false))
  }
  return (
    <AdminCard className="max-w-xl space-y-3 p-4">
      <TemplatePicker templates={templates} value={picked} onChange={setPicked} />
      {template && <p className="rounded-lg bg-surface-high px-3 py-2 text-xs text-text-muted whitespace-pre-line">{template.body}</p>}
      <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Phone number, e.g. 98765 43210" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
      <ParamInputs params={params} setParams={setParams} />
      <button onClick={send} disabled={busy || !template || !to.trim() || params.some((p) => !p.trim())} className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
        {busy ? 'Sending…' : 'Send'}
      </button>
      {note && <p className="text-sm" role="status">{note}</p>}
    </AdminCard>
  )
}

function BroadcastsTab({ templates }: { templates: WaTemplate[] }) {
  const [list, setList] = useState<WaBroadcast[] | null>(null)
  const [picked, setPicked] = useState('')
  const [name, setName] = useState('')
  const [numbers, setNumbers] = useState('')
  const [optIn, setOptIn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const { template, params, setParams } = useTemplateParams(templates, picked)
  const load = () => waBroadcasts().then((r) => setList(r.broadcasts)).catch((e: unknown) => setNote(errMsg(e)))
  useEffect(() => { load() }, [])
  const start = () => {
    if (!template) return
    setBusy(true)
    setNote('')
    waBroadcast({ name, template: template.name, language: template.language, params, numbers, confirmOptIn: optIn })
      .then((r) => { setNote(`Sending to ${r.queued} number(s).${r.invalid.length ? ` Skipped ${r.invalid.length} invalid.` : ''}`); load() })
      .catch((e: unknown) => setNote(errMsg(e)))
      .finally(() => setBusy(false))
  }
  return (
    <div className="space-y-4">
      <AdminCard className="max-w-xl space-y-3 p-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Broadcast name, e.g. Diwali offer" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        <TemplatePicker templates={templates} value={picked} onChange={setPicked} />
        {template && <p className="rounded-lg bg-surface-high px-3 py-2 text-xs text-text-muted whitespace-pre-line">{template.body}</p>}
        <ParamInputs params={params} setParams={setParams} />
        <textarea value={numbers} onChange={(e) => setNumbers(e.target.value)} rows={5} placeholder="Phone numbers, one per line or comma-separated (max 1,000)" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="mt-1" />
          Every number on this list agreed to receive WhatsApp messages from Vistrow.
        </label>
        <button onClick={start} disabled={busy || !template || !numbers.trim() || !optIn || params.some((p) => !p.trim())} className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy ? 'Starting…' : 'Send broadcast'}
        </button>
        {note && <p className="text-sm" role="status">{note}</p>}
      </AdminCard>
      <AdminCard className="overflow-hidden">
        {list === null ? (
          <div className="px-4 py-6 text-center text-sm text-text-muted">Loading…</div>
        ) : list.length === 0 ? (
          <EmptyState icon="campaign" message="No broadcasts yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2.5 font-semibold">Broadcast</th>
                  <th className="px-4 py-2.5 font-semibold">Template</th>
                  <th className="px-4 py-2.5 font-semibold">Total</th>
                  <th className="px-4 py-2.5 font-semibold">Sent</th>
                  <th className="px-4 py-2.5 font-semibold">Delivered</th>
                  <th className="px-4 py-2.5 font-semibold">Read</th>
                  <th className="px-4 py-2.5 font-semibold">Failed</th>
                </tr>
              </thead>
              <tbody>
                {list.map((b) => (
                  <tr key={b.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3">{b.name || `#${b.id}`}<span className="block text-[11px] text-text-muted" title={fmtDateTime(b.created_at)}>{timeAgo(b.created_at)}</span></td>
                    <td className="px-4 py-3 font-mono text-xs">{b.template}</td>
                    <td className="px-4 py-3">{b.total}</td>
                    <td className="px-4 py-3">{b.sent}</td>
                    <td className="px-4 py-3">{b.delivered}</td>
                    <td className="px-4 py-3">{b.read}</td>
                    <td className="px-4 py-3">{b.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  )
}

function LogTab() {
  const [rows, setRows] = useState<WaMessage[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = () => { setError(null); waMessages().then((r) => setRows(r.messages)).catch((e: unknown) => setError(errMsg(e))) }
  useEffect(load, [])
  return (
    <AdminCard className="overflow-hidden">
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : rows === null ? (
        <div className="px-4 py-6 text-center text-sm text-text-muted">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon="forum" message="No messages sent yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2.5 font-semibold">To</th>
                <th className="px-4 py-2.5 font-semibold">Template</th>
                <th className="px-4 py-2.5 font-semibold">Type</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Sent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-b border-border/60 last:border-0 align-top">
                  <td className="px-4 py-3 font-mono text-xs">+{m.to_phone}</td>
                  <td className="px-4 py-3 font-mono text-xs">{m.template}<span className="block text-text-muted">{m.category}</span></td>
                  <td className="px-4 py-3 text-xs">{m.kind}</td>
                  <td className="px-4 py-3">
                    <Pill tone={STATUS_TONE[m.status] ?? 'neutral'}>{m.status}</Pill>
                    {m.error && <span className="mt-1 block text-[11px] text-destructive">{m.error}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted" title={fmtDateTime(m.created_at)}>{timeAgo(m.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
  )
}

function AutomationsTab({ templates }: { templates: WaTemplate[] }) {
  const [events, setEvents] = useState<WaEventTemplate[] | null>(null)
  const [note, setNote] = useState('')
  useEffect(() => { waEvents().then((r) => setEvents(r.events)).catch((e: unknown) => setNote(errMsg(e))) }, [])
  const save = (e: WaEventTemplate, picked: string, enabled: boolean) => {
    const [template = '', language = 'en'] = picked.split('|')
    waSetEvent(e.event, { template, language, enabled })
      .then((r) => { setEvents(r.events); setNote('Saved.') })
      .catch((err: unknown) => setNote(errMsg(err)))
  }
  return (
    <AdminCard className="space-y-1 p-4">
      <p className="mb-2 text-sm text-text-muted">
        Pick the approved template each platform event sends. Saved choices are used once each event is switched on in its flow.
      </p>
      {events === null ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : (
        events.map((e) => {
          const value = e.template ? `${e.template}|${e.language}` : ''
          return (
            <div key={e.event} className="grid gap-2 border-b border-border/60 py-3 last:border-0 md:grid-cols-[1fr_1.4fr_auto] md:items-center">
              <div>
                <p className="text-sm font-semibold">{EVENT_LABELS[e.event]?.label ?? e.event}</p>
                <p className="text-xs text-text-muted">{EVENT_LABELS[e.event]?.hint}</p>
              </div>
              <TemplatePicker templates={templates} value={value} onChange={(v) => save(e, v, !!e.enabled && !!v)} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!e.enabled} disabled={!e.template} onChange={(ev) => save(e, value, ev.target.checked)} />
                On
              </label>
            </div>
          )
        })
      )}
      {note && <p className="pt-2 text-sm" role="status">{note}</p>}
    </AdminCard>
  )
}
