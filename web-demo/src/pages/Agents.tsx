import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { BrowserTestModal, DialTestModal } from '../components/AgentTestCall'
import {
  createAgent,
  deleteAgent,
  fetchAgents,
  fetchKnowledgeBases,
  fetchPhoneNumbers,
  formatDateTime,
  updateAgent,
} from '../lib/api'
import type { AgentConfig, KnowledgeBase, PhoneNumber } from '../lib/types'

// Full bulbul:v3 speaker roster (Sarvam docs — the previous list here was
// actually bulbul:v2 names, most of which aren't valid v3 speakers). The
// voice picked here is exactly what agent/main.py passes to sarvam.TTS.
const VOICES = [
  'shubh',
  'aditya',
  'ritu',
  'priya',
  'neha',
  'rahul',
  'pooja',
  'rohan',
  'simran',
  'kavya',
  'amit',
  'dev',
  'ishita',
  'shreya',
  'ratan',
  'varun',
  'manan',
  'sumit',
  'roopa',
  'kabir',
  'aayan',
  'ashutosh',
  'advait',
  'anand',
  'tanya',
  'tarun',
  'sunny',
  'mani',
  'gokul',
  'vijay',
  'shruti',
  'suhani',
  'mohit',
  'kavitha',
  'rehan',
  'soham',
  'rupali',
]
const MODELS = ['gpt-4.1', 'gpt-4o-mini', 'gpt-4o']
const LANGUAGES = [
  ['hi-IN', 'Hindi'],
  ['en-IN', 'English'],
  ['mr-IN', 'Marathi'],
  ['ta-IN', 'Tamil'],
  ['te-IN', 'Telugu'],
  ['kn-IN', 'Kannada'],
  ['ml-IN', 'Malayalam'],
  ['gu-IN', 'Gujarati'],
  ['bn-IN', 'Bengali'],
  ['pa-IN', 'Punjabi'],
] as const

export function Agents() {
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [kbs, setKbs] = useState<KnowledgeBase[]>([])
  const [numbers, setNumbers] = useState<PhoneNumber[]>([])
  const [editing, setEditing] = useState<AgentConfig | null>(null)
  const [dialTestAgent, setDialTestAgent] = useState<AgentConfig | null>(null)
  const [browserTestAgent, setBrowserTestAgent] = useState<AgentConfig | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const reload = () => fetchAgents().then(setAgents).catch(() => setAgents([]))

  useEffect(() => {
    reload()
    fetchKnowledgeBases().then(setKbs).catch(() => setKbs([]))
    fetchPhoneNumbers().then(setNumbers).catch(() => setNumbers([]))
  }, [])

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      createAgent({ name: 'New agent' }).then((agent) => {
        setSearchParams({})
        setEditing(agent)
        reload()
      })
    }
  }, [searchParams, setSearchParams])

  const togglePause = async (agent: AgentConfig) => {
    await updateAgent(agent.id, { status: agent.status === 'live' ? 'paused' : 'live' })
    reload()
  }

  const handleDelete = async (agent: AgentConfig) => {
    if (!confirm(`Delete agent "${agent.name}"?`)) return
    await deleteAgent(agent.id)
    setEditing(null)
    reload()
  }

  return (
    <DashboardLayout>
      <PageHeader title="Agents" subtitle={`${agents.length} total agents`} />

      <section className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="rounded-lg border border-border bg-surface px-4 py-3 text-xs text-text-muted">
          <Icon name="info" className="mr-1.5 align-[-3px] text-[15px] text-cyan" />
          The first live agent takes all web calls. Changes here (prompt, voice, model, knowledge base,
          pause) apply from the very next call — no redeploy needed.
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <button
            onClick={() => createAgent({ name: 'New agent' }).then((a) => { setEditing(a); reload() })}
            className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border text-text-muted transition-colors hover:border-primary hover:text-primary"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border">
              <Icon name="add" className="text-[24px]" />
            </div>
            <span className="text-sm font-bold">New Agent</span>
            <span className="text-xs">Create AI assistant</span>
          </button>

          {agents.map((agent) => (
            <div key={agent.id} className="flex flex-col rounded-xl border border-border bg-surface p-5">
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
                <InfoRow icon="memory" label="Model" value={agent.model} />
                <InfoRow icon="record_voice_over" label="Voice" value={agent.voice} />
                <InfoRow icon="language" label="Language" value={agent.language} />
                <InfoRow icon="menu_book" label="Knowledge" value={kbs.find((k) => k.id === agent.kbId)?.name ?? 'none'} />
                <InfoRow icon="update" label="Updated" value={formatDateTime(agent.updatedAt)} />
              </dl>

              <div className="mt-auto flex gap-2">
                <button
                  onClick={() => togglePause(agent)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-bold hover:border-primary"
                >
                  <Icon name={agent.status === 'live' ? 'pause' : 'play_arrow'} className="text-[16px]" />
                  {agent.status === 'live' ? 'Pause' : 'Resume'}
                </button>
                <button
                  onClick={() => setEditing(agent)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-xs font-bold text-bg hover:opacity-90"
                >
                  <Icon name="edit" className="text-[16px]" />
                  Edit
                </button>
                <button
                  onClick={() => setDialTestAgent(agent)}
                  className="flex items-center justify-center rounded-lg border border-cyan/40 px-3 text-cyan hover:bg-cyan/10"
                  aria-label={`Call test — ${agent.name}`}
                  title="Place a real phone call to test this agent"
                >
                  <Icon name="call" className="text-[16px]" />
                </button>
                <button
                  onClick={() => setBrowserTestAgent(agent)}
                  className="flex items-center justify-center rounded-lg border border-primary/40 px-3 text-primary hover:bg-primary/10"
                  aria-label={`Browser test — ${agent.name}`}
                  title="Test this agent in-browser with your mic"
                >
                  <Icon name="mic" className="text-[16px]" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {editing && (
          <AgentEditor
            agent={editing}
            kbs={kbs}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              reload()
            }}
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

function AgentEditor({
  agent,
  kbs,
  onClose,
  onSaved,
}: {
  agent: AgentConfig
  kbs: KnowledgeBase[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: agent.name,
    description: agent.description,
    model: agent.model,
    voice: agent.voice,
    language: agent.language,
    systemPrompt: agent.systemPrompt,
    kbId: agent.kbId,
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await updateAgent(agent.id, form)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-primary/40 bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Edit agent — {agent.name}</h3>
        <button onClick={onClose} aria-label="Close editor" className="text-text-muted hover:text-text">
          <Icon name="close" className="text-[20px]" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Field label="Name">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="Description">
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What this agent does"
              className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Model">
              <select
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm"
              >
                {MODELS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Voice (Sarvam bulbul:v3)">
              <select
                value={form.voice}
                onChange={(e) => setForm({ ...form, voice: e.target.value })}
                className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm capitalize"
              >
                {VOICES.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Default language">
              <select
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
                className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm"
              >
                {LANGUAGES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Knowledge base">
              <select
                value={form.kbId ?? ''}
                onChange={(e) => setForm({ ...form, kbId: e.target.value ? Number(e.target.value) : null })}
                className="w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {kbs.map((kb) => (
                  <option key={kb.id} value={kb.id}>
                    {kb.name} ({kb.sources.length} sources)
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <Field label="System prompt (blank = built-in default sales-agent prompt)">
          <textarea
            value={form.systemPrompt}
            onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
            placeholder="Leave empty to use the built-in real-estate qualification prompt, or write a custom persona here…"
            className="h-full min-h-[220px] w-full resize-none rounded-lg border border-border bg-surface-high p-3 text-xs leading-relaxed outline-none focus:border-primary"
          />
        </Field>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-bold hover:border-primary">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">{label}</span>
      {children}
    </label>
  )
}
