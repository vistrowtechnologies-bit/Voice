import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BrowserTestModal } from '../components/AgentTestCall'
import { ClonedVoiceOptions, clonedVoiceFallbackName, useClonedVoices } from '../components/ClonedVoiceOptions'
import { AmbiencePreviewButton } from '../components/AmbiencePreviewButton'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { UpgradeRequiredModal } from '../components/UpgradeRequiredModal'
import { VariableInput } from '../components/VariableInput'
import { VoicePreviewButton } from '../components/VoicePreviewButton'
import { apiProfilePreferences, apiUpdateProfilePreferences, useAuth } from '../lib/auth'
import {
  deleteAgent,
  fetchAgents,
  fetchEntitlements,
  fetchIntegrations,
  fetchKnowledgeBases,
  fetchLaunchReadiness,
  fetchMyVoices,
  fetchProjectListings,
  fetchVoiceCatalog,
  updateAgent,
} from '../lib/api'
import {
  AMBIENT_NOISE_OPTIONS,
  geminiLiveVoiceName,
  LANGUAGES,
  isRealtimeModel,
  LIVE_MODEL,
  modelOptionsFor,
  modelLabel,
  nearestVoiceFor,
  NOISE_CANCELLATION_OPTIONS,
  STANDARD_MODEL,
  TONES,
  voiceLabel,
  voicePickerGroups,
  voiceWorksWithModel,
} from '../lib/agentOptions'
import type { AgentConfig, AgentVariable, CustomFunction, FollowUpPolicy, Integration, KnowledgeBase, PostCallField, VoiceEntry } from '../lib/types'
import { FIRST_CALL_DELAY_CHOICES, FOLLOW_UP_DEFAULTS } from '../lib/types'
import { InfoTip } from '../components/ui/Tooltip'

// Must match agent/main.py's template_vars keys exactly (the substitution
// call site, not calls_db.py) - these are the only names that are always
// filled from the contact record with no dashboard configuration needed.
const BUILTIN_TEMPLATE_VARS = ['first_name', 'last_name', 'name', 'phone', 'company']

type AgentForm = Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'>

// Same set agent/db.py's get_delivery_integrations() will actually deliver
// to - keeps this picker from offering integrations that can never receive
// a lead (e.g. facebook, which isn't a delivery target).
const DELIVERY_KEYS = new Set(['webhook', 'slack', 'whatsapp', 'sheets', 'arthaleads', 'zoho_crm'])

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
  // ?drafted=1 - arrived from "Build with AI" (AgentBuilder.tsx).
  const [searchParams, setSearchParams] = useSearchParams()
  const drafted = searchParams.get('drafted') === '1'
  // ?test=1: "Run a test call" on the Build with AI success screen.
  const [testing, setTesting] = useState(searchParams.get('test') === '1')

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
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-bold text-text-muted hover:border-primary hover:text-text"
        >
          <Icon name="arrow_back" className="text-[15px]" />
          Agents
        </Link>
      </PageHeader>
      <section className="p-4 sm:p-6">
        {drafted && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
            <Icon name="auto_awesome" className="text-[18px] text-primary" />
            <span className="min-w-0 flex-1">Drafted with AI — review the instructions and run a test call.</span>
            <button
              type="button"
              onClick={() => setTesting(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-bg hover:opacity-90"
            >
              <Icon name="mic" className="text-[15px]" />
              Test call
            </button>
            <button
              type="button"
              onClick={() => setSearchParams({}, { replace: true })}
              aria-label="Dismiss"
              className="bg-transparent text-text-muted hover:text-text"
            >
              <Icon name="close" className="text-[18px]" />
            </button>
          </div>
        )}
        {testing && <BrowserTestModal agent={agent} onClose={() => setTesting(false)} />}
        <AgentEditorForm
          agent={agent}
          kbs={kbs}
          isPlatformOwner={user?.isPlatformOwner ?? false}
          onDeleted={backToList}
          onTest={() => setTesting(true)}
        />
      </section>
    </DashboardLayout>
  )
}

function AgentEditorForm({
  agent,
  kbs,
  isPlatformOwner,
  onDeleted,
  onTest,
}: {
  agent: AgentConfig
  kbs: KnowledgeBase[]
  isPlatformOwner: boolean
  onDeleted: () => void
  onTest: () => void
}) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<AgentTab>('instructions')
  const tabContentRef = useRef<HTMLDivElement>(null)
  const firstTab = useRef(true)
  useEffect(() => {
    if (firstTab.current) { firstTab.current = false; return }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    tabContentRef.current?.animate(
      [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
      { duration: 280, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
    )
  }, [tab])
  const [catalogAccess, setCatalogAccess] = useState<boolean | null>(null)
  useEffect(() => { fetchEntitlements().then((e) => setCatalogAccess(!!e.features.live_catalog)).catch(() => setCatalogAccess(false)) }, [])
  const [form, setForm] = useState<AgentForm>({
    name: agent.name,
    description: agent.description,
    model: agent.model,
    noiseCancellation: agent.noiseCancellation ?? '',
    voice: agent.voice,
    sttProvider: agent.sttProvider || 'sarvam',
    language: agent.language,
    status: agent.status,
    systemPrompt: agent.systemPrompt,
    kbId: agent.kbId,
    tone: agent.tone || 'balanced',
    emotionIntensity: agent.emotionIntensity || 'strong',
    // 'on' predates the sound picker and always meant the office track.
    ambientNoise: agent.ambientNoise === 'on' ? 'office' : agent.ambientNoise || 'off',
    ambientVolume: agent.ambientVolume ?? 0.5,
    isPlatformDemo: agent.isPlatformDemo,
    firstSpeaker: agent.firstSpeaker || 'agent',
    welcomeMessage: agent.welcomeMessage || '',
    welcomeMessageOutbound: agent.welcomeMessageOutbound || '',
    interruptionSensitivity: agent.interruptionSensitivity ?? 0.5,
    silenceReminderMs: agent.silenceReminderMs ?? 0,
    silenceReminderMax: agent.silenceReminderMax ?? 1,
    endCallOnSilenceMs: agent.endCallOnSilenceMs ?? 0,
    maxCallDurationS: agent.maxCallDurationS ?? 0,
    enabledFunctions: agent.enabledFunctions ?? '',
    transferPhone: agent.transferPhone ?? '',
    emergencyFallbackNumber: agent.emergencyFallbackNumber ?? '',
    customFunctions: agent.customFunctions ?? [],
    variables: agent.variables ?? [],
    postCallFields: agent.postCallFields ?? [],
    webhookUrl: agent.webhookUrl ?? '',
    memoryEnabled: agent.memoryEnabled ?? false,
    liveCatalogEnabled: agent.liveCatalogEnabled ?? false,
    crmIntegrationKeys: agent.crmIntegrationKeys ?? [],
    followUpPolicy: agent.followUpPolicy ?? FOLLOW_UP_DEFAULTS,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null)
  // The account's curated voice menu - the only voices this picker offers.
  const [myVoices, setMyVoices] = useState<VoiceEntry[]>([])
  const [catalog, setCatalog] = useState<VoiceEntry[]>([])
  // Cloned voices ("custom:..."): offered in their own "Your voices" group when ready.
  const clonedVoices = useClonedVoices()
  const clonedReady = clonedVoices.some((v) => v.voiceValue === form.voice && v.status === 'ready')
  // The realtime-capable voices the account has added to its menu, labelled
  // with gender, Google's style word and the Gemini voice a Live call uses.
  const realtimeVoices = useMemo(() => {
    const style = new Map(
      catalog.filter((v) => v.value.startsWith('google38:')).map((v) => [v.value.slice(9), v.note.split(' · ')[0]]),
    )
    return myVoices
      .filter((v) => geminiLiveVoiceName(v.value))
      .map((v) => {
        const live = geminiLiveVoiceName(v.value)!
        const gender = v.gender === 'female' ? 'Female' : v.gender === 'male' ? 'Male' : 'Neutral'
        const tone = style.get(live.toLowerCase())
        return { value: v.value, label: `${v.name} · ${gender}${tone ? ` · ${tone}` : ''}`, name: v.name }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [catalog, myVoices])
  useEffect(() => {
    fetchMyVoices().then(setMyVoices).catch(() => setMyVoices([]))
    // Only for Google's style words in the realtime labels (realtime is owner-only).
    if (isPlatformOwner) fetchVoiceCatalog().then((c) => setCatalog(c.voices)).catch(() => setCatalog([]))
  }, [])
  // Connected lead-delivery integrations this agent can be scoped to.
  const [connectedIntegrations, setConnectedIntegrations] = useState<Integration[]>([])
  useEffect(() => {
    fetchIntegrations()
      .then((list) => setConnectedIntegrations(list.filter((i) => i.status === 'connected' && DELIVERY_KEYS.has(i.key))))
      .catch(() => setConnectedIntegrations([]))
  }, [])
  const [catalogCount, setCatalogCount] = useState(0)
  const [catalogConfigured, setCatalogConfigured] = useState(false)
  useEffect(() => {
    fetchProjectListings()
      .then((result) => {
        setCatalogCount(result.listings.length)
        setCatalogConfigured(Boolean(result.feedUrl))
      })
      .catch(() => {
        setCatalogCount(0)
        setCatalogConfigured(false)
      })
  }, [])

  const set = <K extends keyof AgentForm>(key: K, value: AgentForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const voiceName = (value: string) =>
    myVoices.find((v) => v.value === value)?.name ??
    clonedVoiceFallbackName(value, clonedVoices) ??
    catalog.find((v) => v.value === value)?.name ??
    voiceLabel(value)
  // The voice a model switch replaced automatically, so the notice can name
  // both and Undo (or switching back) can restore it.
  const [voiceSwitch, setVoiceSwitch] = useState<{ from: string; fromModel: string; to: string | null } | null>(null)
  const changeModel = (model: string) => {
    const auto = voiceSwitch && form.voice === (voiceSwitch.to ?? form.voice) ? voiceSwitch : null
    if (auto && voiceWorksWithModel(model, auto.from)) {
      // Back on a model that can speak the voice we replaced: put it back.
      setForm((f) => ({ ...f, model, voice: auto.from }))
      setVoiceSwitch(null)
      return
    }
    if (voiceWorksWithModel(model, form.voice)) {
      set('model', model)
      return
    }
    const gender = (myVoices.find((v) => v.value === form.voice) ?? catalog.find((v) => v.value === form.voice))?.gender
    const pick = nearestVoiceFor(model, form.voice, gender, myVoices)
    setForm((f) => ({ ...f, model, voice: pick?.value ?? f.voice }))
    setVoiceSwitch({ from: auto?.from ?? form.voice, fromModel: auto?.fromModel ?? form.model, to: pick?.value ?? null })
  }
  // Engine picker: tenants have exactly one standard engine; the owner also
  // has Live (realtime) and an Advanced list of the other standard models.
  const [showModels, setShowModels] = useState(false)
  const lastStandardModel = useRef(isRealtimeModel(agent.model) ? STANDARD_MODEL : agent.model || STANDARD_MODEL)
  const undoVoiceSwitch = () => {
    if (!voiceSwitch) return
    setForm((f) => ({ ...f, model: voiceSwitch.fromModel, voice: voiceSwitch.from }))
    setVoiceSwitch(null)
  }

  // enabledFunctions is a comma list of the OPTIONAL built-ins that are on;
  // empty string means "all default on". end_call, web_search and send_dtmf
  // are toggled here - transfer_call is governed by whether a transfer
  // number is set. Every name here MUST stay in sync with agent/main.py's
  // _build_tools - setOptionalFunction below recomputes the full list on
  // every toggle, so a name missing here would silently drop out of
  // enabledFunctions (and therefore get disabled) the next time an operator
  // toggles ANY other function.
  const OPTIONAL_FUNCTIONS = ['end_call', 'transfer_call', 'web_search', 'send_dtmf']
  const enabledSet = (name: string) =>
    form.enabledFunctions.trim() === '' ||
    form.enabledFunctions.split(',').map((s) => s.trim()).includes(name)
  const endCallEnabled = enabledSet('end_call')
  const webSearchEnabled = enabledSet('web_search')
  const sendDtmfEnabled = enabledSet('send_dtmf')
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
  const setSendDtmf = (on: boolean) => setOptionalFunction('send_dtmf', on)

  const promptTokens = Math.max(0, Math.ceil(form.systemPrompt.length / 4))

  const save = async (): Promise<boolean> => {
    setSaving(true)
    setSaveError(null)
    try {
      await updateAgent(agent.id, form)
      savedSnapshot.current = JSON.stringify(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 4000)
      return true
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
      return false
    } finally {
      setSaving(false)
    }
  }

  // Unsaved edits: the form against what was last loaded or saved.
  const savedSnapshot = useRef(JSON.stringify(form))
  const dirty = JSON.stringify(form) !== savedSnapshot.current
  const discard = () => setForm(JSON.parse(savedSnapshot.current) as AgentForm)

  // Live / paused applies at once (like the switch on the Agents page), and
  // the saved copy follows so Save never puts the old status back.
  const [statusBusy, setStatusBusy] = useState(false)
  const toggleLive = async () => {
    const next: AgentForm['status'] = form.status === 'live' ? 'paused' : 'live'
    setStatusBusy(true)
    try {
      await updateAgent(agent.id, { status: next })
      setForm((f) => ({ ...f, status: next }))
      savedSnapshot.current = JSON.stringify({ ...(JSON.parse(savedSnapshot.current) as AgentForm), status: next })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not change the status.')
    } finally {
      setStatusBusy(false)
    }
  }

  // A test call uses the saved agent, so unsaved edits are saved first.
  const talk = async () => {
    if (dirty && !(await save())) return
    onTest()
  }

  // Setup, from the form as it is now (so it moves while you edit); only the
  // channel comes from the server, which knows numbers and website widgets.
  const [channelReady, setChannelReady] = useState(false)
  useEffect(() => {
    fetchLaunchReadiness()
      .then((r) => setChannelReady(Boolean(r.agents.find((a) => a.id === agent.id)?.checks.channel)))
      .catch(() => setChannelReady(false))
  }, [agent.id])
  const steps: SetupStep[] = [
    { key: 'persona', label: 'Persona', action: 'Write the prompt', hint: 'Write what the agent says and does', done: Boolean(form.systemPrompt.trim() || form.welcomeMessage.trim()), tab: 'instructions' },
    { key: 'voice', label: 'Voice', action: 'Pick a voice', hint: 'Pick how it sounds', done: Boolean(form.voice), tab: 'voice' },
    { key: 'knowledge', label: 'Knowledge', action: 'Attach knowledge', hint: 'Attach your answers and documents', done: Boolean(form.kbId), tab: 'tools' },
    { key: 'channel', label: 'Channel', action: 'Connect a channel', hint: 'Connect a phone number or website', done: channelReady, to: '/dashboard/numbers' },
    { key: 'live', label: 'Go live', action: 'Turn it on', hint: 'Turn the agent on', done: form.status === 'live' },
  ]
  const nextStep = steps.find((step) => !step.done) ?? null
  const goToStep = (step: SetupStep) => {
    if (step.key === 'live') void toggleLive()
    else if (step.to) navigate(step.to)
    else if (step.tab) setTab(step.tab)
  }

  // First-time guide (C): shown until this user skips or finishes it, once.
  const [guideOpen, setGuideOpen] = useState(false)
  useEffect(() => {
    apiProfilePreferences().then((p) => setGuideOpen(!p.agent_guide_dismissed)).catch(() => setGuideOpen(false))
  }, [])
  const closeGuide = () => {
    setGuideOpen(false)
    apiUpdateProfilePreferences({ agent_guide_dismissed: true }).catch(() => undefined)
  }

  const handleDelete = async () => {
    if (!confirm(`Delete agent "${agent.name}"?`)) return
    await deleteAgent(agent.id)
    onDeleted()
  }

  const inputCls =
    'w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10'

  // Offered after typing "{{" in a Welcome Message field - the built-ins
  // agent/main.py always fills from the contact record, plus whatever this
  // agent has defined in its own Variables panel below.
  const variableSuggestions = [
    ...BUILTIN_TEMPLATE_VARS,
    ...form.variables.map((v) => v.name).filter(Boolean),
  ]

  return (
    <div className="flex flex-col gap-4">
      <AgentHero
        agent={agent}
        name={form.name}
        description={form.description}
        model={form.model}
        voice={voiceName(form.voice)}
        language={form.language}
        live={form.status === 'live'}
        statusBusy={statusBusy}
        steps={steps}
        nextStep={nextStep}
        onToggleLive={() => void toggleLive()}
        onStep={goToStep}
        onTalk={() => void talk()}
        onDelete={() => void handleDelete()}
      />
      {guideOpen && <SetupGuide steps={steps} onStep={goToStep} onClose={closeGuide} />}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-4">
      <AgentTabBar tab={tab} onChange={setTab} />
      <div ref={tabContentRef} className="flex flex-col gap-4">
        {/* Identity: one tile per tab; a tab with no field in this grid shows no empty tile. */}
        <div className="bento-tile hidden grid-cols-1 gap-4 sm:grid-cols-2 has-[>.contents]:grid">
          <TabPane tab="instructions" active={tab}>
<Field label="Name">
            <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />
          </Field>
</TabPane>
          <TabPane tab="instructions" active={tab}>
<Field label="Description">
            <input
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="What this agent does"
              className={inputCls}
            />
          </Field>
</TabPane>
          <TabPane tab="instructions" active={tab}>
<Field
            label="Engine"
            hint={
              isRealtimeModel(form.model)
                ? 'Speech-to-speech: the model listens and speaks directly, so speech recognition, the AI model and the voice below are bypassed. It speaks in the Live version of the voice you pick. Compare "Reply audio reached caller" in the call diagnostics.'
                : undefined
            }
          >
            {isPlatformOwner ? (
              <>
                {/* Owner only: realtime stays admin-only on the server (_ADMIN_ONLY_MODEL_PREFIXES). */}
                <div role="group" aria-label="Engine mode" className="relative grid w-fit grid-cols-2 rounded-2xl border border-border bg-surface-high/60 p-1">
                  <span aria-hidden="true" className="vv-engine-thumb" data-live={String(isRealtimeModel(form.model))} />
                  {(['standard', 'live'] as const).map((mode) => {
                    const active = (mode === 'live') === isRealtimeModel(form.model)
                    return (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          if (active) return
                          if (mode === 'live') {
                            lastStandardModel.current = form.model
                            changeModel(LIVE_MODEL)
                          } else {
                            changeModel(lastStandardModel.current)
                          }
                        }}
                        className={`relative z-10 flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-transparent px-4 py-2 text-xs font-bold transition-colors duration-300 ${
                          active ? (mode === 'live' ? 'text-white' : 'text-surface') : 'text-text-muted hover:text-text'
                        }`}
                      >
                        {mode === 'live' ? (
                          <>
                            <Icon name="bolt" className={`text-[15px] ${active ? 'vv-live-spark' : 'text-magenta'}`} />
                            Live (realtime)
                          </>
                        ) : (
                          'Standard'
                        )}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  {modelLabel(form.model)}
                  {!modelOptionsFor(true).some((m) => m.value === form.model) && form.model ? ' (no longer offered)' : ''}
                  {!isRealtimeModel(form.model) && (
                    <>
                      {' · '}
                      <button type="button" onClick={() => setShowModels((v) => !v)} className="bg-transparent font-medium text-primary hover:underline">
                        {showModels ? 'Hide advanced' : 'Advanced'}
                      </button>
                    </>
                  )}
                </p>
                {showModels && !isRealtimeModel(form.model) && (
                  <select value={form.model} onChange={(e) => changeModel(e.target.value)} className={`${inputCls} mt-2`}>
                    {modelOptionsFor(true)
                      .filter((m) => !isRealtimeModel(m.value))
                      .map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label} - {m.tag}
                        </option>
                      ))}
                    {!modelOptionsFor(true).some((m) => m.value === form.model) && form.model && (
                      <option value={form.model}>{modelLabel(form.model)} - no longer offered, pick a model above</option>
                    )}
                  </select>
                )}
              </>
            ) : (
              // Tenants have one engine (MODEL_OPTIONS), so no picker: just say which.
              <p className="text-sm text-text">
                {modelLabel(form.model || STANDARD_MODEL)}
                {form.model && form.model !== STANDARD_MODEL && (
                  <>
                    <span className="text-text-muted"> (no longer offered) · </span>
                    <button type="button" onClick={() => changeModel(STANDARD_MODEL)} className="bg-transparent text-xs font-medium text-primary hover:underline">
                      Switch to {modelLabel(STANDARD_MODEL)}
                    </button>
                  </>
                )}
              </p>
            )}
            {voiceSwitch && (
              <p role="status" className="mt-2 text-xs text-muted-foreground">
                {voiceSwitch.to ? (
                  <>
                    Voice changed to <span className="font-medium text-foreground">{voiceName(voiceSwitch.to)}</span>:{' '}
                    {modelLabel(form.model).split(' · ')[0]} can’t speak {voiceName(voiceSwitch.from)}.{' '}
                  </>
                ) : (
                  <>
                    None of your voices work with {modelLabel(form.model).split(' · ')[0]}.{' '}
                    <Link to="/dashboard/voices" className="text-primary hover:underline">
                      Add a Live voice
                    </Link>{' '}
                    or{' '}
                  </>
                )}
                <button type="button" onClick={undoVoiceSwitch} className="font-medium text-primary hover:underline">
                  {voiceSwitch.to ? 'Undo' : 'undo'}
                </button>
              </p>
            )}
          </Field>
</TabPane>
          <TabPane tab="voice" active={tab}>
<Field
            label="Voice"
            hint={
              myVoices.length === 0 ? (
                'Loading your voices…'
              ) : (
                <>
                  {isRealtimeModel(form.model) ? `Only the voices ${modelLabel(form.model).split(' · ')[0]} can speak are listed. ` : null}
                  {isRealtimeModel(form.model) && myVoices.length > realtimeVoices.length
                    ? `${myVoices.length - realtimeVoices.length} of your other voices work only with standard models. `
                    : null}
                  Only voices you’ve added appear here.{' '}
                  <Link to="/dashboard/voices" className="text-primary hover:underline">
                    Manage voices →
                  </Link>
                </>
              )
            }
          >
            <div className="flex items-center gap-2">
              <select
                value={form.voice}
                onChange={(e) => {
                  set('voice', e.target.value)
                  setVoiceSwitch(null)
                }}
                className={inputCls}
              >
                {/* Current voice isn't in this account's menu (a legacy voice, or
                    one removed from the menu since it was set) - surface it so the
                    browser doesn't silently show a different option as selected and
                    re-persist the wrong voice on Save. */}
                {isRealtimeModel(form.model) ? (
                  <>
                    {/* Only an agent saved before this check can land here; Save
                        refuses the pair, so say so instead of naming a fallback. */}
                    {!realtimeVoices.some((v) => v.value === form.voice) && (
                      <option value={form.voice}>
                        {voiceName(form.voice)}
                        {voiceWorksWithModel(form.model, form.voice) ? '' : ' (can’t be used on realtime - pick a voice below)'}
                      </option>
                    )}
                    <optgroup label={`Your voices for ${modelLabel(form.model)}`}>
                      {realtimeVoices.length === 0 && (
                        <option value="" disabled>
                          No Live voices added yet - add one on the Voices page
                        </option>
                      )}
                      {realtimeVoices.map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.label}
                        </option>
                      ))}
                    </optgroup>
                  </>
                ) : (
                  <>
                {!myVoices.some((v) => v.value === form.voice) &&
                  !clonedReady && (
                    <option value={form.voice}>
                      {clonedVoiceFallbackName(form.voice, clonedVoices) ??
                        `${catalog.find((v) => v.value === form.voice)?.name ?? voiceLabel(form.voice)} (not in your voices)`}
                    </option>
                  )}
                <ClonedVoiceOptions voices={clonedVoices} />
                {voicePickerGroups(myVoices).map((group) => {
                  if (group.voices.length === 0) return null
                  return (
                    <optgroup key={group.key} label={`${group.label} - ${group.note}`}>
                      {group.voices.map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.name}

                        </option>
                      ))}
                    </optgroup>
                  )
                })}
                  </>
                )}
              </select>
              {(() => {
                // The preview plays the pipeline TTS voice, not the Gemini Live
                // voice a realtime call actually speaks with - so don't offer it.
                if (isRealtimeModel(form.model)) return null
                const cloned = clonedVoices.find((v) => v.voiceValue === form.voice && v.status === 'ready')
                if (cloned) {
                  // In the agent's language when the cloned voice speaks it, else its own.
                  const language = cloned.speaksLanguages?.includes(form.language) ? form.language : ''
                  return <VoicePreviewButton voice={form.voice} lang={language} />
                }
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
          </Field>
</TabPane>
          <TabPane tab="voice" active={tab}>
<Field label="Default language">
            <select value={form.language} onChange={(e) => set('language', e.target.value)} className={inputCls}>
              {LANGUAGES.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
</TabPane>
                    <TabPane tab="voice" active={tab}>
{isRealtimeModel(form.model) ? null : <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted">Voice delivery</span>
            <div role="radiogroup" aria-label="Voice delivery" className="flex flex-wrap gap-1.5">
              {TONES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={form.tone === t.value}
                  onClick={() => set('tone', t.value as AgentForm['tone'])}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${form.tone === t.value ? 'border-text bg-text text-surface' : 'border-border bg-surface text-text-muted hover:text-text'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-snug text-text-muted">{TONES.find((t) => t.value === form.tone)?.description}</p>
          </div>}
</TabPane>
                    <TabPane tab="conversation" active={tab}>
<Field
            label="Caller noise suppression"
            hint="Filters background noise out of the caller's audio before transcription. If callers say they spoke but the transcript is empty, set this to Off."
          >
            <select
              value={form.noiseCancellation ?? ''}
              onChange={(e) => set('noiseCancellation', e.target.value as AgentForm['noiseCancellation'])}
              className={inputCls}
            >
              {NOISE_CANCELLATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="text-[11px] leading-snug text-text-muted">{NOISE_CANCELLATION_OPTIONS.find((o) => o.value === (form.noiseCancellation ?? ''))?.description}</span>
          </Field>
</TabPane>
          <TabPane tab="instructions" active={tab}>
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
</TabPane>
          {/* One control instead of two stacked fields: the sound, its preview button
              and the volume sit on one row, so what you pick and how loud it is are
              read together. Volume stays visible but disabled when the sound is Off, so
              the layout does not jump. */}
          <TabPane tab="voice" active={tab}>
<div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-high/30 p-4 sm:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-muted">Background sound</span>
              <span className="text-[11px] text-text-muted">What the caller hears behind the agent</span>
            </div>
            <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="flex items-center gap-2">
                <select
                  aria-label="Background sound"
                  value={form.ambientNoise}
                  onChange={(e) => set('ambientNoise', e.target.value as AgentForm['ambientNoise'])}
                  className={inputCls}
                >
                  {AMBIENT_NOISE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <AmbiencePreviewButton
                  file={AMBIENT_NOISE_OPTIONS.find((o) => o.value === form.ambientNoise)?.file ?? null}
                  volume={form.ambientVolume}
                />
              </div>
              <label className={`flex items-center gap-3 ${form.ambientNoise === 'off' ? 'opacity-40' : ''}`}>
                <span className="text-xs font-semibold text-text-muted">Volume</span>
                <input
                  type="range"
                  aria-label="Background volume"
                  min={0}
                  max={1}
                  step={0.05}
                  disabled={form.ambientNoise === 'off'}
                  value={form.ambientVolume}
                  onChange={(e) => set('ambientVolume', Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <span className="w-10 text-right text-xs tabular-nums text-text-muted">{Math.round(form.ambientVolume * 100)}%</span>
              </label>
            </div>
            <p className="text-[11px] leading-snug text-text-muted">
              {AMBIENT_NOISE_OPTIONS.find((o) => o.value === form.ambientNoise)?.description ?? ''}
            </p>
          </div>
</TabPane>
        </div>

        {/* Conversation start - the "Who speaks first" select itself now
            lives up in the settings grid (see the comment by "Background
            ambience"), paired with Caller noise suppression instead of
            dangling here alone; this block just holds what it controls. */}
        <TabPane tab="instructions" active={tab}>
<div className="bento-tile grid grid-cols-1 gap-4 sm:grid-cols-2 empty:hidden">
          {form.firstSpeaker === 'agent' && (
            <>
              <Field label="Welcome message — inbound (blank = auto-generated)">
                <VariableInput
                  value={form.welcomeMessage}
                  onChange={(v) => set('welcomeMessage', v)}
                  placeholder="e.g. Hi, thanks for calling Acme - how can I help?"
                  suggestions={variableSuggestions}
                  className={inputCls}
                />
              </Field>
              <Field label="Welcome message — outbound (blank = use the inbound one)">
                <VariableInput
                  value={form.welcomeMessageOutbound ?? ''}
                  onChange={(v) => set('welcomeMessageOutbound', v)}
                  placeholder="e.g. Hi {{first_name}}, Mira from Acme - do you have two minutes?"
                  suggestions={variableSuggestions}
                  className={inputCls}
                />
              </Field>
              {/* agent/main.py: on 3.x realtime the opener is an instruction
                  ("open with this line, or as close to it as reads naturally"). */}
              {isRealtimeModel(form.model) && (
                <p className="text-xs text-text-muted sm:col-span-2">
                  Realtime models say the welcome message in their own words, close to what you wrote, not word for word.
                </p>
              )}
            </>
          )}
        </div>
</TabPane>

        {/* System prompt */}
        <TabPane tab="instructions" active={tab}>
<div className="bento-tile">
<Field label="System prompt (blank = built-in generic assistant prompt)">
          <textarea
            value={form.systemPrompt}
            onChange={(e) => set('systemPrompt', e.target.value)}
            placeholder="Leave empty to use the built-in generic business assistant prompt, or write a custom persona here…"
            className="min-h-[200px] w-full resize-y rounded-xl border border-border bg-surface p-3.5 text-[13px] leading-relaxed outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
          />
          <div className="flex items-center justify-between text-[10px] text-text-muted">
            <span>
              Use <code className="rounded bg-surface-high px-1 py-0.5 text-primary">{'{{variable}}'}</code> for
              dynamic values filled per call.
            </span>
            <span
              className={
                isRealtimeModel(form.model) && promptTokens > 2000
                  ? 'text-destructive'
                  : isRealtimeModel(form.model) && promptTokens > 1000
                    ? 'text-amber-600'
                    : undefined
              }
            >
              ~{promptTokens} tokens
            </span>
          </div>
          {/* Realtime re-sends the whole prompt every turn (measured 19 Oct:
              about ₹0.072 per 1,000 prompt tokens per turn); pipeline models don't. */}
          {isRealtimeModel(form.model) && promptTokens > 1000 && (
            <p className={`mt-1 text-xs ${promptTokens > 2000 ? 'text-destructive' : 'text-amber-600'}`}>
              Realtime re-bills the whole prompt every turn; keep it under ~1,000 tokens.
            </p>
          )}
        </Field>
</div>
</TabPane>

        {isPlatformOwner && (
          <TabPane tab="instructions" active={tab}>
          <label className="bento-tile flex items-start gap-3">
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
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Owner only</span>
            </span>
          </label>
          </TabPane>
        )}

        {/* Collapsible advanced panels */}
        <TabPane tab="tools" active={tab}>
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
            <Toggle
              checked={sendDtmfEnabled}
              onChange={setSendDtmf}
              label="Let the agent press phone keys (DTMF)"
              hint="Useful on outbound calls that may reach a business's automated phone menu before a person - the agent can press digits to navigate it."
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
</TabPane>

        <TabPane tab="tools" active={tab}>
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
          {/* agent/realtime_prompt.py compact(kb_limit=5500): realtime re-bills
              the prompt every turn, so the knowledge base is cut there. */}
          {isRealtimeModel(form.model) && form.kbId && (
            <p className="mt-2 text-xs text-text-muted">
              Realtime models use only the first ~5,500 characters (about 1,500 tokens) of the knowledge base, cut at a
              whole question and answer. Put the most important answers first.
            </p>
          )}
        </Panel>
</TabPane>

        <TabPane tab="tools" active={tab}>
<Panel
          icon="inventory_2"
          title="Live catalog"
          subtitle="Optional products, services, inventory, menus, plans, or listings"
        >
          <div className="flex flex-col gap-3">
            <fieldset disabled={!catalogAccess && !form.liveCatalogEnabled}>
            <Toggle
              checked={form.liveCatalogEnabled}
              onChange={(v) => set('liveCatalogEnabled', v)}
              label="Give this agent access to the live catalog"
              hint="Only this agent receives the workspace catalog. Other agents remain unaffected."
            />
            </fieldset>
            {!catalogAccess && <p className="text-xs text-text-muted">{catalogAccess === null ? 'Checking catalog access…' : <>Live catalog requires Growth or Scale. You can disable a retained assignment without deleting its data. <Link to="/dashboard/billing" className="text-primary underline">Compare plans</Link>.</>}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3">
              <p className="text-xs text-text-muted">
                {catalogCount > 0
                  ? `${catalogCount} catalog item${catalogCount === 1 ? '' : 's'} synced.`
                  : catalogConfigured
                    ? 'The catalog is configured but currently has no synced items.'
                    : 'No live catalog is configured for this workspace.'}
              </p>
              <Link to="/dashboard/knowledge" className="text-xs font-bold text-primary hover:underline">
                Manage catalog →
              </Link>
            </div>
          </div>
        </Panel>
</TabPane>

        <TabPane tab="conversation" active={tab}>
<Panel icon="graphic_eq" title="Speech settings" subtitle="Turn-taking and silence handling">
          <div className="flex flex-col gap-4">
            {/* No interruption-sensitivity control: with vad=None (agent/main.py)
                livekit-agents only reads interruption.min_duration from VAD events,
                so the saved value never changed a call (verified 19 Oct 2026).
                The field stays in the form so a save keeps the stored value. */}
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
</TabPane>

        <TabPane tab="conversation" active={tab}>
<Panel icon="call" title="Call settings" subtitle="Duration limits">
          <NumberField
            label="Max call duration (sec)"
            value={form.maxCallDurationS}
            onChange={(n) => set('maxCallDurationS', Math.round(n))}
            hint="0 = no limit. The call ends automatically after this long."
            inputCls={inputCls}
          />
        </Panel>
</TabPane>

        <TabPane tab="instructions" active={tab}>
<Panel icon="data_object" title="Variables" subtitle="Custom {{variable}} names this agent can use, with a fallback value">
          <VariablesEditor
            value={form.variables}
            onChange={(v) => set('variables', v)}
            inputCls={inputCls}
          />
        </Panel>
</TabPane>

        <TabPane tab="after" active={tab}>
<Panel icon="fact_check" title="Post-call data extraction" subtitle="Pull structured fields from each transcript">
          <PostCallFieldsEditor
            value={form.postCallFields}
            onChange={(v) => set('postCallFields', v)}
            inputCls={inputCls}
          />
        </Panel>
</TabPane>

        <TabPane tab="after" active={tab}>
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
</TabPane>

        <TabPane tab="after" active={tab}>
<Panel icon="hub" title="CRM routing" subtitle="Which connected integrations this agent delivers leads to">
          {connectedIntegrations.length === 0 ? (
            <p className="text-xs text-text-muted">
              No connected integrations yet.{' '}
              <Link to="/dashboard/integrations" className="text-primary hover:underline">
                Connect one
              </Link>{' '}
              to route leads from this agent.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] text-text-muted">
                None selected = deliver to every connected integration (default). Select specific ones to
                limit this agent to only those.
              </p>
              {connectedIntegrations.map((integ) => {
                const checked = form.crmIntegrationKeys.includes(integ.key)
                return (
                  <label key={integ.key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        set(
                          'crmIntegrationKeys',
                          e.target.checked
                            ? [...form.crmIntegrationKeys, integ.key]
                            : form.crmIntegrationKeys.filter((k) => k !== integ.key)
                        )
                      }
                      className="accent-primary"
                    />
                    {integ.name}
                  </label>
                )
              })}
            </div>
          )}
        </Panel>
</TabPane>

        <TabPane tab="tools" active={tab}>
<Panel icon="event_repeat" title="Follow-ups" subtitle="Retries by reason, and the calls scheduled after a conversation">
          <FollowUpEditor
            value={form.followUpPolicy ?? FOLLOW_UP_DEFAULTS}
            onChange={(v) => set('followUpPolicy', v)}
            inputCls={inputCls}
          />
        </Panel>
</TabPane>

        <TabPane tab="after" active={tab}>
<Panel icon="psychology" title="Memory" subtitle="Recognize returning callers">
          <Toggle
            checked={form.memoryEnabled}
            onChange={(v) => set('memoryEnabled', v)}
            label="Remember returning callers"
            hint="The agent recalls past conversations with the same caller (matched by phone). Phone and widget calls only - not the anonymous web demo."
          />
        </Panel>
</TabPane>
      </div>
      </div>
      <TryPanel
        name={form.name}
        dirty={dirty}
        saving={saving}
        model={form.model}
        voice={form.voice}
        voiceName={voiceName(form.voice)}
        language={form.language}
        steps={steps}
        onTalk={() => void talk()}
        onStep={goToStep}
      />
      </div>

      <div className="vv-action-bar sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-bg/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <p className="flex min-w-0 items-center gap-2 text-xs font-semibold" role="status">
          {saveError ? (
            <span className="text-destructive">{saveError}</span>
          ) : saved ? (
            <span className="flex items-center gap-1 text-success"><Icon name="check_circle" className="text-[15px]" />Changes saved</span>
          ) : dirty ? (
            <span className="flex items-center gap-2 text-amber"><span className="h-2 w-2 rounded-full bg-amber" />Unsaved changes</span>
          ) : (
            <span className="text-text-muted">All changes saved</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {dirty && (
            <button type="button" onClick={discard} disabled={saving} className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-bold hover:border-primary disabled:opacity-50">
              Discard
            </button>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty}
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

type SetupStep = {
  key: 'persona' | 'voice' | 'knowledge' | 'channel' | 'live'
  label: string
  /** Two or three words for the hero ("Attach knowledge"). */
  action: string
  hint: string
  done: boolean
  tab?: AgentTab
  to?: string
}

/** Setup ring for the purple hero: white on the gradient. */
function HeroRing({ done, total }: { done: number; total: number }) {
  const c = 2 * Math.PI * 24
  return (
    <svg viewBox="0 0 60 60" className="h-[60px] w-[60px] shrink-0" role="img" aria-label={`Setup ${done} of ${total}`}>
      <circle cx="30" cy="30" r="24" fill="none" stroke="rgb(255 255 255 / 0.22)" strokeWidth="6" />
      <circle
        cx="30" cy="30" r="24" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${((done / total) * c).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 30 30)" className="bento-ring"
      />
      <text x="30" y="34" textAnchor="middle" fill="#fff" className="font-display text-[13px] font-extrabold">{done}/{total}</text>
    </svg>
  )
}

/** A: who this agent is, whether it is on, how far setup is, and what to do next.
 * Three zones: identity (left), setup progress (middle), actions (right), each
 * vertically centred; on phones they stack. */
function AgentHero({ agent, name, description, model, voice, language, live, statusBusy, steps, nextStep, onToggleLive, onStep, onTalk, onDelete }: {
  agent: AgentConfig; name: string; description: string; model: string; voice: ReactNode; language: string
  live: boolean; statusBusy: boolean; steps: SetupStep[]; nextStep: SetupStep | null
  onToggleLive: () => void; onStep: (step: SetupStep) => void; onTalk: () => void; onDelete: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const done = steps.filter((s) => s.done).length
  const publicId = agent.publicId || String(agent.id)
  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(publicId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      alert('Could not copy the agent ID. Check clipboard permission and try again.')
    }
  }
  const glass = 'h-10 rounded-xl bg-white/12 ring-1 ring-white/25 transition-colors hover:bg-white/20'
  return (
    <section className="bento-tile bento-hero grid grid-cols-1 items-center gap-5 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 font-display text-lg font-extrabold ring-1 ring-white/30">
          {(name || 'A').slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="bento-title truncate text-xl">{name || 'Untitled agent'}</p>
          <p className="truncate text-sm text-white/75">{description || 'No description yet'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              role="switch"
              aria-checked={live}
              disabled={statusBusy}
              onClick={onToggleLive}
              className="inline-flex items-center gap-2 rounded-full bg-white/15 py-1 pl-1 pr-3 font-bold ring-1 ring-white/30 disabled:opacity-60"
            >
              <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${live ? 'bg-success' : 'bg-white/25'}`}>
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${live ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </span>
              {live ? 'Live' : 'Paused'}
            </button>
            <span className="rounded-full bg-white/15 px-2.5 py-1 font-bold ring-1 ring-white/30">{isRealtimeModel(model) ? 'Vistrow Live' : modelLabel(model).split(' · ')[0]}</span>
            <span className="truncate text-white/80">{voice} · {language}</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => (nextStep ? onStep(nextStep) : undefined)}
        disabled={!nextStep}
        className="flex items-center gap-3 rounded-2xl bg-white/10 p-2 pr-4 text-left ring-1 ring-white/20 transition-colors hover:bg-white/15 disabled:cursor-default disabled:hover:bg-white/10"
      >
        <HeroRing done={done} total={steps.length} />
        <span className="min-w-0">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-white/70">Setup {done} of {steps.length}</span>
          <span className="flex items-center gap-1.5 text-sm font-bold">
            {nextStep ? <>Next: {nextStep.action}<Icon name="arrow_forward" className="text-[16px]" /></> : <><Icon name="check_circle" className="text-[16px]" />Ready for calls</>}
          </span>
        </span>
      </button>

      <div className="flex items-center gap-2 lg:justify-end">
        {/* Below xl the Try panel is hidden, so the hero carries the test button. */}
        <button type="button" onClick={onTalk} className={`${glass} flex items-center gap-1.5 px-3.5 text-xs font-bold xl:hidden`}>
          <Icon name="mic" className="text-[16px]" /> Talk
        </button>
        <button type="button" onClick={() => void copyId()} title="Copy agent ID" aria-label={copied ? 'Agent ID copied' : `Copy agent ID ${publicId}`} className={`${glass} flex items-center gap-2 px-3.5 text-xs`}>
          <span className="font-semibold text-white/70">ID</span>
          <code className="font-mono font-semibold tracking-wide">{publicId}</code>
          <Icon name={copied ? 'check' : 'content_copy'} className="text-[15px]" />
        </button>
        <div className="relative">
          <button type="button" aria-label="More actions" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)} className={`${glass} flex w-10 items-center justify-center`}>
            <Icon name="more_horiz" className="text-[18px]" />
          </button>
          {menuOpen && (
            <div role="menu" className="bento-reveal absolute right-0 top-12 z-20 w-44 rounded-xl border border-border bg-surface p-1 text-text shadow-xl">
              <Link role="menuitem" to="/dashboard/testing" className="flex items-center gap-2 rounded-lg bg-transparent px-3 py-2 text-xs font-semibold hover:bg-surface-high">
                <Icon name="science" className="text-[16px]" /> Testing Lab
              </Link>
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onDelete() }} className="flex w-full items-center gap-2 rounded-lg bg-transparent px-3 py-2 text-left text-xs font-semibold text-destructive hover:bg-destructive/10">
                <Icon name="delete" className="text-[16px]" /> Delete agent
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/** C: first-time guide. Skip (or finishing) hides it for this user for good. */
function SetupGuide({ steps, onStep, onClose }: { steps: SetupStep[]; onStep: (step: SetupStep) => void; onClose: () => void }) {
  const current = steps.find((s) => !s.done)
  return (
    <section aria-label="Set up your agent" className="bento-tile bento-reveal">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="bento-title text-[15px]">{current ? 'Set up your agent in 5 steps' : 'Your agent is ready'}</p>
          <p className="text-xs text-text-muted">{current ? `Next: ${current.hint}.` : 'Everything is set. Test it once, then share your number or website.'}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg bg-transparent px-2 py-1 text-xs font-bold text-text-muted hover:text-text">
          {current ? 'Skip guide' : 'Done'}
        </button>
      </div>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        {steps.map((step, i) => {
          const isCurrent = step === current
          return (
            <li key={step.key}>
              <button
                type="button"
                onClick={() => onStep(step)}
                className={`flex h-full w-full items-start gap-2 rounded-2xl border p-3 text-left transition-colors ${
                  isCurrent ? 'border-primary bg-primary/8' : step.done ? 'border-success/30 bg-success/5' : 'border-border bg-surface hover:border-primary/50'
                }`}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${step.done ? 'bg-success text-bg' : isCurrent ? 'bg-primary text-bg' : 'bg-surface-high text-text-muted'}`}>
                  {step.done ? <Icon name="check" className="text-[14px]" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold">{step.label}</span>
                  <span className="block text-[11px] leading-snug text-text-muted">{step.hint}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** B: the panel beside the editor on wide screens: talk to the agent, hear it, see setup.
 * Its cards use the same header as the editor's tiles (Panel) and keep one height
 * whatever the state, so nothing jumps while you edit. */
function SideCardHeader({ icon, title, subtitle }: { icon: string; title: ReactNode; subtitle: string }) {
  return (
    <div className="mb-4 flex min-w-0 items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon name={icon} className="text-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="bento-title block truncate text-[15px]">{title}</span>
        <span className="block truncate text-xs text-text-muted">{subtitle}</span>
      </span>
    </div>
  )
}

function TryPanel({ name, dirty, saving, model, voice, voiceName, language, steps, onTalk, onStep }: {
  name: string; dirty: boolean; saving: boolean; model: string; voice: string; voiceName: ReactNode; language: string
  steps: SetupStep[]; onTalk: () => void; onStep: (step: SetupStep) => void
}) {
  const realtime = isRealtimeModel(model)
  const canPreview = !realtime && Boolean(voice) && !voice.startsWith('custom:')
  return (
    <aside className="sticky top-4 hidden flex-col gap-4 xl:flex">
      <section className="bento-tile">
        <SideCardHeader icon="mic" title={`Try ${name || 'your agent'}`} subtitle="A browser call with your microphone" />
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onTalk}
            disabled={saving}
            aria-label={dirty ? `Save and talk to ${name}` : `Talk to ${name}`}
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7c3aed] to-[#c026d3] text-white shadow-[0_12px_32px_-12px_rgb(168_85_247/0.8)] transition-transform hover:scale-105 disabled:opacity-60"
          >
            <Icon name="mic" className="text-[28px]" />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-bold">{saving ? 'Saving…' : dirty ? 'Save & talk' : 'Talk now'}</p>
            {/* Always two lines tall, so the card keeps its height when the text changes. */}
            <p className="line-clamp-2 min-h-[2rem] text-xs leading-4 text-text-muted">
              {dirty ? 'Your unsaved changes are saved first.' : 'Uses the saved agent.'}
            </p>
          </div>
        </div>
        <div className="mt-4 flex h-14 items-center justify-between gap-2 rounded-xl border border-border bg-surface-high/30 px-3">
          <span className="min-w-0">
            <span className="block text-[11px] text-text-muted">{realtime ? 'Live voice' : 'Voice'}</span>
            <span className="block truncate text-xs font-bold">{voiceName}</span>
          </span>
          {/* The preview plays the standard voice; a realtime call speaks the Live version,
              so the button stays in place but disabled there. */}
          {canPreview ? (
            <VoicePreviewButton voice={voice} lang={(language || 'hi').startsWith('en') ? 'en' : 'hi'} />
          ) : (
            <span title="Preview plays standard voices only" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-high text-text-muted opacity-50">
              <Icon name="play_arrow" className="text-[18px]" />
            </span>
          )}
        </div>
      </section>
      <section className="bento-tile">
        <SideCardHeader
          icon="rocket_launch"
          title={`Setup ${steps.filter((s) => s.done).length}/${steps.length}`}
          subtitle={steps.every((s) => s.done) ? 'Ready for calls' : 'What is left before going live'}
        />
        <ul className="flex flex-col gap-1">
          {steps.map((step) => (
            <li key={step.key}>
              <button type="button" onClick={() => onStep(step)} className="flex w-full items-center gap-2.5 rounded-xl bg-transparent px-2 py-2 text-left text-sm hover:bg-surface-high">
                <Icon name={step.done ? 'check_circle' : 'radio_button_unchecked'} className={`text-[18px] ${step.done ? 'text-success' : 'text-text-muted'}`} />
                <span className={step.done ? 'text-text-muted' : 'font-semibold'}>{step.label}</span>
                {!step.done && <Icon name="arrow_forward" className="ml-auto text-[16px] text-text-muted" />}
              </button>
            </li>
          ))}
        </ul>
        <Link to="/dashboard/testing" className="mt-3 flex items-center gap-1.5 border-t border-border bg-transparent pt-3 text-xs font-bold text-primary hover:underline">
          <Icon name="science" className="text-[15px]" /> Run a scenario in Testing Lab
        </Link>
      </section>
    </aside>
  )
}

type AgentTab = 'instructions' | 'voice' | 'tools' | 'conversation' | 'after'

const AGENT_TABS: { id: AgentTab; label: string }[] = [
  { id: 'instructions', label: 'Instructions' },
  { id: 'voice', label: 'Voice & language' },
  { id: 'tools', label: 'Knowledge & tools' },
  { id: 'conversation', label: 'Conversation' },
  { id: 'after', label: 'After the call' },
]

/** One section of the editor. Every section stays mounted and only the active one is shown,
 * so a half-edited field on another tab is never lost and Save always saves the whole agent.
 * `contents` keeps a field a direct child of its grid. */
function TabPane({ tab, active, children }: { tab: AgentTab; active: AgentTab; children: ReactNode }) {
  return <div className={active === tab ? 'contents' : 'hidden'}>{children}</div>
}

function AgentTabBar({ tab, onChange }: { tab: AgentTab; onChange: (next: AgentTab) => void }) {
  // One dark pill that slides to the selected tab (measured, so it fits each label).
  const listRef = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null)
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const measure = () => {
      const active = list.querySelector<HTMLElement>('[aria-selected="true"]')
      if (active) setPill({ x: active.offsetLeft, w: active.offsetWidth })
    }
    measure()
    list.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [tab])
  return (
    <div ref={listRef} role="tablist" aria-label="Agent settings" className="relative flex w-full min-w-0 gap-1 overflow-x-auto rounded-2xl border border-border bg-surface p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {pill && <span aria-hidden="true" className="vv-slide-pill shadow-sm" style={{ width: pill.w, transform: `translateX(${pill.x}px)` }} />}
      {AGENT_TABS.map((item) => (
        <button
          key={item.id}
          role="tab"
          aria-selected={tab === item.id}
          onClick={() => onChange(item.id)}
          className={`relative z-10 shrink-0 whitespace-nowrap rounded-xl bg-transparent px-4 py-2 text-sm font-semibold transition-colors duration-300 ${
            tab === item.id ? 'text-surface' : 'text-text-muted hover:text-text'
          }`}
        >
          {item.label}
        </button>
      ))}
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
  return (
    <section className="bento-tile">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon name={icon} className="text-[18px]" />
        </span>
        <span className="min-w-0">
          <span className="bento-title block text-[15px]">{title}</span>
          {subtitle && <span className="block text-xs text-text-muted">{subtitle}</span>}
        </span>
      </div>
      {children}
    </section>
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
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl px-1 py-1">
      <span className="text-xs leading-relaxed">
        <span className="font-bold text-text">{label}</span>
        {hint && <span className="mt-0.5 block text-text-muted">{hint}</span>}
      </span>
      {/* A real checkbox (keyboard and screen readers), drawn as a switch. */}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden="true" className="relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-surface-high transition-colors peer-checked:bg-success peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20 [&>span]:translate-x-[3px] peer-checked:[&>span]:translate-x-[19px]">
        <span className="inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform" />
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
            <span className="text-xs font-semibold text-text-muted">
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
      <span className="text-xs font-semibold text-text-muted">Parameters</span>
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

export function PostCallFieldsEditor({
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
        <div key={i} className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap">
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
            className={`${inputCls} min-w-[10rem] flex-1`}
          />
          <button onClick={() => onChange(value.filter((_, idx) => idx !== i))} aria-label="Remove field" className="text-text-muted hover:text-destructive">
            <Icon name="close" className="text-[14px]" />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...value, { key: '', type: 'string', description: '' }])}
        className="self-start rounded-lg border border-dashed border-border bg-transparent px-3 py-1.5 text-xs font-bold text-text-muted hover:border-primary hover:text-text"
      >
        + Add field
      </button>
    </div>
  )
}

// Ranges match server/retry_rules.py follow_up_policy, which clamps on save.
const FOLLOW_UP_MAX_ATTEMPTS = 10
const FOLLOW_UP_MAX_GAP_MINUTES = 7 * 24 * 60
const FOLLOW_UP_MAX_NURTURE_DAYS = 30

function FollowUpEditor({
  value,
  onChange,
  inputCls,
}: {
  value: FollowUpPolicy
  onChange: (v: FollowUpPolicy) => void
  inputCls: string
}) {
  const patch = (p: Partial<FollowUpPolicy>) => onChange({ ...value, ...p })
  const bounded = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n) || min))
  const minutes = (key: 'busyMinutes' | 'switchedOffMinutes' | 'noAnswerMinutes' | 'voicemailMinutes', label: string) => (
    <NumberField
      label={label}
      value={value[key]}
      onChange={(n) => patch({ [key]: bounded(n, 1, FOLLOW_UP_MAX_GAP_MINUTES) })}
      inputCls={inputCls}
    />
  )
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] text-text-muted">
        Applies to leads this agent calls automatically (ArthaLeads auto-calls and the follow-up calls below).
        Bulk campaigns keep the retry settings from their own wizard.
      </p>
      <Field label="Call a new lead">
        <select
          value={value.firstCallDelaySeconds ?? 0}
          onChange={(e) => patch({ firstCallDelaySeconds: Number(e.target.value) })}
          className={`${inputCls} sm:w-60`}
        >
          {FIRST_CALL_DELAY_CHOICES.map((c) => (
            <option key={c.seconds} value={c.seconds}>{c.label}</option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-text-muted">
          Time between a lead arriving and the first automatic call. "Call now" from your CRM always dials at once,
          and calls still wait for your calling hours.
        </p>
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <NumberField
          label="Max tries per lead"
          value={value.maxAttempts}
          onChange={(n) => patch({ maxAttempts: bounded(n, 1, FOLLOW_UP_MAX_ATTEMPTS) })}
          hint="1-10, counting every dial. After the last one the lead is reported as not reachable."
          inputCls={inputCls}
        />
        {minutes('busyMinutes', 'Retry after busy (min)')}
        {minutes('switchedOffMinutes', 'Retry after switched off (min)')}
        {minutes('noAnswerMinutes', 'Retry after no answer (min)')}
        {minutes('voicemailMinutes', 'Retry after voicemail (min)')}
      </div>
      <Toggle
        checked={value.callbackEnabled}
        onChange={(v) => patch({ callbackEnabled: v })}
        label="Call back at the time the caller asked for"
        hint="When a caller asks to be rung back on a day or time, that call is placed then (inside your calling window)."
      />
      <div className="flex flex-col gap-2">
        <Toggle
          checked={value.visitReminderEnabled}
          onChange={(v) => patch({ visitReminderEnabled: v })}
          label="Site-visit reminder call"
          hint="A short confirm-or-reschedule call the day before a booked visit; 2 hours before when the visit is less than a day away."
        />
        {value.visitReminderEnabled && (
          <Field label="Reminder time (day before)">
            <input
              type="time"
              value={value.visitReminderTime}
              onChange={(e) => patch({ visitReminderTime: e.target.value || FOLLOW_UP_DEFAULTS.visitReminderTime })}
              className={`${inputCls} sm:w-40`}
            />
          </Field>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Toggle
          checked={value.nurtureEnabled}
          onChange={(v) => patch({ nurtureEnabled: v })}
          label="Nurture call for interested leads"
          hint="One follow-up call at 11:00 when a call ended interested with no visit booked and no call-back asked for."
        />
        {value.nurtureEnabled && (
          <div className="sm:w-40">
            <NumberField
              label="Days after the call"
              value={value.nurtureDays}
              onChange={(n) => patch({ nurtureDays: bounded(n, 1, FOLLOW_UP_MAX_NURTURE_DAYS) })}
              inputCls={inputCls}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function VariablesEditor({
  value,
  onChange,
  inputCls,
}: {
  value: AgentVariable[]
  onChange: (v: AgentVariable[]) => void
  inputCls: string
}) {
  const update = (i: number, patch: Partial<AgentVariable>) =>
    onChange(value.map((v, idx) => (idx === i ? { ...v, ...patch } : v)))
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-text-muted">
        Define a {'{{variable}}'} the prompt or welcome message can use. The default value is only spoken when a
        real call has nothing for that name - a genuine CRM/CSV value always wins.
      </p>
      {value.map((v, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={v.name}
            onChange={(e) => update(i, { name: e.target.value.replace(/[^a-zA-Z0-9_.]/g, '_') })}
            placeholder="variable_name"
            className={`${inputCls} w-40 font-mono text-xs`}
          />
          <input
            value={v.defaultValue}
            onChange={(e) => update(i, { defaultValue: e.target.value })}
            placeholder="Default value, e.g. 3BHK"
            className={`${inputCls} flex-1`}
          />
          <button
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            aria-label="Remove variable"
            className="text-text-muted hover:text-destructive"
          >
            <Icon name="close" className="text-[14px]" />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...value, { name: '', defaultValue: '' }])}
        className="self-start rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-bold text-text-muted hover:border-primary hover:text-text"
      >
        + Add variable
      </button>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  /** Explanatory text (or a small chunk of markup, e.g. a "Manage voices"
   * link) moved out of an inline paragraph and into a hover tooltip on a
   * small info icon - a block of prose under one field pushed that field's
   * whole row taller than its neighbor in the two-column grid, so sibling
   * rows on the other side drifted out of alignment with it. */
  hint?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1 text-xs font-semibold text-text-muted">
        {label}
        {hint && <InfoTip label={`More info about ${label}`}>{hint}</InfoTip>}
      </span>
      {children}
    </label>
  )
}
