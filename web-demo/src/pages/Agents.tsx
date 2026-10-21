import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { BrowserTestModal, DialTestModal } from '../components/AgentTestCall'
import { UpgradeRequiredModal } from '../components/UpgradeRequiredModal'
import {
  createAgent,
  deleteAgent,
  fetchAgents,
  fetchAgentActivity,
  fetchKnowledgeBases,
  fetchLaunchReadiness,
  fetchPhoneNumbers,
  formatDateTime,
  updateAgent,
  onCopilotChange,
} from '../lib/api'
import type { AgentActivity, AgentConfig, KnowledgeBase, PhoneNumber, LaunchReadiness } from '../lib/types'
import { isRealtimeModel, modelLabel, voiceLabel } from '../lib/agentOptions'
import { InfoTip, Tooltip } from '../components/ui/Tooltip'
import { useClonedVoices } from '../components/ClonedVoiceOptions'

type AgentFilter = 'all' | 'live' | 'needs-setup' | 'paused' | 'draft'

const AGENTS_VIEW_KEY = 'vv.agents.view'

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
  const clonedVoices = useClonedVoices()
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
  const [activity, setActivity] = useState<AgentActivity[]>([])
  const [drawerAgentId, setDrawerAgentId] = useState<number | null>(null)
  // Tiles (default) or the list table; a per-browser preference.
  const [view, setView] = useState<'tiles' | 'list'>(() => {
    try {
      return localStorage.getItem(AGENTS_VIEW_KEY) === 'list' ? 'list' : 'tiles'
    } catch {
      return 'tiles'
    }
  })
  const chooseView = (next: 'tiles' | 'list') => {
    setView(next)
    try {
      localStorage.setItem(AGENTS_VIEW_KEY, next)
    } catch {
      // Private mode or blocked storage: the choice just lasts this visit.
    }
  }

  const reload = () => fetchAgents().then(setAgents).catch(() => setAgents([]))

  useEffect(() => {
    fetchAgents().then(setAgents).catch(() => setAgents([])).finally(() => setLoading(false))
    fetchKnowledgeBases().then(setKbs).catch(() => setKbs([]))
    fetchPhoneNumbers().then(setNumbers).catch(() => setNumbers([]))
    fetchLaunchReadiness().then(setReadiness).catch(() => setReadiness(null))
    fetchAgentActivity().then(setActivity).catch(() => setActivity([]))
  }, [])

  useEffect(() => onCopilotChange(() => {
    fetchAgents().then(setAgents).catch(() => {})
    fetchPhoneNumbers().then(setNumbers).catch(() => {})
    fetchLaunchReadiness().then(setReadiness).catch(() => {})
    fetchAgentActivity().then(setActivity).catch(() => {})
  }), [])

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
      await navigator.clipboard.writeText(agent.publicId || String(agent.id))
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

  const activityFor = (id: number): AgentActivity => activity.find((a) => a.agentId === id) ?? NO_ACTIVITY
  const teamToday = activity.reduce((sum, a) => sum + a.today, 0)
  const teamBooked = activity.reduce((sum, a) => sum + a.booked7, 0)
  const drawerAgent = agents.find((agent) => agent.id === drawerAgentId) ?? null
  const voiceName = (agent: AgentConfig): React.ReactNode =>
    agent.voice.startsWith('custom:') ? (
      // The server's voiceName is the raw "custom:vv_..." id for a cloned voice.
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span className="truncate">{clonedVoices.find((v) => v.voiceValue === agent.voice)?.name ?? 'Cloned voice'}</span>
        <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">Cloned</span>
      </span>
    ) : (
      agent.voiceName || voiceLabel(agent.voice)
    )

  const filters: { key: AgentFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'live', label: 'Active' },
    { key: 'needs-setup', label: 'Setup incomplete' },
    { key: 'paused', label: 'Paused' },
    { key: 'draft', label: 'Draft' },
  ]

  return (
    <DashboardLayout>
      <PageHeader
        title="Agents"
        subtitle={`${agents.length} total ${agents.length === 1 ? 'agent' : 'agents'}`}
        lead={
          <p className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className="hidden sm:inline">Changes go live on the next call</span>
            <InfoTip label="How agent changes apply" side="bottom">
              Assign each website to its intended agent from Website Widget. Unassigned web calls use the first active agent.
              Prompt, voice, model, knowledge, and pause changes apply from the next call without a redeploy.
            </InfoTip>
          </p>
        }
      />

      <section className="flex flex-col gap-4 p-4 sm:p-6">
        {view === 'tiles' && !loading && agents.length > 0 && (
          <section className="bento-tile bento-hero flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/75">Your AI team today</p>
              <div className="mt-2 flex flex-wrap gap-x-8 gap-y-3">
                <HeroStat value={filterCounts.live} label={filterCounts.live === 1 ? 'agent live' : 'agents live'} />
                <HeroStat value={teamToday} label="calls today" />
                <HeroStat value={teamBooked} label="booked this week" />
              </div>
            </div>
            {filterCounts['needs-setup'] > 0 && (
              <button type="button" onClick={() => setFilter('needs-setup')} className="bento-pill bento-pill-light">
                {filterCounts['needs-setup']} need setup <Icon name="arrow_forward" className="text-[16px]" />
              </button>
            )}
          </section>
        )}

        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-surface-high/30 px-3 py-2 text-sm focus-within:border-primary">
            <Icon name="search" className="text-[18px] text-text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search agents, knowledge, or language"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted"
            />
          </label>
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-0.5 lg:flex-none" aria-label="Filter agents by status">
              {filters.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${filter === item.key ? 'bg-primary text-bg' : 'bg-transparent text-text-muted hover:bg-surface-high hover:text-text'}`}
                >
                  {item.label} <span className="ml-1 opacity-75">{filterCounts[item.key]}</span>
                </button>
              ))}
            </div>
            {/* The user's choice of look, remembered in this browser. */}
            <div role="group" aria-label="Agents layout" className="flex shrink-0 rounded-lg border border-border bg-surface-high/40 p-0.5">
              {([['tiles', 'grid_view', 'Tiles'], ['list', 'list', 'List']] as const).map(([key, icon, label]) => (
                <Tooltip key={key} content={`${label} view`}>
                  <button
                    type="button"
                    aria-pressed={view === key}
                    aria-label={`${label} view`}
                    onClick={() => chooseView(key)}
                    className={`flex h-8 w-9 items-center justify-center rounded-md transition-colors ${view === key ? 'bg-text text-surface' : 'bg-transparent text-text-muted hover:text-text'}`}
                  >
                    <Icon name={icon} className="text-[18px]" />
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading agents">
            {[0, 1, 2].map((item) => <div key={item} className="h-72 animate-pulse rounded-3xl border border-border bg-surface" />)}
          </div>
        ) : view === 'tiles' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredAgents.map((agent) => (
              <AgentTile
                key={agent.id}
                agent={agent}
                readiness={getAgentReadiness(agent, readiness, numbers)}
                activity={activityFor(agent.id)}
                voice={voiceName(agent)}
                copied={copiedAgentId === agent.id}
                onOpen={() => navigate(`/dashboard/agents/${agent.id}`)}
                onNext={(gap) => (gap.key === 'active' ? togglePause(agent) : navigate(gap.to))}
                onTest={() => setBrowserTestAgent(agent)}
                onDial={() => setDialTestAgent(agent)}
                onTogglePause={() => togglePause(agent)}
                onCopyId={() => void copyAgentId(agent)}
                onDelete={() => handleDelete(agent)}
              />
            ))}
          </div>
        ) : (
          filteredAgents.length > 0 && (
            <AgentRoster
              agents={filteredAgents}
              readinessFor={(agent) => getAgentReadiness(agent, readiness, numbers)}
              activityFor={activityFor}
              voiceFor={voiceName}
              phoneFor={(agent) => numbers.find((n) => n.agentId === agent.id)?.number ?? null}
              onOpen={(agent) => setDrawerAgentId(agent.id)}
              onTogglePause={togglePause}
            />
          )
        )}

        {!loading && filteredAgents.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border bg-surface px-6 py-12 text-center">
            <Icon name="search_off" className="mb-2 text-[28px] text-text-muted" />
            <p className="font-semibold">No agents found</p>
            <p className="mt-1 text-sm text-text-muted">Try a different search or status filter.</p>
            {(search || filter !== 'all') && <button type="button" onClick={() => { setSearch(''); setFilter('all') }} className="mt-3 bg-transparent text-sm font-semibold text-primary hover:underline">Clear filters</button>}
          </div>
        )}

        {drawerAgent && (
          <AgentDrawer
            agent={drawerAgent}
            readiness={getAgentReadiness(drawerAgent, readiness, numbers)}
            activity={activityFor(drawerAgent.id)}
            voice={voiceName(drawerAgent)}
            knowledge={kbs.find((k) => k.id === drawerAgent.kbId)?.name ?? 'None'}
            phone={numbers.find((n) => n.agentId === drawerAgent.id)?.number ?? null}
            copied={copiedAgentId === drawerAgent.id}
            onClose={() => setDrawerAgentId(null)}
            onEdit={() => navigate(`/dashboard/agents/${drawerAgent.id}`)}
            onNext={(gap) => (gap.key === 'active' ? togglePause(drawerAgent) : navigate(gap.to))}
            onTest={() => setBrowserTestAgent(drawerAgent)}
            onDial={() => setDialTestAgent(drawerAgent)}
            onTogglePause={() => togglePause(drawerAgent)}
            onCopyId={() => void copyAgentId(drawerAgent)}
            onDelete={() => { setDrawerAgentId(null); void handleDelete(drawerAgent) }}
          />
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

const NO_ACTIVITY: AgentActivity = { agentId: 0, today: 0, daily: [0, 0, 0, 0, 0, 0, 0], booked7: 0, lastCallAt: null }

// Calls store UTC; a timestamp without a zone is UTC too.
function timeAgo(at: string | null): string {
  if (!at) return 'No calls yet'
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(at) ? at : `${at.replace(' ', 'T')}Z`)
  const minutes = Math.round((Date.now() - date.getTime()) / 60000)
  if (Number.isNaN(minutes)) return 'No calls yet'
  if (minutes < 1) return 'Last call just now'
  if (minutes < 60) return `Last call ${minutes} min ago`
  if (minutes < 60 * 24) return `Last call ${Math.round(minutes / 60)} h ago`
  return `Last call ${Math.round(minutes / (60 * 24))} d ago`
}

function engineLabel(model: string): string {
  if (isRealtimeModel(model)) return 'Live'
  return modelLabel(model).split(' · ')[0].replace(/^Vistrow /, '')
}

function HeroStat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="bento-num text-[32px] leading-none">{value.toLocaleString('en-IN')}</p>
      <p className="mt-1 text-xs text-white/75">{label}</p>
    </div>
  )
}

function StatusBadge({ agent }: { agent: AgentConfig }) {
  const live = agent.status === 'live'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${live ? 'bg-success/12 text-success' : 'bg-muted/15 text-text-muted'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${live ? 'animate-pulse bg-success' : 'bg-text-muted'}`} />
      {live ? 'Live' : 'Paused'}
    </span>
  )
}

function EngineBadge({ model }: { model: string }) {
  const live = isRealtimeModel(model)
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${live ? 'bg-magenta/12 text-magenta' : 'bg-cyan/12 text-cyan'}`}>
      {engineLabel(model)}
    </span>
  )
}

function Avatar({ agent, size = 'md' }: { agent: AgentConfig; size?: 'sm' | 'md' }) {
  const tone = agent.status === 'live' ? 'from-[#7c3aed] to-[#c026d3]' : 'from-[#475569] to-[#64748b]'
  return (
    <div className={`flex shrink-0 items-center justify-center bg-gradient-to-br font-display font-extrabold text-white ${tone} ${size === 'sm' ? 'h-9 w-9 rounded-xl text-xs' : 'h-11 w-11 rounded-2xl text-sm'}`}>
      {agent.name.slice(0, 2).toUpperCase()}
    </div>
  )
}

function ReadinessRing({ score, total }: { score: number; total: number }) {
  const c = 2 * Math.PI * 22
  const done = score === total
  return (
    <svg viewBox="0 0 54 54" className="h-[54px] w-[54px] shrink-0" role="img" aria-label={`Setup ${score} of ${total}`}>
      <circle cx="27" cy="27" r="22" fill="none" stroke="var(--color-surface-high)" strokeWidth="5" />
      <circle
        cx="27" cy="27" r="22" fill="none" strokeWidth="5" strokeLinecap="round"
        stroke={done ? 'var(--color-success)' : 'url(#agentRing)'}
        strokeDasharray={`${((score / Math.max(total, 1)) * c).toFixed(1)} ${c.toFixed(1)}`}
        transform="rotate(-90 27 27)" className="bento-ring"
      />
      <defs>
        <linearGradient id="agentRing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-primary)" />
          <stop offset="1" stopColor="#c026d3" />
        </linearGradient>
      </defs>
      <text x="27" y="31" textAnchor="middle" className="fill-text font-display text-[12px] font-extrabold">{score}/{total}</text>
    </svg>
  )
}

function Sparkline({ values, height = 40 }: { values: number[]; height?: number }) {
  const max = Math.max(...values, 1)
  const w = 140
  const points = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(height - 3 - (v / max) * (height - 8)).toFixed(1)}`).join(' ')
  const empty = values.every((v) => v === 0)
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }} aria-hidden="true">
      <defs>
        <linearGradient id="agentSpark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-primary)" stopOpacity="0.32" />
          <stop offset="1" stopColor="var(--color-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {!empty && <polygon points={`0,${height} ${points} ${w},${height}`} fill="url(#agentSpark)" />}
      <polyline
        points={points} fill="none" vectorEffect="non-scaling-stroke" strokeWidth="2" strokeLinejoin="round"
        stroke={empty ? 'var(--color-border)' : 'var(--color-primary)'} strokeDasharray={empty ? '4 4' : undefined}
      />
    </svg>
  )
}

type CardActions = {
  onNext: (gap: ReadinessGap) => void
  onTest: () => void
  onDial: () => void
  onTogglePause: () => void
  onCopyId: () => void
  onDelete: () => void
}

function MoreMenu({ agent, copied, onCopyId, onDelete, onTogglePause }: { agent: AgentConfig; copied: boolean; onCopyId: () => void; onDelete: () => void; onTogglePause: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={`More actions for ${agent.name}`} aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface text-text-muted hover:text-text">
        <Icon name="more_horiz" className="text-[18px]" />
      </button>
      {open && (
        <div role="menu" className="bento-reveal absolute bottom-11 right-0 z-20 w-48 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-xl">
          <button type="button" role="menuitem" onClick={() => { onTogglePause(); setOpen(false) }} className="flex w-full items-center gap-2 rounded-lg bg-transparent px-3 py-2 text-left text-xs font-semibold hover:bg-surface-high">
            <Icon name={agent.status === 'live' ? 'pause' : 'play_arrow'} className="text-[16px]" /> {agent.status === 'live' ? 'Pause agent' : 'Resume agent'}
          </button>
          <button type="button" role="menuitem" onClick={() => { onCopyId(); setOpen(false) }} className="flex w-full items-center gap-2 rounded-lg bg-transparent px-3 py-2 text-left text-xs font-semibold hover:bg-surface-high">
            <Icon name={copied ? 'check' : 'content_copy'} className="text-[16px]" /> Copy agent ID <code className="ml-auto text-[10px] text-text-muted">{agent.publicId || agent.id}</code>
          </button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onDelete() }} className="flex w-full items-center gap-2 rounded-lg bg-transparent px-3 py-2 text-left text-xs font-semibold text-destructive hover:bg-destructive/10">
            <Icon name="delete" className="text-[16px]" /> Delete agent
          </button>
        </div>
      )}
    </div>
  )
}

function AgentTile({ agent, readiness, activity, voice, copied, onOpen, ...actions }: {
  agent: AgentConfig; readiness: AgentReadiness; activity: AgentActivity; voice: React.ReactNode; copied: boolean; onOpen: () => void
} & CardActions) {
  const next = readiness.gaps[0]
  const live = agent.status === 'live'
  return (
    <article className="bento-tile flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-3 bg-transparent text-left">
          <Avatar agent={agent} />
          <span className="min-w-0">
            <span className="bento-title block truncate text-[15px]">{agent.name}</span>
            <span className="block truncate text-xs text-text-muted">{agent.description || 'No description yet'}</span>
          </span>
        </button>
        <ReadinessRing score={readiness.score} total={readiness.total} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge agent={agent} />
        <EngineBadge model={agent.model} />
        <span className="truncate text-[11px] text-text-muted">{voice} · {agent.language}</span>
      </div>
      <div className="mt-3">
        <Sparkline values={activity.daily} />
        <div className="mt-1 flex items-center justify-between text-[10px] text-text-muted"><span>7 days ago</span><span>Today</span></div>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-xs text-text-muted">
          <span className="bento-num mr-1 text-[22px] text-text">{activity.today}</span>
          {activity.today === 1 ? 'call' : 'calls'} today · {activity.booked7} booked this week
        </p>
      </div>
      <p className="mt-0.5 text-[11px] text-text-muted">{timeAgo(activity.lastCallAt)}</p>
      {/* Keeps the buttons on one line across tiles of different heights. */}
      <div className="flex-1" />
      {next && (
        <button type="button" onClick={() => actions.onNext(next)} className="mt-3 flex items-center gap-2 rounded-xl border border-amber/30 bg-amber/5 px-3 py-2 text-left text-xs font-semibold transition-colors hover:border-primary">
          <Icon name="bolt" className="text-[16px] text-amber" />
          <span className="min-w-0 flex-1 truncate">Next: {next.label}</span>
          <Icon name="arrow_forward" className="text-[16px] text-text-muted" />
        </button>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={live ? actions.onTest : actions.onTogglePause} className="bento-pill bento-pill-dark min-w-0 flex-1 justify-center whitespace-nowrap">
          <Icon name={live ? 'mic' : 'play_arrow'} className="text-[16px]" /> {live ? 'Test agent' : 'Resume'}
        </button>
        <Tooltip content="Edit agent"><button type="button" onClick={onOpen} aria-label={`Edit ${agent.name}`} className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface text-text-muted hover:text-text"><Icon name="edit" className="text-[16px]" /></button></Tooltip>
        <Tooltip content="Place a real phone call to test this agent"><button type="button" onClick={actions.onDial} aria-label={`Call test - ${agent.name}`} className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface text-cyan hover:bg-cyan/10"><Icon name="call" className="text-[16px]" /></button></Tooltip>
        <MoreMenu agent={agent} copied={copied} onCopyId={actions.onCopyId} onDelete={actions.onDelete} onTogglePause={actions.onTogglePause} />
      </div>
    </article>
  )
}

function AgentRoster({ agents, readinessFor, activityFor, voiceFor, phoneFor, onOpen, onTogglePause }: {
  agents: AgentConfig[]
  readinessFor: (agent: AgentConfig) => AgentReadiness
  activityFor: (id: number) => AgentActivity
  voiceFor: (agent: AgentConfig) => React.ReactNode
  phoneFor: (agent: AgentConfig) => string | null
  onOpen: (agent: AgentConfig) => void
  onTogglePause: (agent: AgentConfig) => void
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-extrabold uppercase tracking-wider text-text-muted">
            <th className="px-4 py-3">Agent</th>
            <th className="hidden px-4 py-3 md:table-cell">Engine · voice</th>
            <th className="hidden px-4 py-3 lg:table-cell">Channel</th>
            <th className="px-4 py-3">Today</th>
            <th className="hidden px-4 py-3 sm:table-cell">Last 7 days</th>
            <th className="px-4 py-3 text-right">On</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => {
            const r = readinessFor(agent)
            const a = activityFor(agent.id)
            const live = agent.status === 'live'
            const phone = phoneFor(agent)
            const hasChannel = !r.gaps.some((g) => g.key === 'channel')
            return (
              <tr
                key={agent.id}
                tabIndex={0}
                onClick={() => onOpen(agent)}
                onKeyDown={(e) => { if (e.key === 'Enter') onOpen(agent) }}
                className="bento-row cursor-pointer border-b border-border last:border-0 focus:outline-none focus-visible:bg-primary/5"
              >
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar agent={agent} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-bold">{agent.name}</p>
                      <p className={`truncate text-xs ${r.ready ? 'text-text-muted' : 'text-amber'}`}>
                        {r.ready ? (agent.description || 'Ready') : `Setup ${r.score}/${r.total} · ${r.gaps[0]?.label}`}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="hidden px-4 py-3 md:table-cell"><div className="flex items-center gap-2"><EngineBadge model={agent.model} /><span className="truncate text-xs text-text-muted">{voiceFor(agent)}</span></div></td>
                <td className="hidden px-4 py-3 text-xs text-text-muted lg:table-cell">
                  {phone ? <span className="inline-flex items-center gap-1"><Icon name="call" className="text-[14px]" />{phone}</span> : hasChannel ? <span className="inline-flex items-center gap-1"><Icon name="public" className="text-[14px]" />Website</span> : 'Not connected'}
                </td>
                <td className="px-4 py-3"><span className="font-bold">{a.today}</span> <span className="text-xs text-text-muted">calls</span></td>
                <td className="hidden w-36 px-4 py-3 sm:table-cell"><Sparkline values={a.daily} height={26} /></td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={live}
                    aria-label={`${live ? 'Pause' : 'Turn on'} ${agent.name}`}
                    onClick={(e) => { e.stopPropagation(); onTogglePause(agent) }}
                    className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${live ? 'bg-success' : 'bg-surface-high'}`}
                  >
                    <span className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${live ? 'translate-x-[19px]' : 'translate-x-[3px]'}`} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AgentDrawer({ agent, readiness, activity, voice, knowledge, phone, copied, onClose, onEdit, ...actions }: {
  agent: AgentConfig; readiness: AgentReadiness; activity: AgentActivity; voice: React.ReactNode; knowledge: string
  phone: string | null; copied: boolean; onClose: () => void; onEdit: () => void
} & CardActions) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const live = agent.status === 'live'
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={`${agent.name} details`}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="bento-reveal absolute inset-y-0 right-0 flex w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-border bg-surface p-5 pb-24 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar agent={agent} />
            <div className="min-w-0">
              <p className="bento-title truncate text-lg">{agent.name}</p>
              <p className="truncate text-xs text-text-muted">{agent.description || 'No description yet'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface text-text-muted hover:text-text"><Icon name="close" className="text-[18px]" /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2"><StatusBadge agent={agent} /><EngineBadge model={agent.model} /></div>
        <div className="grid grid-cols-3 gap-2">
          {[['Today', activity.today], ['This week', activity.daily.reduce((s, v) => s + v, 0)], ['Booked', activity.booked7]].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-border bg-surface-high/30 p-3">
              <p className="text-[11px] text-text-muted">{label}</p>
              <p className="bento-num mt-1 text-xl">{value}</p>
            </div>
          ))}
        </div>
        <dl className="flex flex-col gap-1.5 rounded-2xl border border-border bg-surface-high/30 p-3 text-xs">
          <InfoRow icon="record_voice_over" label="Voice" value={voice} />
          <InfoRow icon="language" label="Language" value={agent.language} />
          <InfoRow icon="menu_book" label="Knowledge" value={knowledge} />
          <InfoRow icon="call" label="Phone" value={phone ?? 'None'} />
          <InfoRow icon="update" label="Updated" value={formatDateTime(agent.updatedAt)} />
          <InfoRow icon="graphic_eq" label="Activity" value={timeAgo(activity.lastCallAt)} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-text-muted">Agent ID</span>
            <button type="button" onClick={actions.onCopyId} className="inline-flex items-center gap-1.5 rounded-md bg-transparent font-mono font-semibold text-primary hover:underline">
              {agent.publicId || agent.id}<Icon name={copied ? 'check' : 'content_copy'} className="text-[14px]" />
            </button>
          </div>
        </dl>
        <div>
          <p className="mb-2 text-xs font-bold">Setup {readiness.score}/{readiness.total}</p>
          {readiness.gaps.length === 0 ? (
            <p className="text-xs text-success">Ready to handle conversations.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {readiness.gaps.map((gap) => (
                <button key={gap.key} type="button" onClick={() => actions.onNext(gap)} className="flex items-center justify-between rounded-xl border border-amber/30 bg-amber/5 px-3 py-2 text-left text-xs font-semibold hover:border-primary">
                  {gap.label}<Icon name="arrow_forward" className="text-[16px] text-text-muted" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-auto flex flex-wrap gap-2">
          <button type="button" onClick={actions.onTest} className="bento-pill bento-pill-dark"><Icon name="mic" className="text-[16px]" />Test in browser</button>
          <button type="button" onClick={actions.onDial} className="bento-pill bento-pill-soft"><Icon name="call" className="text-[16px]" />Call test</button>
          <button type="button" onClick={onEdit} className="bento-pill bento-pill-soft"><Icon name="edit" className="text-[16px]" />Edit</button>
          <button type="button" onClick={actions.onTogglePause} className="bento-pill bento-pill-soft"><Icon name={live ? 'pause' : 'play_arrow'} className="text-[16px]" />{live ? 'Pause' : 'Resume'}</button>
          <button type="button" onClick={actions.onDelete} className="ml-auto flex items-center gap-1 rounded-full bg-transparent px-3 text-xs font-bold text-destructive hover:underline"><Icon name="delete" className="text-[16px]" />Delete</button>
        </div>
      </aside>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: React.ReactNode }) {
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
