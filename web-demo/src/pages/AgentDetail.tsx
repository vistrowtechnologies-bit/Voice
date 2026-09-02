import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { UpgradeRequiredModal } from '../components/UpgradeRequiredModal'
import { VoicePreviewButton } from '../components/VoicePreviewButton'
import { useAuth } from '../lib/auth'
import {
  deleteAgent,
  fetchAgents,
  fetchKnowledgeBases,
  fetchMyVoices,
  updateAgent,
} from '../lib/api'
import {
  AMBIENT_NOISE_OPTIONS,
  EMOTION_INTENSITIES,
  LANGUAGES,
  modelOptionsFor,
  TONES,
  voiceLabel,
  voicePickerGroups,
} from '../lib/agentOptions'
import type { AgentConfig, CustomFunction, KnowledgeBase, PostCallField, VoiceEntry } from '../lib/types'

type AgentForm = Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'>

// Its own routed page (/dashboard/agents/:id) rather than an inline panel on
// the Agents list - editing a specific agent is a distinct enough task (and
// long enough a form) to deserve a real URL an operator can bookmark/share/
// hit back-button on, matching how every other detail view in this app
// (a call, a contact, a campaign) already works.
export function AgentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [agent, setAgent] = useState<AgentConfig | null>(null)
  const [kbs, setKbs] = useState<KnowledgeBase[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setLoaded(false)
    Promise.all([fetchAgents(), fetchKnowledgeBases().catch(() => [])]).then(([agents, kbList]) => {
      setAgent(agents.find((a) => String(a.id) === id) ?? null)
      setKbs(kbList)
      setLoaded(true)
    })
  }, [id])

  const backToList = () => navigate('/dashboard/agents')

  if (!loaded) {
    return (
      <DashboardLayout>
        <PageHeader title="Agent" />
        <div className="p-4 sm:p-6">
          <p className="text-sm text-text-muted">Loading…</p>
        </div>
      </DashboardLayout>
    )
  }

  if (!agent) {
    return (
      <DashboardLayout>
        <PageHeader title="Agent not found" />
        <div className="flex flex-col items-start gap-3 p-4 sm:p-6">
          <p className="text-sm text-text-muted">This agent doesn't exist, or was deleted.</p>
          <Link to="/dashboard/agents" className="text-sm font-bold text-primary hover:underline">
            ← Back to agents
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <PageHeader title={agent.name} subtitle={agent.description || 'No description yet'}>
        <Link
          to="/dashboard/agents"
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-text-muted hover:border-primary hover:text-text"
        >
          <Icon name="arrow_back" className="text-[15px]" />
          Back to agents
        </Link>
      </PageHeader>
      <section className="p-4 sm:p-6">
        <AgentEditorForm
          agent={agent}
          kbs={kbs}
          isPlatformOwner={user?.isPlatformOwner ?? false}
          onCancel={backToList}
          onDeleted={backToList}
        />
      </section>
    </DashboardLayout>
  )
}

function AgentEditorForm({
  agent,
  kbs,
  isPlatformOwner,
  onCancel,
  onDeleted,
}: {
  agent: AgentConfig
  kbs: KnowledgeBase[]
  isPlatformOwner: boolean
  onCancel: () => void
  onDeleted: () => void
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
    emotionIntensity: agent.emotionIntensity || 'strong',
    ambientNoise: agent.ambientNoise || 'off',
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
    emergencyFallbackNumber: agent.emergencyFallbackNumber ?? '',
    customFunctions: agent.customFunctions ?? [],
    postCallFields: agent.postCallFields ?? [],
    webhookUrl: agent.webhookUrl ?? '',
    memoryEnabled: agent.memoryEnabled ?? false,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null)
  // The account's curated voice menu - the only voices this picker offers.
  const [myVoices, setMyVoices] = useState<VoiceEntry[]>([])
  useEffect(() => {
    fetchMyVoices().then(setMyVoices).catch(() => setMyVoices([]))
  }, [])

  const set = <K extends keyof AgentForm>(key: K, value: AgentForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  // enabledFunctions is a comma list of the OPTIONAL built-ins that are on;
  // empty string means "all default on". end_call and web_search are toggled
  // here - transfer_call is governed by whether a transfer number is set.
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
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save changes. Please try again.'
      // The dashboard's own voice picker only ever offers voices already in
      // the account's curated menu, so this rarely fires from here in
      // practice - but update_agent's server-side re-validation (see
      // server/token_api.py's _guard_voice_tier) is the real backstop, and
      // when it does reject, it deserves the same upgrade path as every
      // other plan-gate error rather than a plain inline message.
      if (msg.toLowerCase().includes('upgrade')) {
        setUpgradeMessage(msg)
      } else {
        setSaveError(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete agent "${agent.name}"?`)) return
    await deleteAgent(agent.id)
    onDeleted()
  }

  const inputCls =
    'w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary'

  return (
    <div className="flex flex-col gap-4">
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
              {modelOptionsFor(isPlatformOwner).map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label} - {m.tag}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Voice">
            <div className="flex items-center gap-2">
              <select value={form.voice} onChange={(e) => set('voice', e.target.value)} className={inputCls}>
                {/* Current voice isn't in this account's menu (a legacy voice, or
                    one removed from the menu since it was set) - surface it so the
                    browser doesn't silently show a different option as selected and
                    re-persist the wrong voice on Save. */}
                {!myVoices.some((v) => v.value === form.voice) && (
                  <option value={form.voice}>{voiceLabel(form.voice)} (not in your voices)</option>
                )}
                {voicePickerGroups(myVoices).map((group) => {
                  if (group.voices.length === 0) return null
                  return (
                    <optgroup key={group.key} label={`${group.label} - ${group.note}`}>
                      {group.voices.map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.name}
                          {v.note ? ` - ${v.note}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )
                })}
              </select>
              {(() => {
                const current = myVoices.find((v) => v.value === form.voice)
                if (!current) return null
                return (
                  <VoicePreviewButton
                    voice={form.voice}
                    lang={current.forceLang || ((form.language || 'hi').startsWith('en') ? 'en' : 'hi')}
                  />
                )
              })()}
            </div>
            <span className="text-[10px] text-text-muted">
              {myVoices.length === 0 ? (
                'Loading your voices…'
              ) : (
                <>
                  Only voices you’ve added appear here.{' '}
                  <Link to="/dashboard/voices" className="text-primary hover:underline">
                    Manage voices →
                  </Link>
                </>
              )}
            </span>
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
                  {t.label} - {t.description.split('-')[0].trim()}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Emotion intensity">
            <select
              value={form.emotionIntensity}
              onChange={(e) => set('emotionIntensity', e.target.value as AgentForm['emotionIntensity'])}
              className={inputCls}
            >
              {EMOTION_INTENSITIES.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label} - {i.description}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Background ambience">
            <select
              value={form.ambientNoise}
              onChange={(e) => set('ambientNoise', e.target.value as AgentForm['ambientNoise'])}
              className={inputCls}
            >
              {AMBIENT_NOISE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} - {o.description}
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
                placeholder="e.g. Hi, thanks for calling Acme - how can I help?"
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
              this - enabling it here turns it off on any other agent.
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
              hint="Looks up current facts, prices, or news that aren't in the knowledge base."
            />
            <Field label="Transfer to a human - number to dial (blank = disabled)">
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
            <Field label="Emergency fallback - backup number if the call breaks (blank = disabled)">
              <input
                value={form.emergencyFallbackNumber}
                onChange={(e) => set('emergencyFallbackNumber', e.target.value)}
                placeholder="+91 98765 43210"
                className={inputCls}
              />
              <span className="text-[10px] text-text-muted">
                Separate from the transfer number above - this only fires if the call itself breaks (an
                unrecoverable speech/AI error), not when a caller asks for a human.
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
            <Field label={`Interruption sensitivity - ${Math.round(form.interruptionSensitivity * 100)}%`}>
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
            hint="The agent recalls past conversations with the same caller (matched by phone). Phone and widget calls only - not the anonymous web demo."
          />
        </Panel>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <button
          onClick={handleDelete}
          className="flex items-center gap-1.5 rounded-lg border border-destructive/40 px-4 py-2 text-sm font-bold text-destructive hover:bg-destructive/10"
        >
          <Icon name="delete" className="text-[16px]" />
          Delete agent
        </button>
        <div className="flex items-center gap-3">
          {saveError && <p className="text-xs font-semibold text-destructive">{saveError}</p>}
          {saved && <p className="text-xs font-semibold text-green-500">Saved</p>}
          <button onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm font-bold hover:border-primary">
            Back
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

      {upgradeMessage && (
        <UpgradeRequiredModal message={upgradeMessage} onClose={() => setUpgradeMessage(null)} />
      )}
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
        After each call, the agent reads the transcript and fills these fields - shown on the call record.
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
