import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { BrowserTestModal, DialTestModal } from '../components/AgentTestCall'
import { useAuth } from '../lib/auth'
import {
  createAgent,
  deleteAgent,
  fetchAgents,
  fetchKnowledgeBases,
  fetchPhoneNumbers,
  formatDateTime,
  updateAgent,
} from '../lib/api'
import type {
  AgentConfig,
  CustomFunction,
  KnowledgeBase,
  PhoneNumber,
  PostCallField,
} from '../lib/types'

// Curated down to one male (shubh) and one female (priya) voice — the full
// bulbul:v3 roster was overwhelming with no real differentiation for most
// operators. The voice picked here is exactly what agent/main.py passes to
// sarvam.TTS; an agent already saved with a different (now-hidden) speaker
// keeps working, it just won't be selectable again from this dropdown.
const VOICES = ['shubh', 'priya']
// bulbul:v3 is ~94% of Sarvam spend by character count. These two bulbul:v2
// speakers — cheaper per Sarvam's pricing — are offered so an operator can
// compare quality against v3 before switching a live agent over. Matches
// agent/main.py's _SARVAM_V2_SPEAKERS exactly; the raw speaker name (no
// prefix) is what's stored as the agent's `voice` field, same as VOICES —
// _build_tts picks the right Sarvam model per speaker automatically.
const SARVAM_V2_VOICES = [
  { value: 'abhilash', label: 'Abhilash (v2)' },
  { value: 'anushka', label: 'Anushka (v2)' },
] as const
// Google Cloud TTS voices, offered alongside Sarvam so an operator can try
// Google's voice quality directly rather than only hitting it as an
// automatic outage fallback. The "google:" prefix is how agent/main.py's
// _build_tts tells these apart from a Sarvam speaker name; only takes
// effect once GOOGLE_APPLICATION_CREDENTIALS_JSON is configured on the
// agent service — selecting one before that just falls back to Sarvam
// "shubh" silently.
const GOOGLE_VOICES = [
  // Gemini's multilingual voice personas — not locked to one locale, this
  // same voice speaks whatever language the conversation is actually in
  // (matches _build_tts's _GOOGLE_MULTILINGUAL_VOICES set exactly).
  { value: 'google:charon', label: 'Google Multilingual — Male' },
  { value: 'google:kore', label: 'Google Multilingual — Female' },
  // Locale-specific voices, kept for Hindi/English-India where an operator
  // wants that exact regional accent rather than the multilingual voice.
  { value: 'google:en-IN-Neural2-D', label: 'Google — English (India), Female' },
  { value: 'google:en-IN-Neural2-B', label: 'Google — English (India), Male' },
  { value: 'google:hi-IN-Neural2-A', label: 'Google — Hindi, Female' },
  { value: 'google:hi-IN-Neural2-B', label: 'Google — Hindi, Male' },
] as const
// Two ElevenLabs voices from the operator's own ElevenLabs account —
// multilingual by model (eleven_flash_v2_5 in agent/main.py), not by voice,
// so either can speak every language this platform supports. The
// "elevenlabs:" prefix is how _build_tts tells these apart from a Sarvam
// speaker name; only takes effect once ELEVEN_API_KEY is configured on the
// agent service — selecting one before that just falls back to Sarvam
// "shubh" silently, same as an unconfigured Google voice above.
const ELEVENLABS_VOICES = [
  { value: 'elevenlabs:7b9mYhmnp0y2qSH1FnBL', label: 'ElevenLabs — Abhi (Male)' },
  { value: 'elevenlabs:zmh5xhBvMzqR4ZlXgcgL', label: 'ElevenLabs — Monika (Female)' },
] as const
const voiceLabel = (voice: string) =>
  GOOGLE_VOICES.find((v) => v.value === voice)?.label ??
  ELEVENLABS_VOICES.find((v) => v.value === voice)?.label ??
  SARVAM_V2_VOICES.find((v) => v.value === voice)?.label ??
  voice
// The raw model string stays under the hood; operators only ever see the
// Vistrow tier name + quality tag, so we never expose which vendor model
// powers each tier. Order = premium → economy.
const MODEL_OPTIONS = [
  { value: 'gpt-4.1', label: 'Vistrow Prime', tag: 'Best reasoning & quality' },
  { value: 'gpt-4o', label: 'Vistrow Pro', tag: 'Fast & natural' },
  { value: 'gpt-4o-mini', label: 'Vistrow Standard', tag: 'Balanced · recommended' },
  { value: 'gemini-2.5-flash', label: 'Vistrow Flash', tag: 'Fast · setup pending' },
  { value: 'gemini-3.1-flash-lite', label: 'Vistrow Lite', tag: 'Economy · setup pending' },
] as const
const modelLabel = (value: string) => MODEL_OPTIONS.find((m) => m.value === value)?.label ?? value
// Presets for Sarvam bulbul:v3's own pace/temperature/pitch — controls how
// the voice is actually delivered (speed + prosodic variation), separate
// from the LLM's wording. Must mirror agent/main.py's TONE_PRESETS exactly.
const TONES = [
  {
    value: 'professional',
    label: 'Professional',
    description: 'Measured and steady — slower pace, low variation. Good for formal or informational agents.',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    description: "Sarvam's natural conversational default. A good starting point for most agents.",
  },
  {
    value: 'casual',
    label: 'Casual',
    description: 'Faster and more expressive — livelier pitch/pace variation. Fixes a flat or robotic-sounding voice.',
  },
] as const
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
  const { user } = useAuth()
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
                <InfoRow icon="memory" label="Model" value={modelLabel(agent.model)} />
                <InfoRow icon="record_voice_over" label="Voice" value={voiceLabel(agent.voice)} />
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
            isPlatformOwner={user?.isPlatformOwner ?? false}
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

type AgentForm = Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'>

function AgentEditor({
  agent,
  kbs,
  isPlatformOwner,
  onClose,
  onSaved,
}: {
  agent: AgentConfig
  kbs: KnowledgeBase[]
  isPlatformOwner: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<AgentForm>({
    name: agent.name,
    description: agent.description,
    model: agent.model,
    voice: agent.voice,
    language: agent.language,
    status: agent.status,
    systemPrompt: agent.systemPrompt,
    kbId: agent.kbId,
    tone: agent.tone || 'balanced',
    isPlatformDemo: agent.isPlatformDemo,
    firstSpeaker: agent.firstSpeaker || 'agent',
    welcomeMessage: agent.welcomeMessage || '',
    interruptionSensitivity: agent.interruptionSensitivity ?? 0.5,
    silenceReminderMs: agent.silenceReminderMs ?? 0,
    silenceReminderMax: agent.silenceReminderMax ?? 1,
    endCallOnSilenceMs: agent.endCallOnSilenceMs ?? 0,
    maxCallDurationS: agent.maxCallDurationS ?? 0,
    enabledFunctions: agent.enabledFunctions ?? '',
    transferPhone: agent.transferPhone ?? '',
    customFunctions: agent.customFunctions ?? [],
    postCallFields: agent.postCallFields ?? [],
    webhookUrl: agent.webhookUrl ?? '',
    memoryEnabled: agent.memoryEnabled ?? false,
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const set = <K extends keyof AgentForm>(key: K, value: AgentForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  // enabledFunctions is a comma list of the OPTIONAL built-ins that are on;
  // empty string means "all default on". end_call and web_search are toggled
  // here — transfer_call is governed by whether a transfer number is set.
  const OPTIONAL_FUNCTIONS = ['end_call', 'transfer_call', 'web_search']
  const enabledSet = (name: string) =>
    form.enabledFunctions.trim() === '' ||
    form.enabledFunctions.split(',').map((s) => s.trim()).includes(name)
  const endCallEnabled = enabledSet('end_call')
  const webSearchEnabled = enabledSet('web_search')
  const setOptionalFunction = (name: string, on: boolean) => {
    const current =
      form.enabledFunctions.trim() === ''
        ? new Set(OPTIONAL_FUNCTIONS)
        : new Set(form.enabledFunctions.split(',').map((s) => s.trim()).filter(Boolean))
    if (on) current.add(name)
    else current.delete(name)
    const all = OPTIONAL_FUNCTIONS.every((f) => current.has(f))
    set('enabledFunctions', all ? '' : [...current].join(','))
  }
  const setEndCall = (on: boolean) => setOptionalFunction('end_call', on)
  const setWebSearch = (on: boolean) => setOptionalFunction('web_search', on)

  const promptTokens = Math.max(0, Math.ceil(form.systemPrompt.length / 4))

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await updateAgent(agent.id, form)
      onSaved()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary'

  return (
    <div className="rounded-xl border border-primary/40 bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Edit agent — {agent.name}</h3>
        <button onClick={onClose} aria-label="Close editor" className="text-text-muted hover:text-text">
          <Icon name="close" className="text-[20px]" />
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {/* Identity */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Description">
            <input
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="What this agent does"
              className={inputCls}
            />
          </Field>
          <Field label="Model">
            <select value={form.model} onChange={(e) => set('model', e.target.value)} className={inputCls}>
              {MODEL_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label} — {m.tag}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Voice">
            <select value={form.voice} onChange={(e) => set('voice', e.target.value)} className={inputCls}>
              {/* A voice saved before the roster was curated down (or set directly
                  via API) won't match any option below — without this, the browser
                  silently shows the first option as "selected" while the real stored
                  value is untouched, so hitting Save re-persists the OLD voice even
                  though the dropdown visibly displayed a different one. */}
              {![
                ...VOICES,
                ...SARVAM_V2_VOICES.map((v) => v.value),
                ...GOOGLE_VOICES.map((v) => v.value),
                ...ELEVENLABS_VOICES.map((v) => v.value),
              ].includes(form.voice) && (
                <option value={form.voice}>
                  {voiceLabel(form.voice)} (current — not in curated list)
                </option>
              )}
              <optgroup label="ElevenLabs (most expressive — reacts to caller emotion live)">
                {ELEVENLABS_VOICES.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Sarvam bulbul:v3" className="capitalize">
                {VOICES.map((v) => (
                  <option key={v} value={v} className="capitalize">
                    {v}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Sarvam bulbul:v2 (cheaper, compare quality)">
                {SARVAM_V2_VOICES.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Google Cloud TTS">
                {GOOGLE_VOICES.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </Field>
          <Field label="Default language">
            <select value={form.language} onChange={(e) => set('language', e.target.value)} className={inputCls}>
              {LANGUAGES.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Voice delivery">
            <select value={form.tone} onChange={(e) => set('tone', e.target.value as AgentForm['tone'])} className={inputCls}>
              {TONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label} — {t.description.split('—')[0].trim()}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Conversation start */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Who speaks first">
            <select
              value={form.firstSpeaker}
              onChange={(e) => set('firstSpeaker', e.target.value as AgentForm['firstSpeaker'])}
              className={inputCls}
            >
              <option value="agent">AI speaks first (greets the caller)</option>
              <option value="user">Caller speaks first (agent waits)</option>
            </select>
          </Field>
          {form.firstSpeaker === 'agent' && (
            <Field label="Welcome message (blank = auto-generated)">
              <input
                value={form.welcomeMessage}
                onChange={(e) => set('welcomeMessage', e.target.value)}
                placeholder="e.g. Hi, thanks for calling Acme — how can I help?"
                className={inputCls}
              />
            </Field>
          )}
        </div>

        {/* System prompt */}
        <Field label="System prompt (blank = built-in generic assistant prompt)">
          <textarea
            value={form.systemPrompt}
            onChange={(e) => set('systemPrompt', e.target.value)}
            placeholder="Leave empty to use the built-in generic business assistant prompt, or write a custom persona here…"
            className="min-h-[160px] w-full resize-y rounded-lg border border-border bg-surface-high p-3 text-xs leading-relaxed outline-none focus:border-primary"
          />
          <div className="flex items-center justify-between text-[10px] text-text-muted">
            <span>
              Use <code className="rounded bg-surface-high px-1 py-0.5 text-primary">{'{{variable}}'}</code> for
              dynamic values filled per call.
            </span>
            <span>~{promptTokens} tokens</span>
          </div>
        </Field>

        {isPlatformOwner && (
          <label className="flex items-start gap-2 rounded-lg border border-border bg-surface-high/40 p-3">
            <input
              type="checkbox"
              checked={form.isPlatformDemo}
              onChange={(e) => set('isPlatformDemo', e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs leading-relaxed text-text-muted">
              <span className="font-bold text-text">Use as public website demo agent.</span> Powers the "talk
              to Artha live" demo on the Vistrow Voice marketing site. Only one agent platform-wide can hold
              this — enabling it here turns it off on any other agent.
            </span>
          </label>
        )}

        {/* Collapsible advanced panels */}
        <Panel icon="build" title="Functions" subtitle="What the agent can do during a call">
          <div className="flex flex-col gap-4">
            <Toggle
              checked={endCallEnabled}
              onChange={setEndCall}
              label="Let the agent end the call"
              hint="The agent hangs up on its own once the caller clearly signals they're done."
            />
            <Toggle
              checked={webSearchEnabled}
              onChange={setWebSearch}
              label="Let the agent search the web"
              hint="Looks up current facts, prices, or news outside the knowledge base via Tavily. Requires TAVILY_API_KEY to be set on the agent worker — otherwise this has no effect."
            />
            <Field label="Transfer to a human — number to dial (blank = disabled)">
              <input
                value={form.transferPhone}
                onChange={(e) => set('transferPhone', e.target.value)}
                placeholder="+91 98765 43210"
                className={inputCls}
              />
              <span className="text-[10px] text-text-muted">
                When set, the agent can transfer a phone caller to this number on request. Web/demo calls
                can't be transferred to a phone.
              </span>
            </Field>
            <CustomFunctionsEditor
              value={form.customFunctions}
              onChange={(v) => set('customFunctions', v)}
              inputCls={inputCls}
            />
          </div>
        </Panel>

        <Panel icon="menu_book" title="Knowledge base" subtitle="Ground answers in your own documents">
          <Field label="Attached knowledge base">
            <select
              value={form.kbId ?? ''}
              onChange={(e) => set('kbId', e.target.value ? Number(e.target.value) : null)}
              className={inputCls}
            >
              <option value="">None</option>
              {kbs.map((kb) => (
                <option key={kb.id} value={kb.id}>
                  {kb.name} ({kb.sources.length} sources)
                </option>
              ))}
            </select>
          </Field>
        </Panel>

        <Panel icon="graphic_eq" title="Speech settings" subtitle="Turn-taking and silence handling">
          <div className="flex flex-col gap-4">
            <Field label={`Interruption sensitivity — ${Math.round(form.interruptionSensitivity * 100)}%`}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={form.interruptionSensitivity}
                onChange={(e) => set('interruptionSensitivity', Number(e.target.value))}
                className="w-full accent-primary"
              />
              <span className="text-[10px] text-text-muted">
                Higher = the agent yields the floor faster when the caller starts talking. Lower = it ignores
                brief noise and finishes its sentence.
              </span>
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <NumberField
                label="Silence check-in after (sec)"
                value={form.silenceReminderMs / 1000}
                onChange={(n) => set('silenceReminderMs', Math.round(n * 1000))}
                hint="0 = default (~6.5s)"
                inputCls={inputCls}
              />
              <NumberField
                label="Max check-ins"
                value={form.silenceReminderMax}
                onChange={(n) => set('silenceReminderMax', Math.round(n))}
                inputCls={inputCls}
              />
              <NumberField
                label="End call after silence (sec)"
                value={form.endCallOnSilenceMs / 1000}
                onChange={(n) => set('endCallOnSilenceMs', Math.round(n * 1000))}
                hint="0 = never"
                inputCls={inputCls}
              />
            </div>
          </div>
        </Panel>

        <Panel icon="call" title="Call settings" subtitle="Duration limits">
          <NumberField
            label="Max call duration (sec)"
            value={form.maxCallDurationS}
            onChange={(n) => set('maxCallDurationS', Math.round(n))}
            hint="0 = no limit. The call ends automatically after this long."
            inputCls={inputCls}
          />
        </Panel>

        <Panel icon="fact_check" title="Post-call data extraction" subtitle="Pull structured fields from each transcript">
          <PostCallFieldsEditor
            value={form.postCallFields}
            onChange={(v) => set('postCallFields', v)}
            inputCls={inputCls}
          />
        </Panel>

        <Panel icon="webhook" title="Webhook" subtitle="Send call results to your systems">
          <Field label="Webhook URL (blank = none)">
            <input
              value={form.webhookUrl}
              onChange={(e) => set('webhookUrl', e.target.value)}
              placeholder="https://your-server.com/vistrow-events"
              className={inputCls}
            />
          </Field>
        </Panel>

        <Panel icon="psychology" title="Memory" subtitle="Recognize returning callers">
          <Toggle
            checked={form.memoryEnabled}
            onChange={(v) => set('memoryEnabled', v)}
            label="Remember returning callers"
            hint="The agent recalls past conversations with the same caller (matched by phone). Phone and widget calls only — not the anonymous web demo."
          />
        </Panel>
      </div>

      <div className="mt-5 flex items-center justify-end gap-3">
        {saveError && <p className="text-xs font-semibold text-destructive">{saveError}</p>}
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

function Panel({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: string
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-border bg-surface-high/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-3">
          <Icon name={icon} className="text-[18px] text-text-muted" />
          <span>
            <span className="block text-sm font-bold">{title}</span>
            {subtitle && <span className="block text-[11px] text-text-muted">{subtitle}</span>}
          </span>
        </span>
        <Icon name={open ? 'expand_less' : 'expand_more'} className="text-[20px] text-text-muted" />
      </button>
      {open && <div className="border-t border-border px-4 py-4">{children}</div>}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span className="text-xs leading-relaxed">
        <span className="font-bold text-text">{label}</span>
        {hint && <span className="mt-0.5 block text-text-muted">{hint}</span>}
      </span>
    </label>
  )
}

function NumberField({
  label,
  value,
  onChange,
  hint,
  inputCls,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  hint?: string
  inputCls: string
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        min={0}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className={inputCls}
      />
      {hint && <span className="text-[10px] text-text-muted">{hint}</span>}
    </Field>
  )
}

const CUSTOM_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

function CustomFunctionsEditor({
  value,
  onChange,
  inputCls,
}: {
  value: CustomFunction[]
  onChange: (v: CustomFunction[]) => void
  inputCls: string
}) {
  const update = (i: number, patch: Partial<CustomFunction>) =>
    onChange(value.map((fn, idx) => (idx === i ? { ...fn, ...patch } : fn)))
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i))
  const add = () =>
    onChange([
      ...value,
      { name: '', description: '', url: '', method: 'POST', headers: {}, parameters: [] },
    ])

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-text-muted">
        Custom functions let the agent call your API mid-conversation (look up an order, check a booking,
        etc.). The agent decides when to call it based on the name + description.
      </p>
      {value.map((fn, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">
              Function {i + 1}
            </span>
            <button onClick={() => remove(i)} aria-label="Remove function" className="text-text-muted hover:text-destructive">
              <Icon name="delete" className="text-[16px]" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={fn.name}
              onChange={(e) => update(i, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })}
              placeholder="function_name"
              className={inputCls}
            />
            <select value={fn.method} onChange={(e) => update(i, { method: e.target.value as CustomFunction['method'] })} className={inputCls}>
              {CUSTOM_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
          <input
            value={fn.url}
            onChange={(e) => update(i, { url: e.target.value })}
            placeholder="https://your-api.com/endpoint"
            className={inputCls}
          />
          <input
            value={fn.description}
            onChange={(e) => update(i, { description: e.target.value })}
            placeholder="When should the agent call this? e.g. Look up an order by its ID"
            className={inputCls}
          />
          <ParamsEditor
            value={fn.parameters}
            onChange={(params) => update(i, { parameters: params })}
            inputCls={inputCls}
          />
        </div>
      ))}
      <button
        onClick={add}
        className="self-start rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-bold text-text-muted hover:border-primary hover:text-text"
      >
        + Add custom function
      </button>
    </div>
  )
}

function ParamsEditor({
  value,
  onChange,
  inputCls,
}: {
  value: CustomFunction['parameters']
  onChange: (v: CustomFunction['parameters']) => void
  inputCls: string
}) {
  const update = (i: number, patch: Partial<CustomFunction['parameters'][number]>) =>
    onChange(value.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-surface-high/30 p-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Parameters</span>
      {value.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={p.name}
            onChange={(e) => update(i, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })}
            placeholder="param"
            className={`${inputCls} flex-1`}
          />
          <select value={p.type} onChange={(e) => update(i, { type: e.target.value as 'string' | 'number' | 'boolean' })} className={`${inputCls} w-24`}>
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
          </select>
          <label className="flex items-center gap-1 text-[10px] text-text-muted">
            <input type="checkbox" checked={p.required} onChange={(e) => update(i, { required: e.target.checked })} />
            req
          </label>
          <button onClick={() => onChange(value.filter((_, idx) => idx !== i))} aria-label="Remove parameter" className="text-text-muted hover:text-destructive">
            <Icon name="close" className="text-[14px]" />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...value, { name: '', type: 'string', description: '', required: false }])}
        className="self-start text-[11px] font-bold text-primary hover:underline"
      >
        + parameter
      </button>
    </div>
  )
}

function PostCallFieldsEditor({
  value,
  onChange,
  inputCls,
}: {
  value: PostCallField[]
  onChange: (v: PostCallField[]) => void
  inputCls: string
}) {
  const update = (i: number, patch: Partial<PostCallField>) =>
    onChange(value.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-text-muted">
        After each call, the agent reads the transcript and fills these fields — shown on the call record.
      </p>
      {value.map((f, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={f.key}
            onChange={(e) => update(i, { key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })}
            placeholder="field_key"
            className={`${inputCls} w-40`}
          />
          <select value={f.type} onChange={(e) => update(i, { type: e.target.value as PostCallField['type'] })} className={`${inputCls} w-24`}>
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
          </select>
          <input
            value={f.description}
            onChange={(e) => update(i, { description: e.target.value })}
            placeholder="What to extract, e.g. the caller's order number"
            className={`${inputCls} flex-1`}
          />
          <button onClick={() => onChange(value.filter((_, idx) => idx !== i))} aria-label="Remove field" className="text-text-muted hover:text-destructive">
            <Icon name="close" className="text-[14px]" />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...value, { key: '', type: 'string', description: '' }])}
        className="self-start rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-bold text-text-muted hover:border-primary hover:text-text"
      >
        + Add field
      </button>
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
