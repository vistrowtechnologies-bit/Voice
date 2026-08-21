import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { Card } from '../components/ui/Card'
import { BrowserTestModal, DialTestModal } from '../components/AgentTestCall'
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

export function Agents() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [kbs, setKbs] = useState<KnowledgeBase[]>([])
  const [numbers, setNumbers] = useState<PhoneNumber[]>([])
  const [dialTestAgent, setDialTestAgent] = useState<AgentConfig | null>(null)
  const [browserTestAgent, setBrowserTestAgent] = useState<AgentConfig | null>(null)
  const [readiness, setReadiness] = useState<LaunchReadiness | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const reload = () => fetchAgents().then(setAgents).catch(() => setAgents([]))

  useEffect(() => {
    reload()
    fetchKnowledgeBases().then(setKbs).catch(() => setKbs([]))
    fetchPhoneNumbers().then(setNumbers).catch(() => setNumbers([]))
    fetchLaunchReadiness().then(setReadiness).catch(() => setReadiness(null))
  }, [])

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      createAgent({ name: 'New agent' }).then((agent) => {
        setSearchParams({})
        navigate(`/dashboard/agents/${agent.id}`)
      })
    }
  }, [searchParams, setSearchParams, navigate])

  const togglePause = async (agent: AgentConfig) => {
    await updateAgent(agent.id, { status: agent.status === 'live' ? 'paused' : 'live' })
    reload()
  }

  const handleDelete = async (agent: AgentConfig) => {
    if (!confirm(`Delete agent "${agent.name}"?`)) return
    await deleteAgent(agent.id)
    reload()
  }

  return (
    <DashboardLayout>
      <PageHeader title="Agents" subtitle={`${agents.length} total ${agents.length === 1 ? 'agent' : 'agents'}`} />

      <section className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="rounded-lg border border-border bg-surface px-4 py-3 text-xs text-text-muted">
          <Icon name="info" className="mr-1.5 align-[-3px] text-[15px] text-cyan" />
          The first live agent takes all web calls. Changes here (prompt, voice, model, knowledge base,
          pause) apply from the very next call - no redeploy needed.
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
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
                      {agent.status === 'live' ? 'Live' : 'Paused'}
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

              <p className="mb-4 line-clamp-2 min-h-[32px] text-xs text-text-muted">
                {agent.description || 'No description yet. Edit to define this agent.'}
              </p>

              <dl className="mb-4 flex flex-col gap-1.5 rounded-lg border border-border bg-surface-high/40 p-3 text-xs">
                <InfoRow icon="memory" label="Model" value={modelLabel(agent.model)} />
                <InfoRow icon="record_voice_over" label="Voice" value={voiceLabel(agent.voice)} />
                <InfoRow icon="language" label="Language" value={agent.language} />
                <InfoRow icon="menu_book" label="Knowledge" value={kbs.find((k) => k.id === agent.kbId)?.name ?? 'none'} />
                <InfoRow icon="update" label="Updated" value={formatDateTime(agent.updatedAt)} />
              </dl>

              {(() => {
                const serverChecks = readiness?.agents.find((item) => item.id === agent.id)?.checks
                const checks = serverChecks ? Object.values(serverChecks) : [
                  agent.status === 'live', Boolean(agent.voice && agent.model),
                  Boolean(agent.systemPrompt.trim() || agent.welcomeMessage.trim()), Boolean(agent.kbId),
                  numbers.some((n) => n.agentId === agent.id),
                ]
                const score = checks.filter(Boolean).length
                return (
                  <div className={`mb-4 rounded-lg border px-3 py-2 text-xs ${score === checks.length ? 'border-success/30 bg-success/5' : 'border-amber/30 bg-amber/5'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Agent readiness</span>
                      <span className={score === checks.length ? 'text-success' : 'text-amber'}>{score}/{checks.length}</span>
                    </div>
                    {score < checks.length && (
                      <p className="mt-1 text-text-muted">
                        {!agent.systemPrompt.trim() && !agent.welcomeMessage.trim() ? 'Add a persona or welcome message. ' : ''}
                        {!agent.kbId ? 'Attach knowledge. ' : ''}
                        {serverChecks ? (!serverChecks.channel ? 'Assign a phone number or website. ' : '') : (!numbers.some((n) => n.agentId === agent.id) ? 'Assign a phone number or website. ' : '')}
                        {serverChecks && !serverChecks.active ? 'Activate the agent.' : ''}
                      </p>
                    )}
                  </div>
                )
              })()}

              <div className="mt-auto flex gap-2">
                <button
                  onClick={() => togglePause(agent)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-bold hover:border-primary"
                >
                  <Icon name={agent.status === 'live' ? 'pause' : 'play_arrow'} className="text-[16px]" />
                  {agent.status === 'live' ? 'Pause' : 'Resume'}
                </button>
                <button
                  onClick={() => navigate(`/dashboard/agents/${agent.id}`)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-xs font-bold text-bg hover:opacity-90"
                >
                  <Icon name="edit" className="text-[16px]" />
                  Edit
                </button>
                <button
                  onClick={() => setDialTestAgent(agent)}
                  className="flex items-center justify-center rounded-lg border border-cyan/40 px-3 text-cyan hover:bg-cyan/10"
                  aria-label={`Call test - ${agent.name}`}
                  title="Place a real phone call to test this agent"
                >
                  <Icon name="call" className="text-[16px]" />
                </button>
                <button
                  onClick={() => setBrowserTestAgent(agent)}
                  className="flex items-center justify-center rounded-lg border border-primary/40 px-3 text-primary hover:bg-primary/10"
                  aria-label={`Browser test - ${agent.name}`}
                  title="Test this agent in-browser with your mic"
                >
                  <Icon name="mic" className="text-[16px]" />
                </button>
              </div>
            </Card>
          ))}
        </div>

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
