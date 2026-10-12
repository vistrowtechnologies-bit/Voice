import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { Card } from '../components/ui/Card'
import { BrowserTestModal, DialTestModal } from '../components/AgentTestCall'
import { UpgradeRequiredModal } from '../components/UpgradeRequiredModal'
import {
  createAgent,
  deleteAgent,
  fetchAgents,
  fetchKnowledgeBases,
  fetchLaunchReadiness,
  fetchPhoneNumbers,
  formatDateTime,
  updateAgent,
} from '../lib/api'
import type { AgentConfig, KnowledgeBase, PhoneNumber, LaunchReadiness } from '../lib/types'
import { modelLabel, voiceLabel } from '../lib/agentOptions'
import { Tooltip } from '../components/ui/Tooltip'

type AgentFilter = 'all' | 'live' | 'needs-setup' | 'paused' | 'draft'

type ReadinessGap = {
  key: 'active' | 'voice' | 'model' | 'knowledge' | 'persona' | 'channel'
  label: string
  to: string
}

type AgentReadiness = {
  score: number
  total: number
  ready: boolean
  gaps: ReadinessGap[]
}

function getAgentReadiness(agent: AgentConfig, readiness: LaunchReadiness | null, numbers: PhoneNumber[]): AgentReadiness {
  const serverChecks = readiness?.agents.find((item) => item.id === agent.id)?.checks
  const checks = serverChecks ?? {
    active: agent.status === 'live',
    voice: Boolean(agent.voice),
    model: Boolean(agent.model),
    knowledge: Boolean(agent.kbId),
    persona: Boolean(agent.systemPrompt.trim() || agent.welcomeMessage.trim()),
    channel: numbers.some((number) => number.agentId === agent.id),
  }
  const gaps: ReadinessGap[] = [
    !checks.active && { key: 'active', label: 'Activate this agent', to: `/dashboard/agents/${agent.id}` },
    !checks.voice && { key: 'voice', label: 'Choose a voice', to: `/dashboard/agents/${agent.id}` },
    !checks.model && { key: 'model', label: 'Choose a model', to: `/dashboard/agents/${agent.id}` },
    !checks.persona && { key: 'persona', label: 'Add a persona or welcome', to: `/dashboard/agents/${agent.id}` },
    !checks.knowledge && { key: 'knowledge', label: 'Attach knowledge', to: `/dashboard/agents/${agent.id}` },
    !checks.channel && { key: 'channel', label: 'Assign a phone number or website', to: '/dashboard/numbers' },
  ].filter(Boolean) as ReadinessGap[]

  const total = Object.keys(checks).length
  const score = Object.values(checks).filter(Boolean).length
  return { score, total, ready: score === total, gaps }
}

function isDraftAgent(agent: AgentConfig) {
  return agent.status !== 'live'
    && !agent.description.trim()
    && !agent.systemPrompt.trim()
    && !agent.welcomeMessage.trim()
    && !agent.kbId
}

export function Agents() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [kbs, setKbs] = useState<KnowledgeBase[]>([])
  const [numbers, setNumbers] = useState<PhoneNumber[]>([])
  const [dialTestAgent, setDialTestAgent] = useState<AgentConfig | null>(null)
  const [browserTestAgent, setBrowserTestAgent] = useState<AgentConfig | null>(null)
  const [readiness, setReadiness] = useState<LaunchReadiness | null>(null)
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null)
  const [copiedAgentId, setCopiedAgentId] = useState<number | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<AgentFilter>('all')
  const [loading, setLoading] = useState(true)

  const reload = () => fetchAgents().then(setAgents).catch(() => setAgents([]))

  useEffect(() => {
    fetchAgents().then(setAgents).catch(() => setAgents([])).finally(() => setLoading(false))
    fetchKnowledgeBases().then(setKbs).catch(() => setKbs([]))
    fetchPhoneNumbers().then(setNumbers).catch(() => setNumbers([]))
    fetchLaunchReadiness().then(setReadiness).catch(() => setReadiness(null))
  }, [])

  // ?new=1 (the sidebar's "+ New Agent" and the command menu) opens the
  // chooser; the param is cleared at once so a remount doesn't reopen it.
  const [chooserOpen, setChooserOpen] = useState(false)
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setSearchParams({})
      setChooserOpen(true)
    }
  }, [searchParams, setSearchParams])

  const startFromScratch = () => {
    setChooserOpen(false)
    // Plan-limit rejections go through the same upgrade modal every other
    // gate uses (detected by the "upgrade" wording every plan-gate error
    // message deliberately includes - see server/token_api.py's
    // AgentLimitError handling).
    createAgent({ name: 'New agent' })
      .then((agent) => navigate(`/dashboard/agents/${agent.id}`))
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Could not create agent'
        if (msg.toLowerCase().includes('upgrade')) {
          setUpgradeMessage(msg)
        } else {
          alert(msg)
        }
      })
  }

  const togglePause = async (agent: AgentConfig) => {
    await updateAgent(agent.id, { status: agent.status === 'live' ? 'paused' : 'live' })
    reload()
  }

  const copyAgentId = async (agent: AgentConfig) => {
    try {
      await navigator.clipboard.writeText(String(agent.id))
      setCopiedAgentId(agent.id)
      window.setTimeout(() => setCopiedAgentId((current) => current === agent.id ? null : current), 1600)
    } catch {
      alert('Could not copy the agent ID. Check clipboard permission and try again.')
    }
  }

  const handleDelete = async (agent: AgentConfig) => {
    if (!confirm(`Delete agent "${agent.name}"?`)) return
    await deleteAgent(agent.id)
    reload()
  }

  const filteredAgents = agents.filter((agent) => {
    const agentReadiness = getAgentReadiness(agent, readiness, numbers)
    const knowledgeName = kbs.find((kb) => kb.id === agent.kbId)?.name ?? ''
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || [agent.name, agent.description, knowledgeName, agent.language]
      .some((value) => value.toLowerCase().includes(query))
    const matchesFilter = filter === 'all'
      || (filter === 'live' && agent.status === 'live')
      || (filter === 'needs-setup' && !agentReadiness.ready)
      || (filter === 'paused' && agent.status === 'paused')
      || (filter === 'draft' && isDraftAgent(agent))
    return matchesSearch && matchesFilter
  })

  const filterCounts: Record<AgentFilter, number> = {
    all: agents.length,
    live: agents.filter((agent) => agent.status === 'live').length,
    'needs-setup': agents.filter((agent) => !getAgentReadiness(agent, readiness, numbers).ready).length,
    paused: agents.filter((agent) => agent.status === 'paused').length,
    draft: agents.filter(isDraftAgent).length,
  }

  const filters: { key: AgentFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'live', label: 'Active' },
    { key: 'needs-setup', label: 'Setup incomplete' },
    { key: 'paused', label: 'Paused' },
    { key: 'draft', label: 'Draft' },
  ]

  return (
    <DashboardLayout>
      <PageHeader title="Agents" subtitle={`${agents.length} total ${agents.length === 1 ? 'agent' : 'agents'}`} />

      <section className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="rounded-lg border border-border bg-surface px-4 py-3 text-xs text-text-muted">
          <Icon name="info" className="mr-1.5 align-[-3px] text-[15px] text-cyan" />
          Assign each website to its intended agent from Website Widget. Unassigned web calls use the first active agent.
          Prompt, voice, model, knowledge, and pause changes apply from the next call without a redeploy.
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-surface-high/30 px-3 py-2 text-sm focus-within:border-primary">
            <Icon name="search" className="text-[18px] text-text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search agents, knowledge, or language"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted"
            />
          </label>
          <div className="flex gap-1 overflow-x-auto pb-0.5 lg:flex-none" aria-label="Filter agents by status">
            {filters.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${filter === item.key ? 'bg-primary text-bg' : 'text-text-muted hover:bg-surface-high hover:text-text'}`}
              >
                {item.label} <span className="ml-1 opacity-75">{filterCounts[item.key]}</span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading agents">
            {[0, 1, 2].map((item) => <div key={item} className="h-80 animate-pulse rounded-xl border border-border bg-surface" />)}
          </div>
        ) : <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredAgents.map((agent) => {
            const agentReadiness = getAgentReadiness(agent, readiness, numbers)
            const primaryAction = !agentReadiness.ready
              ? { label: 'Finish setup', icon: 'build', onClick: () => navigate(agentReadiness.gaps[0]?.to ?? `/dashboard/agents/${agent.id}`) }
              : agent.status === 'live'
                ? { label: 'Test agent', icon: 'mic', onClick: () => setBrowserTestAgent(agent) }
                : { label: 'Resume agent', icon: 'play_arrow', onClick: () => togglePause(agent) }
            return (
            <Card key={agent.id} className="flex flex-col">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 text-sm font-bold text-primary">
                    {agent.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold">{agent.name}</p>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                        agent.status === 'live'
                          ? 'border-cyan/30 bg-cyan/10 text-cyan'
                          : 'border-amber/30 bg-amber/10 text-amber'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${agent.status === 'live' ? 'bg-cyan' : 'bg-amber'}`} />
                      {agent.status === 'live' ? 'Active' : 'Paused'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(agent)}
                  aria-label={`Delete ${agent.name}`}
                  className="text-text-muted hover:text-destructive"
                >
                  <Icon name="delete" className="text-[18px]" />
                </button>
              </div>

              <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-high/30 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-[11px] text-text-muted">Agent ID</span>
                  <code className="truncate rounded bg-surface px-2 py-1 font-mono text-xs font-semibold text-text">{agent.id}</code>
                </div>
                <button
                  type="button"
                  onClick={() => void copyAgentId(agent)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-primary/30 px-2.5 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/10"
                  aria-label={`${copiedAgentId === agent.id ? 'Copied' : 'Copy'} agent ID for ${agent.name}`}
                >
                  <Icon name={copiedAgentId === agent.id ? 'check' : 'content_copy'} className="text-[14px]" />
                  {copiedAgentId === agent.id ? 'Copied' : 'Copy ID'}
                </button>
              </div>

              <p className="mb-4 line-clamp-2 min-h-[32px] text-xs text-text-muted">
                {agent.description || 'No description yet. Edit to define this agent.'}
              </p>

              <dl className="mb-4 flex flex-col gap-1.5 rounded-lg border border-border bg-surface-high/40 p-3 text-xs">
                <InfoRow icon="memory" label="Model" value={modelLabel(agent.model)} />
                <InfoRow icon="record_voice_over" label="Voice" value={agent.voiceName || voiceLabel(agent.voice)} />
                <InfoRow icon="language" label="Language" value={agent.language} />
                <InfoRow icon="menu_book" label="Knowledge" value={kbs.find((k) => k.id === agent.kbId)?.name ?? 'none'} />
                <InfoRow icon="update" label="Updated" value={formatDateTime(agent.updatedAt)} />
              </dl>

              <div className={`mb-4 rounded-lg border px-3 py-2 text-xs ${agentReadiness.ready ? 'border-success/30 bg-success/5' : 'border-amber/30 bg-amber/5'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Agent readiness</span>
                  <span className={agentReadiness.ready ? 'text-success' : 'text-amber'}>{agentReadiness.score}/{agentReadiness.total}</span>
                </div>
                {agentReadiness.gaps.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {agentReadiness.gaps.map((gap) => (
                      <button
                        key={gap.key}
                        type="button"
                        onClick={() => gap.key === 'active' ? togglePause(agent) : navigate(gap.to)}
                        className="rounded-md border border-amber/30 bg-surface px-2 py-1 text-left text-[11px] text-text-muted transition-colors hover:border-primary hover:text-text"
                      >
                        {gap.label} →
                      </button>
                    ))}
                  </div>
                ) : <p className="mt-1 text-text-muted">Ready to handle conversations.</p>}
              </div>

              <div className="mt-auto flex gap-2">
                <button
                  onClick={primaryAction.onClick}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-xs font-bold text-bg hover:opacity-90"
                >
                  <Icon name={primaryAction.icon} className="text-[16px]" />
                  {primaryAction.label}
                </button>
                <Tooltip content="Edit agent"><button
                  onClick={() => navigate(`/dashboard/agents/${agent.id}`)}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold hover:border-primary"
                  aria-label={`Edit ${agent.name}`}
                >
                  <Icon name="edit" className="text-[16px]" />
                </button></Tooltip>
                <Tooltip content={agent.status === 'live' ? 'Pause agent' : 'Resume agent'}><button
                  onClick={() => togglePause(agent)}
                  className="flex items-center justify-center rounded-lg border border-border px-3 hover:border-primary"
                  aria-label={`${agent.status === 'live' ? 'Pause' : 'Resume'} ${agent.name}`}
                >
                  <Icon name={agent.status === 'live' ? 'pause' : 'play_arrow'} className="text-[16px]" />
                </button></Tooltip>
                <Tooltip content="Place a real phone call to test this agent"><button
                  onClick={() => setDialTestAgent(agent)}
                  className="flex items-center justify-center rounded-lg border border-cyan/40 px-3 text-cyan hover:bg-cyan/10"
                  aria-label={`Call test - ${agent.name}`}
                >
                  <Icon name="call" className="text-[16px]" />
                </button></Tooltip>
                <Tooltip content="Test this agent in-browser with your mic"><button
                  onClick={() => setBrowserTestAgent(agent)}
                  className="flex items-center justify-center rounded-lg border border-primary/40 px-3 text-primary hover:bg-primary/10"
                  aria-label={`Browser test - ${agent.name}`}
                >
                  <Icon name="mic" className="text-[16px]" />
                </button></Tooltip>
              </div>
            </Card>
            )
          })}
        </div>}

        {!loading && filteredAgents.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
            <Icon name="search_off" className="mb-2 text-[28px] text-text-muted" />
            <p className="font-semibold">No agents found</p>
            <p className="mt-1 text-sm text-text-muted">Try a different search or status filter.</p>
            {(search || filter !== 'all') && <button type="button" onClick={() => { setSearch(''); setFilter('all') }} className="mt-3 text-sm font-semibold text-primary hover:underline">Clear filters</button>}
          </div>
        )}

        {dialTestAgent && (
          <DialTestModal
            agent={dialTestAgent}
            fromNumber={numbers.find((n) => n.agentId === dialTestAgent.id)?.number ?? null}
            onClose={() => setDialTestAgent(null)}
          />
        )}

        {browserTestAgent && (
          <BrowserTestModal agent={browserTestAgent} onClose={() => setBrowserTestAgent(null)} />
        )}

        {chooserOpen && (
          <NewAgentChooser
            onAi={() => navigate('/dashboard/agents/new')}
            onScratch={startFromScratch}
            onClose={() => setChooserOpen(false)}
          />
        )}

        {upgradeMessage && (
          <UpgradeRequiredModal message={upgradeMessage} onClose={() => setUpgradeMessage(null)} />
        )}
      </section>
    </DashboardLayout>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-text-muted">
        <Icon name={icon} className="text-[14px]" />
        {label}
      </span>
      <span className="truncate font-semibold">{value}</span>
    </div>
  )
}

function NewAgentChooser({ onAi, onScratch, onClose }: { onAi: () => void; onScratch: () => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-agent-title"
        className="w-full max-w-lg rounded-xl border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 id="new-agent-title" className="text-base font-bold">Create a new agent</h3>
            <p className="mt-0.5 text-sm text-text-muted">How would you like to start?</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="bg-transparent text-text-muted hover:text-text">
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onAi}
            autoFocus
            className="flex flex-col items-start gap-2 rounded-xl border-2 border-primary bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Icon name="auto_awesome" className="text-[20px]" />
              </span>
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-bg">Recommended</span>
            </span>
            <span className="text-sm font-bold">Build with AI</span>
            <span className="text-xs text-text-muted">Describe your business and we'll set it up.</span>
          </button>
          <button
            type="button"
            onClick={onScratch}
            className="flex flex-col items-start gap-2 rounded-xl border-2 border-border bg-surface p-4 text-left transition-colors hover:border-primary"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-high text-text-muted">
              <Icon name="edit_note" className="text-[20px]" />
            </span>
            <span className="text-sm font-bold">Start from scratch</span>
            <span className="text-xs text-text-muted">Open a blank agent and fill in every setting yourself.</span>
          </button>
        </div>
      </div>
    </div>
  )
}
