import { useEffect, useState } from 'react'
import { Card } from './ui/Card'
import { fetchAgents, fetchArthaleadsInboundConfig, fetchKnowledgeBases, fetchPhoneNumbers, updateArthaleadsInboundConfig } from '../lib/api'
import type { ArthaleadsInboundConfig } from '../lib/api'
import type { AgentConfig, KnowledgeBase, PhoneNumber } from '../lib/types'

/** Which new ArthaLeads leads get a call, and which agent/number places it.
 * Lives on the ArthaLeads integration page. */
export function ArthaleadsRouting({ canManage }: { canManage: boolean }) {
  const [arthaleadsInbound, setArthaleadsInbound] = useState<ArthaleadsInboundConfig | null>(null)
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([])
  const [inboundSaving, setInboundSaving] = useState(false)
  const [inboundMessage, setInboundMessage] = useState('')

  useEffect(() => {
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

  return (
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
              {canManage && <button aria-label={`Remove ${route.source} route`} onClick={() => setArthaleadsInbound({ ...arthaleadsInbound, routes: arthaleadsInbound.routes.filter((_, i) => i !== index) })} className="self-end rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-muted">Remove</button>}
              {route.ready && <p className="md:col-span-5 text-xs text-success">New leads for “{route.match}” will be called by {route.agentName}, using {route.knowledgeBaseName} and phone number {route.fromNumber}.</p>}
            </div>
          ))}
        </div>
        {canManage && <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => setArthaleadsInbound({ ...arthaleadsInbound, routes: [...arthaleadsInbound.routes, { source: 'facebook', match: '', agentId: null, agentName: '', knowledgeBaseName: '', fromNumber: '', ready: false }] })} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text">Choose another page or campaign</button>
          <button disabled={inboundSaving || arthaleadsInbound.routes.some((route) => Boolean(route.match.trim()) && arthaleadsInbound.sources[route.source] && (!route.agentId || !route.fromNumber || !arthaleadsInbound.telephonyConnected))} onClick={() => saveArthaleadsInbound({ ...arthaleadsInbound, routes: arthaleadsInbound.routes.filter((route) => route.match.trim()) })} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{inboundSaving ? 'Saving…' : 'Save call setup'}</button>
        </div>}
      </>}
      {!arthaleadsInbound?.telephonyConnected && <p className="mt-3 rounded-lg bg-warning/10 p-3 text-xs text-text-muted">To place calls, first connect your calling service and add a phone number in Phone settings.</p>}
      {inboundMessage && <p className="mt-3 text-xs text-text-muted">{inboundMessage}</p>}
    </Card>
  )
}
