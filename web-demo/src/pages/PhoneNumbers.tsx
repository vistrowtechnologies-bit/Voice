import { useEffect, useState } from 'react'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import {
  addPhoneNumber,
  assignPhoneNumber,
  connectEnablex,
  deletePhoneNumber,
  disconnectEnablex,
  fetchAgents,
  fetchPhoneNumbers,
  fetchTelephonyStatus,
  placeTestCall,
} from '../lib/api'
import { isE164 } from '../lib/phone'
import type { AgentConfig, PhoneNumber, TelephonyStatus } from '../lib/types'

const PROVIDERS = [
  { key: 'enablex', name: 'EnableX', icon: 'bolt', note: 'Indian & global voice — our telephony provider', live: true },
  { key: 'twilio', name: 'Twilio', icon: 'public', note: 'Global coverage', live: false },
  { key: 'exotel', name: 'Exotel', icon: 'call', note: 'Indian telephony', live: false },
  { key: 'plivo', name: 'Plivo', icon: 'sip', note: 'Competitive rates', live: false },
]

export function PhoneNumbers() {
  const [provider, setProvider] = useState('enablex')
  const active = PROVIDERS.find((p) => p.key === provider)!

  return (
    <DashboardLayout>
      <PageHeader title="Phone Numbers" subtitle="Connect a provider, add numbers, and route calls to AI agents" />

      <section className="flex flex-col gap-4 p-4 sm:p-6 lg:flex-row">
        <aside className="flex shrink-0 flex-row gap-2 overflow-x-auto lg:w-56 lg:flex-col">
          <p className="hidden px-2 text-[10px] font-bold uppercase tracking-widest text-text-muted lg:block">
            Providers
          </p>
          {PROVIDERS.map((p) => (
            <button
              key={p.key}
              onClick={() => setProvider(p.key)}
              className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm ${
                provider === p.key ? 'bg-surface-high text-text' : 'text-text-muted hover:bg-surface-high/50'
              }`}
            >
              <Icon name={p.icon} className="text-[18px]" />
              {p.name}
              {p.live && <span className="rounded bg-cyan/15 px-1.5 py-0.5 text-[9px] font-bold text-cyan">LIVE</span>}
              {provider === p.key && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan" />}
            </button>
          ))}
          <p className="hidden px-2 pt-2 text-[11px] text-text-muted lg:block">More providers coming soon</p>
        </aside>

        <div className="min-w-0 flex-1">
          {provider === 'enablex' ? <EnableXPanel /> : <ComingSoonPanel name={active.name} note={active.note} icon={active.icon} />}
        </div>
      </section>
    </DashboardLayout>
  )
}

function EnableXPanel() {
  const [status, setStatus] = useState<TelephonyStatus | null>(null)
  const [numbers, setNumbers] = useState<PhoneNumber[]>([])
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [appId, setAppId] = useState('')
  const [appKey, setAppKey] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  const [newNumber, setNewNumber] = useState('')
  const [newLabel, setNewLabel] = useState('')

  const reloadStatus = () => fetchTelephonyStatus().then(setStatus).catch(() => setStatus(null))
  const reloadNumbers = () => fetchPhoneNumbers().then(setNumbers).catch(() => setNumbers([]))

  useEffect(() => {
    reloadStatus()
    reloadNumbers()
    fetchAgents().then(setAgents).catch(() => setAgents([]))
  }, [])

  const handleConnect = async () => {
    setError('')
    setConnecting(true)
    try {
      const result = await connectEnablex(appId.trim(), appKey.trim())
      setStatus(result)
      setAppId('')
      setAppKey('')
    } catch {
      setError('Could not save credentials. Check the App ID and App Key.')
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Disconnect EnableX? Saved numbers stay, but calls stop until you reconnect.')) return
    await disconnectEnablex()
    reloadStatus()
  }

  const handleAddNumber = async () => {
    if (!newNumber.trim()) return
    await addPhoneNumber(newNumber.trim(), newLabel.trim(), null)
    setNewNumber('')
    setNewLabel('')
    reloadNumbers()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 text-primary">
          <Icon name="bolt" className="text-[20px]" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">EnableX Voice</h2>
            {status?.connected ? (
              <span className="flex items-center gap-1 rounded-full border border-cyan/30 bg-cyan/10 px-2 py-0.5 text-[10px] font-bold text-cyan">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan" /> Connected
              </span>
            ) : (
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold text-text-muted">
                Not connected
              </span>
            )}
          </div>
          <p className="text-sm text-text-muted">
            Programmable voice for inbound &amp; outbound calling. Credentials come from your EnableX
            Portal → Project Settings → API Credentials.
          </p>
        </div>
      </div>

      {!status?.connected ? (
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="mb-1 text-sm font-semibold">Connect your EnableX project</h3>
          <p className="mb-4 text-xs text-text-muted">
            Create a project with the Voice service in the EnableX portal, then paste its API
            credentials here. The App Key is stored server-side only and never sent back to the browser.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="App ID">
              <input
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="e.g. 6f2c…"
                className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </Field>
            <Field label="App Key (secret)">
              <input
                type="password"
                value={appKey}
                onChange={(e) => setAppKey(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </Field>
          </div>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          <button
            onClick={handleConnect}
            disabled={connecting || !appId.trim() || !appKey.trim()}
            className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-40"
          >
            <Icon name="link" className="text-[18px]" />
            {connecting ? 'Connecting…' : 'Connect EnableX'}
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan/30 bg-cyan/5 p-4">
            <div className="flex items-center gap-2 text-sm">
              <Icon name="check_circle" className="text-[18px] text-cyan" />
              <span>
                Connected as App ID <span className="font-mono font-semibold">{status.appIdHint}</span>
              </span>
            </div>
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10"
            >
              <Icon name="link_off" className="text-[15px]" />
              Disconnect
            </button>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="mb-3 text-sm font-semibold">Add a virtual number</h3>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Virtual number (E.164)">
                <input
                  value={newNumber}
                  onChange={(e) => setNewNumber(e.target.value)}
                  placeholder="+911140848000"
                  className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </Field>
              <Field label="Label (optional)">
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Mumbai sales line"
                  className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </Field>
              <button
                onClick={handleAddNumber}
                disabled={!newNumber.trim()}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-40"
              >
                <Icon name="add" className="text-[18px]" />
                Add number
              </button>
            </div>
            <p className="mt-2 text-[11px] text-text-muted">
              Provision the number in your EnableX portal first, then register it here to route its calls to an agent.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-surface">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-sm font-semibold">Your numbers ({numbers.length})</h3>
            </div>
            {numbers.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-text-muted">
                No numbers yet — add a provisioned EnableX virtual number above.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {numbers.map((n) => (
                  <NumberRow
                    key={n.id}
                    number={n}
                    agents={agents}
                    onChange={reloadNumbers}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function NumberRow({
  number,
  agents,
  onChange,
}: {
  number: PhoneNumber
  agents: AgentConfig[]
  onChange: () => void
}) {
  const [testTo, setTestTo] = useState('')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [showTest, setShowTest] = useState(false)

  const runTest = async () => {
    const to = testTo.trim()
    if (!to) return
    if (!isE164(to)) {
      setResult('✕ Enter the number in full international format, starting with + and the country code (e.g. +919812345678).')
      return
    }
    setTesting(true)
    setResult(null)
    try {
      const res = await placeTestCall(number.number, to)
      setResult(res.ok ? '✓ EnableX accepted the call — the destination should ring shortly.' : `✕ ${res.error}`)
    } catch {
      setResult('✕ Request failed — is the backend running?')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Icon name="dialpad" className="text-[18px] text-cyan" />
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold">{number.number}</p>
          {number.label && <p className="text-[11px] text-text-muted">{number.label}</p>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={number.agentId ?? ''}
            onChange={(e) => assignPhoneNumber(number.id, e.target.value ? Number(e.target.value) : null).then(onChange)}
            className="rounded-lg border border-border bg-surface-high px-2.5 py-1.5 text-xs"
          >
            <option value="">Unassigned</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                → {a.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowTest((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-cyan/40 px-2.5 py-1.5 text-xs font-bold text-cyan hover:bg-cyan/10"
          >
            <Icon name="call" className="text-[15px]" />
            Test call
          </button>
          <button
            onClick={() => confirm(`Remove ${number.number}?`) && deletePhoneNumber(number.id).then(onChange)}
            aria-label={`Delete ${number.number}`}
            className="text-text-muted hover:text-destructive"
          >
            <Icon name="delete" className="text-[18px]" />
          </button>
        </div>
      </div>

      {showTest && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-high/40 p-3">
          <input
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="Call this number, e.g. +9199…"
            className="min-w-[180px] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={runTest}
            disabled={testing || !testTo.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-40"
          >
            {testing ? 'Placing…' : 'Place call'}
          </button>
          {result && (
            <p className={`w-full text-xs ${result.startsWith('✓') ? 'text-cyan' : 'text-destructive'}`}>{result}</p>
          )}
        </div>
      )}
    </div>
  )
}

function ComingSoonPanel({ name, note, icon }: { name: string; note: string; icon: string }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border p-6 text-center text-text-muted">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border">
        <Icon name={icon} className="text-[24px]" />
      </div>
      <p className="text-sm font-bold">{name} — coming soon</p>
      <p className="max-w-sm text-xs">
        {note}. We're standardising on EnableX first; ask us to prioritise {name} if you need it.
      </p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">{label}</span>
      {children}
    </label>
  )
}
