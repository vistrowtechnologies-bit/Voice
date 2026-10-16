import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ClonedVoiceOptions, clonedVoiceFallbackName, useClonedVoices } from '../components/ClonedVoiceOptions'
import { SuccessCheck } from '../components/CopilotParts'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { UpgradeRequiredModal } from '../components/UpgradeRequiredModal'
import { useAuth } from '../lib/auth'
import { createAgent, draftAgent, draftGreetingAudio, fetchMyVoices, updateAgent } from '../lib/api'
import { LANGUAGES, modelLabel, modelOptionsFor, TONES, voiceLabel, voicePickerGroups } from '../lib/agentOptions'
import type { AgentDraft, AgentDraftQuestion, AgentDraftSection, VoiceEntry } from '../lib/types'
import { PostCallFieldsEditor } from './AgentDetail'

const EXAMPLES: { label: string; emoji: string; sub: string; text: string }[] = [
  {
    label: 'Real estate · Pune',
    emoji: '🏠',
    sub: 'Enquiries & site visits',
    text: "We're a real estate developer in Pune selling 2 and 3 BHK flats in Baner. The agent should answer enquiry calls in Hindi and English, ask about budget, BHK and purchase timeline, and book site visits.",
  },
  {
    label: 'Clinic receptionist',
    emoji: '🦷',
    sub: 'Timings & appointments',
    text: "We run a dental clinic open 10am to 8pm, Monday to Saturday. The agent should answer patient calls, tell them our timings and treatments, and book appointments with the doctor.",
  },
  {
    label: 'D2C order support',
    emoji: '📦',
    sub: 'Orders, returns, refunds',
    text: "We're a D2C skincare brand. The agent should take customer calls in Hindi and English about order status, returns and refunds, collect the order number, and pass anything it can't solve to our support team.",
  },
  {
    label: 'Education counsellor',
    emoji: '🎓',
    sub: 'Call back form leads',
    text: "We're a JEE and NEET coaching institute. The agent should call back students who filled our enquiry form, understand their class, target exam and preferred batch, and book a counselling session.",
  },
  {
    label: 'Insurance renewals',
    emoji: '🛡️',
    sub: 'Outbound reminders',
    text: "We're an insurance agency. The agent should make outbound calls to customers whose motor insurance renews in the next 15 days, remind them of the due date, answer basic questions and set up a callback with an advisor.",
  },
]

const BUILD_STEPS = ['Understanding your business', 'Writing the instructions', 'Choosing a voice', 'Setting up after-call fields']
const STEP_NAMES = ['Describe', 'Questions', 'Review', 'Create']

// Same optional built-ins and "" = all-on convention as AgentDetail.tsx.
const OPTIONAL_FUNCTIONS: { name: string; label: string }[] = [
  { name: 'end_call', label: 'Let the agent end the call' },
  { name: 'transfer_call', label: 'Transfer to a human (needs a transfer number on the agent page)' },
  { name: 'web_search', label: 'Let the agent search the web' },
  { name: 'send_dtmf', label: 'Let the agent press phone keys (DTMF)' },
]

const inputCls = 'w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none transition-colors focus:border-primary'
const primaryBtn =
  'flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-dark px-5 py-3 text-sm font-bold text-white shadow-lg shadow-primary/30 transition hover:-translate-y-px hover:shadow-xl hover:shadow-primary/40 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none'
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

type Step = 'describe' | 'questions' | 'review'

export function AgentBuilder() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [step, setStep] = useState<Step>('describe')
  const [description, setDescription] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [website, setWebsite] = useState('')
  const [questions, setQuestions] = useState<AgentDraftQuestion[]>([])
  // null until the follow-up questions were answered (or skipped); after
  // that the server always drafts instead of asking again.
  const [answers, setAnswers] = useState<Record<string, string> | null>(null)
  const [draft, setDraft] = useState<AgentDraft | null>(null)
  const [busy, setBusy] = useState<null | 'draft' | 'create' | AgentDraftSection>(null)
  const [createdId, setCreatedId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null)
  const [myVoices, setMyVoices] = useState<VoiceEntry[]>([])
  const clonedVoices = useClonedVoices()
  useEffect(() => {
    fetchMyVoices().then(setMyVoices).catch(() => setMyVoices([]))
  }, [])

  const base = () => ({
    description: description.trim(),
    businessName: businessName.trim() || undefined,
    website: website.trim() || undefined,
  })

  const requestDraft = async (withAnswers: Record<string, string> | null) => {
    setBusy('draft')
    setError(null)
    try {
      const result = await draftAgent({ ...base(), answers: withAnswers ?? undefined })
      if (result.draft) {
        setDraft(result.draft)
        setStep('review')
      } else if (result.questions?.length) {
        setQuestions(result.questions)
        setAnswers({})
        setStep('questions')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not draft the agent. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const regenerate = async (section: AgentDraftSection) => {
    if (!draft) return
    setBusy(section)
    setError(null)
    try {
      const result = await draftAgent({ ...base(), answers: answers ?? {}, section, current: draft })
      if (result.draft) setDraft(result.draft)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not regenerate this section. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  // Same routes as Start from scratch and the agent page's Save, so every
  // server guard (plan limit, voice tier, model) runs on what is saved.
  const create = async () => {
    if (!draft) return
    setBusy('create')
    setError(null)
    let agentId: number | null = null
    try {
      agentId = (await createAgent(draft)).id
      await updateAgent(agentId, draft)
      setCreatedId(agentId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create the agent. Please try again.'
      if (msg.toLowerCase().includes('upgrade') && agentId === null) setUpgradeMessage(msg)
      else if (agentId !== null) setError(`The agent was created, but some settings did not save: ${msg} Open it from Agents to finish.`)
      else setError(msg)
      setBusy(null)
    }
  }

  const set = <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d))

  const stepIndex = createdId !== null ? 3 : step === 'describe' ? 0 : step === 'questions' ? 1 : 2
  const canDraft = description.trim().length >= 10

  return (
    <DashboardLayout>
      <PageHeader title="Build with AI" subtitle="Describe your business and we'll set up the agent. Nothing is saved until you create it.">
        <Link
          to="/dashboard/agents"
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-bold text-text-muted hover:border-primary hover:text-text"
        >
          <Icon name="arrow_back" className="text-[15px]" />
          Back to agents
        </Link>
      </PageHeader>
      <section className={`mx-auto flex w-full flex-col gap-5 p-4 sm:p-6 ${step === 'review' ? 'max-w-6xl' : 'max-w-3xl'}`}>
        <StepBar current={stepIndex} skippedQuestions={step === 'review' && questions.length === 0} />

        {busy === 'draft' ? (
          <BuildingChecklist />
        ) : step === 'describe' ? (
          <div className="help-msg-in relative overflow-hidden rounded-2xl border border-primary/20 bg-surface p-5 shadow-sm sm:p-8">
            <div aria-hidden="true" className="pointer-events-none absolute -top-28 left-1/2 h-64 w-[40rem] max-w-[140%] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
            <div className="relative flex flex-col gap-5">
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-white shadow-lg shadow-primary/30">
                  <Icon name="auto_awesome" className="text-[22px]" />
                </span>
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Describe your business. We'll build the agent.</h2>
                <p className="max-w-lg text-sm text-text-muted">
                  Who calls you (or who you call), what they ask, which languages they speak, and what the agent should collect or book.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canDraft) requestDraft(answers)
                  }}
                  rows={6}
                  maxLength={4000}
                  aria-label="Describe your business and what the agent should do"
                  placeholder="e.g. We're a dental clinic in Indore, open 10am to 8pm. The agent should answer patient calls in Hindi, share our timings and book appointments."
                  className="w-full resize-y rounded-xl border border-border bg-bg/60 px-4 py-3 text-[15px] leading-relaxed shadow-inner outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
                <div className="flex justify-between px-1 text-[11px] text-text-muted">
                  <span className="invisible sm:visible">{isMac ? '⌘' : 'Ctrl'} + Enter to draft</span>
                  <span>{description.length}/4000</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Or start from an example</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {EXAMPLES.map((example) => {
                    const chosen = description === example.text
                    return (
                      <button
                        key={example.label}
                        type="button"
                        onClick={() => setDescription(example.text)}
                        aria-pressed={chosen}
                        className={`group flex items-start gap-2.5 rounded-xl border p-3 text-left transition hover:-translate-y-px hover:border-primary/60 hover:shadow-md hover:shadow-primary/10 ${chosen ? 'border-primary bg-primary/10' : 'border-border bg-surface'}`}
                      >
                        <span className="text-xl leading-none" aria-hidden="true">{example.emoji}</span>
                        <span className="flex min-w-0 flex-col">
                          <span className="text-xs font-bold text-text">{example.label}</span>
                          <span className="text-[11px] text-text-muted">{example.sub}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Business name (optional)">
                  <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={120} className={inputCls} />
                </Field>
                <Field label="Website (optional)">
                  <input value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={200} placeholder="https://" className={inputCls} />
                </Field>
              </div>
              <button type="button" disabled={!canDraft} onClick={() => requestDraft(answers)} className={`${primaryBtn} w-full sm:w-auto sm:self-center sm:px-8`}>
                <Icon name="auto_awesome" className="text-[18px]" />
                Draft my agent
              </button>
            </div>
          </div>
        ) : step === 'questions' ? (
          <div className="help-msg-in flex flex-col gap-4 rounded-2xl border border-primary/20 bg-surface p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-1">
              <p className="flex items-center gap-2 text-base font-bold">
                <Icon name="auto_awesome" className="text-[20px] text-primary" />
                A few quick questions
              </p>
              <p className="text-sm text-text-muted">So the agent fits your business. Tap an answer or type your own.</p>
            </div>
            {questions.map((q, i) => (
              <div key={q.id} className="help-step-in flex gap-3 rounded-xl border border-border bg-surface-high/30 p-4" style={{ animationDelay: `${i * 90}ms` }}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{i + 1}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  <p className="text-sm font-semibold">{q.question}</p>
                  <div className="flex flex-wrap gap-2">
                    {q.options.map((option) => {
                      const chosen = answers?.[q.id] === option
                      return (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={chosen}
                          onClick={() => setAnswers((a) => ({ ...(a ?? {}), [q.id]: option }))}
                          className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${chosen ? 'border-primary bg-primary text-white shadow-md shadow-primary/25' : 'border-border bg-surface text-text-muted hover:border-primary hover:text-text'}`}
                        >
                          {chosen && <Icon name="check" className="text-[14px]" />}
                          {option}
                        </button>
                      )
                    })}
                  </div>
                  <input
                    value={answers?.[q.id] && !q.options.includes(answers[q.id]) ? answers[q.id] : ''}
                    onChange={(e) => setAnswers((a) => ({ ...(a ?? {}), [q.id]: e.target.value }))}
                    maxLength={300}
                    placeholder="Or type your own answer"
                    className={inputCls}
                  />
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => requestDraft(answers ?? {})} className={primaryBtn}>
                <Icon name="auto_awesome" className="text-[18px]" />
                Draft my agent
              </button>
              <button
                type="button"
                onClick={() => { setStep('describe'); setAnswers(null) }}
                className="rounded-lg bg-transparent px-3 py-2.5 text-sm font-semibold text-text-muted hover:text-text"
              >
                Back
              </button>
            </div>
          </div>
        ) : draft ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex min-w-0 flex-col gap-4">
              <div className="help-msg-in flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm">
                <SuccessCheck />
                <span>Your agent is drafted. Edit anything, or regenerate a section. Nothing is saved until you click <b>Create agent</b>.</span>
              </div>

              <Section title="Basics" icon="badge" busy={busy === 'basics'} disabled={busy !== null} onRegenerate={() => regenerate('basics')}>
                <Field label="Agent name">
                  <input value={draft.name} onChange={(e) => set('name', e.target.value)} maxLength={60} className={inputCls} />
                </Field>
                <Field label="Business name">
                  <input value={draft.businessName} onChange={(e) => set('businessName', e.target.value)} maxLength={120} className={inputCls} />
                </Field>
                <Field label="Description" wide>
                  <input value={draft.description} onChange={(e) => set('description', e.target.value)} maxLength={200} className={inputCls} />
                </Field>
                <Field label="Model" wide>
                  <select value={draft.model} onChange={(e) => set('model', e.target.value)} className={inputCls}>
                    {modelOptionsFor(user?.isPlatformOwner ?? false).map((m) => (
                      <option key={m.value} value={m.value}>{m.label} - {m.tag}</option>
                    ))}
                    {!modelOptionsFor(user?.isPlatformOwner ?? false).some((m) => m.value === draft.model) && (
                      <option value={draft.model}>{modelLabel(draft.model)}</option>
                    )}
                  </select>
                </Field>
              </Section>

              <Section title="Voice & language" icon="record_voice_over" busy={busy === 'voice'} disabled={busy !== null} onRegenerate={() => regenerate('voice')}>
                <Field label="Voice">
                  <select value={draft.voice} onChange={(e) => set('voice', e.target.value)} className={inputCls}>
                    {!myVoices.some((v) => v.value === draft.voice) &&
                      !clonedVoices.some((v) => v.voiceValue === draft.voice && v.status === 'ready') && (
                        <option value={draft.voice}>{clonedVoiceFallbackName(draft.voice, clonedVoices) ?? voiceLabel(draft.voice)}</option>
                      )}
                    <ClonedVoiceOptions voices={clonedVoices} />
                    {voicePickerGroups(myVoices).map((group) =>
                      group.voices.length === 0 ? null : (
                        <optgroup key={group.key} label={`${group.label} - ${group.note}`}>
                          {group.voices.map((v) => (
                            <option key={v.value} value={v.value}>{v.name}{v.note ? ` - ${v.note}` : ''}</option>
                          ))}
                        </optgroup>
                      ),
                    )}
                  </select>
                </Field>
                <Field label="Default language">
                  <select value={draft.language} onChange={(e) => set('language', e.target.value)} className={inputCls}>
                    {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Voice delivery" wide>
                  <select value={draft.tone} onChange={(e) => set('tone', e.target.value as AgentDraft['tone'])} className={inputCls}>
                    {TONES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label} - {t.description.split('-')[0].trim()}</option>
                    ))}
                  </select>
                </Field>
              </Section>

              <Section title="Instructions" icon="description" busy={busy === 'instructions'} disabled={busy !== null} onRegenerate={() => regenerate('instructions')}>
                <Field label="Who speaks first" wide>
                  <select value={draft.firstSpeaker} onChange={(e) => set('firstSpeaker', e.target.value as AgentDraft['firstSpeaker'])} className={inputCls}>
                    <option value="agent">AI speaks first (greets the caller)</option>
                    <option value="user">Caller speaks first (agent waits)</option>
                  </select>
                </Field>
                <Field label="Welcome message — inbound" wide>
                  <textarea value={draft.welcomeMessage} onChange={(e) => set('welcomeMessage', e.target.value)} rows={2} maxLength={300} className={inputCls} />
                </Field>
                <Field label="Welcome message — outbound" wide>
                  <textarea value={draft.welcomeMessageOutbound} onChange={(e) => set('welcomeMessageOutbound', e.target.value)} rows={2} maxLength={300} placeholder="Blank = use the inbound one" className={inputCls} />
                </Field>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">What the agent follows on every call</span>
                  <PromptSections value={draft.systemPrompt} onChange={(v) => set('systemPrompt', v)} />
                </div>
              </Section>

              <Section title="Conversation & tools" icon="build" busy={busy === 'conversation'} disabled={busy !== null} onRegenerate={() => regenerate('conversation')}>
                <div className="flex flex-col gap-2 sm:col-span-2">
                  {OPTIONAL_FUNCTIONS.map((fn) => (
                    <label key={fn.name} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={functionOn(draft.enabledFunctions, fn.name)}
                        onChange={(e) => set('enabledFunctions', toggleFunction(draft.enabledFunctions, fn.name, e.target.checked))}
                        className="h-4 w-4 accent-primary"
                      />
                      {fn.label}
                    </label>
                  ))}
                </div>
                <Field label="Max call duration (sec, 0 = platform limit)">
                  <input
                    type="number"
                    min={0}
                    max={2700}
                    value={draft.maxCallDurationS}
                    onChange={(e) => set('maxCallDurationS', Math.max(0, Number(e.target.value) || 0))}
                    className={inputCls}
                  />
                </Field>
              </Section>

              <Section title="After the call" icon="fact_check" busy={busy === 'after'} disabled={busy !== null} onRegenerate={() => regenerate('after')}>
                <div className="sm:col-span-2">
                  <PostCallFieldsEditor value={draft.postCallFields} onChange={(v) => set('postCallFields', v)} inputCls={inputCls} />
                </div>
              </Section>

              <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-border bg-bg/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:bg-surface/90 sm:shadow-lg">
                <button type="button" disabled={busy !== null} onClick={create} className={primaryBtn}>
                  <Icon name={busy === 'create' ? 'progress_activity' : 'rocket_launch'} className={`text-[18px] ${busy === 'create' ? 'motion-safe:animate-spin' : ''}`} />
                  {busy === 'create' ? 'Creating…' : 'Create agent'}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setStep('describe')}
                  className="flex items-center gap-1.5 rounded-lg bg-transparent px-3 py-2.5 text-sm font-semibold text-text-muted hover:text-text disabled:opacity-50"
                >
                  <Icon name="arrow_back" className="text-[16px]" />
                  Back to description
                </button>
              </div>
            </div>
            <aside className="order-first lg:order-none">
              <div className="lg:sticky lg:top-4">
                <AgentPreviewCard draft={draft} voices={myVoices} clonedName={clonedVoiceFallbackName(draft.voice, clonedVoices)} />
              </div>
            </aside>
          </div>
        ) : null}

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </section>
      {createdId !== null && draft && (
        <CreatedOverlay
          draft={draft}
          voiceName={myVoices.find((v) => v.value === draft.voice)?.name ?? clonedVoiceFallbackName(draft.voice, clonedVoices) ?? voiceLabel(draft.voice)}
          onOpen={(test) => navigate(`/dashboard/agents/${createdId}?drafted=1${test ? '&test=1' : ''}`)}
        />
      )}
      {upgradeMessage && <UpgradeRequiredModal message={upgradeMessage} onClose={() => setUpgradeMessage(null)} />}
    </DashboardLayout>
  )
}

function functionOn(enabled: string, name: string) {
  return enabled.trim() === '' || enabled.split(',').map((s) => s.trim()).includes(name)
}

function toggleFunction(enabled: string, name: string, on: boolean) {
  const all = OPTIONAL_FUNCTIONS.map((f) => f.name)
  const current = new Set(enabled.trim() === '' ? all : enabled.split(',').map((s) => s.trim()).filter(Boolean))
  if (on) current.add(name)
  else current.delete(name)
  return all.every((f) => current.has(f)) ? '' : all.filter((f) => current.has(f)).join(',')
}

/** Describe → Questions → Review → Create. */
function StepBar({ current, skippedQuestions }: { current: number; skippedQuestions: boolean }) {
  return (
    <ol className="flex items-center gap-1.5 sm:gap-2" aria-label="Progress">
      {STEP_NAMES.map((name, i) => {
        const done = i < current
        const active = i === current
        const skipped = i === 1 && skippedQuestions
        return (
          <li key={name} className="flex flex-1 items-center gap-1.5 sm:gap-2" aria-current={active ? 'step' : undefined}>
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                done ? 'bg-primary text-white' : active ? 'bg-primary/15 text-primary ring-2 ring-primary' : 'bg-surface-high text-text-muted'
              }`}
            >
              {done ? <Icon name="check" className="text-[14px]" /> : i + 1}
            </span>
            <span className={`hidden text-xs font-semibold sm:inline ${active ? 'text-text' : 'text-text-muted'} ${skipped ? 'line-through opacity-60' : ''}`}>{name}</span>
            {i < STEP_NAMES.length - 1 && (
              <span className="h-0.5 min-w-3 flex-1 overflow-hidden rounded-full bg-surface-high">
                <span className={`block h-full bg-primary transition-all duration-500 ${done ? 'w-full' : 'w-0'}`} />
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** What the builder is doing while the draft is on its way: each line ticks
 * off in turn; the last one waits for the real answer. */
function BuildingChecklist() {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (index >= BUILD_STEPS.length - 1) return
    const timer = window.setTimeout(() => setIndex((i) => i + 1), 1400)
    return () => window.clearTimeout(timer)
  }, [index])
  return (
    <div role="status" aria-live="polite" className="help-msg-in relative overflow-hidden rounded-2xl border border-primary/20 bg-surface p-6 shadow-sm sm:p-8">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-primary/10">
        <div className="help-progress-bar h-full w-1/3 bg-gradient-to-r from-transparent via-primary to-transparent" />
      </div>
      <div className="mx-auto flex max-w-sm flex-col items-center gap-5">
        <span className="help-avatar-thinking flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-white shadow-lg shadow-primary/30">
          <Icon name="auto_awesome" className="text-[24px]" />
        </span>
        <p className="text-base font-bold">Building your agent…</p>
        <ul className="flex w-full flex-col gap-3">
          {BUILD_STEPS.map((label, i) => (
            <li key={label} className={`flex items-center gap-3 text-sm transition-opacity ${i > index ? 'opacity-40' : ''}`}>
              {i < index ? (
                <SuccessCheck />
              ) : i === index ? (
                <span className="flex h-5 w-5 items-center justify-center gap-0.5 text-primary" aria-hidden="true">
                  <span className="help-dot" />
                  <span className="help-dot" style={{ animationDelay: '140ms' }} />
                  <span className="help-dot" style={{ animationDelay: '280ms' }} />
                </span>
              ) : (
                <span className="h-5 w-5 rounded-full border-2 border-border" aria-hidden="true" />
              )}
              <span className={i === index ? 'font-semibold text-text' : 'text-text-muted'}>{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** The agent as callers will meet it; updates as the draft is edited. */
function AgentPreviewCard({ draft, voices, clonedName }: { draft: AgentDraft; voices: VoiceEntry[]; clonedName?: string }) {
  const voiceName = voices.find((v) => v.value === draft.voice)?.name ?? clonedName ?? voiceLabel(draft.voice)
  const language = LANGUAGES.find(([code]) => code === draft.language)?.[1] ?? draft.language
  const tone = TONES.find((t) => t.value === draft.tone)?.label ?? draft.tone
  const tools = OPTIONAL_FUNCTIONS.filter((f) => functionOn(draft.enabledFunctions, f.name)).length
  const greeting = (draft.welcomeMessage || draft.welcomeMessageOutbound).trim()
  const initials = draft.name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'AI'
  return (
    <div className="help-card-pop relative overflow-hidden rounded-2xl border border-primary/25 bg-surface shadow-lg shadow-primary/10">
      <div aria-hidden="true" className="h-20 bg-gradient-to-br from-primary via-primary-dark to-cyan opacity-90" />
      <div className="-mt-9 flex flex-col gap-4 px-5 pb-5">
        <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-surface bg-surface text-xl font-extrabold text-primary shadow-lg ring-1 ring-primary/20">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-bold">{draft.name || 'New agent'}</p>
          <p className="truncate text-xs text-text-muted">{draft.businessName || 'Your business'}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[`🎙 ${voiceName}`, `🌐 ${language}`, tone, `${tools} tool${tools === 1 ? '' : 's'}`, `${draft.postCallFields.length} after-call fields`].map((chip) => (
            <span key={chip} className="rounded-full bg-surface-high px-2.5 py-1 text-[11px] font-semibold text-text-muted">{chip}</span>
          ))}
        </div>
        {greeting ? (
          <div className="flex flex-col gap-2 rounded-xl bg-primary/5 p-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">First thing callers hear</span>
            <p className="text-sm leading-relaxed">“{greeting}”</p>
            <GreetingButton voice={draft.voice} language={draft.language} text={greeting} />
          </div>
        ) : (
          <p className="rounded-xl bg-surface-high/50 p-3 text-xs text-text-muted">No welcome message - the agent greets with a short default line.</p>
        )}
      </div>
    </div>
  )
}

/** Plays the greeting in the chosen voice. Clips are kept per voice +
 * language + text, so replaying doesn't request it again. */
function GreetingButton({ voice, language, text }: { voice: string; language: string; text: string }) {
  const clips = useRef(new Map<string, string>())
  const audio = useRef<HTMLAudioElement | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const cache = clips.current
    return () => {
      audio.current?.pause()
      cache.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])
  useEffect(() => {
    audio.current?.pause()
    setState('idle')
    setError(null)
  }, [voice, language, text])

  const play = async () => {
    if (state === 'playing') {
      audio.current?.pause()
      setState('idle')
      return
    }
    setError(null)
    const key = `${voice}|${language}|${text}`
    let url = clips.current.get(key)
    if (!url) {
      setState('loading')
      try {
        url = URL.createObjectURL(await draftGreetingAudio({ voice, language, text }))
        clips.current.set(key, url)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not play the greeting.')
        setState('idle')
        return
      }
    }
    const player = new Audio(url)
    audio.current = player
    player.onended = () => setState('idle')
    setState('playing')
    player.play().catch(() => setState('idle'))
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={play}
        disabled={state === 'loading'}
        className="flex items-center justify-center gap-2 self-start rounded-full bg-primary px-4 py-2 text-xs font-bold text-white shadow-md shadow-primary/25 transition hover:-translate-y-px disabled:opacity-60"
      >
        <Icon name={state === 'playing' ? 'stop' : state === 'loading' ? 'progress_activity' : 'play_arrow'} className={`text-[16px] ${state === 'loading' ? 'motion-safe:animate-spin' : ''}`} />
        {state === 'playing' ? 'Stop' : state === 'loading' ? 'Preparing…' : 'Hear the greeting'}
      </button>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  )
}

type PromptPart = { title: string; body: string }

function splitPrompt(text: string): { intro: string; parts: PromptPart[] } {
  const parts: PromptPart[] = []
  const intro: string[] = []
  for (const line of text.split('\n')) {
    const heading = /^#{1,3}\s+(.+?)\s*$/.exec(line)
    if (heading) parts.push({ title: heading[1], body: '' })
    else if (parts.length) parts[parts.length - 1].body += (parts[parts.length - 1].body ? '\n' : '') + line
    else intro.push(line)
  }
  return { intro: intro.join('\n').trim(), parts }
}

function joinPrompt(intro: string, parts: PromptPart[]) {
  return [intro.trim(), ...parts.map((p) => `# ${p.title}\n${p.body.trim()}`)].filter(Boolean).join('\n\n')
}

/** The system prompt as tidy, collapsible sections (Role, Goal, Call flow…),
 * with a switch back to one block of text. */
function PromptSections({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [raw, setRaw] = useState(false)
  const { intro, parts } = splitPrompt(value)
  if (raw || parts.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={14} className={`${inputCls} font-mono text-xs leading-relaxed`} />
        {parts.length > 0 && (
          <button type="button" onClick={() => setRaw(false)} className="self-end bg-transparent text-xs font-semibold text-primary hover:underline">
            Show as sections
          </button>
        )}
      </div>
    )
  }
  const update = (i: number, body: string) => onChange(joinPrompt(intro, parts.map((p, j) => (j === i ? { ...p, body } : p))))
  return (
    <div className="flex flex-col gap-2">
      {parts.map((part, i) => (
        <details key={`${i}-${part.title}`} open={i < 2} className="group rounded-xl border border-border bg-surface-high/30 open:bg-surface-high/50">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/15 text-[10px] font-bold text-primary">{i + 1}</span>
            <span className="flex-1">{part.title}</span>
            <span className="text-[11px] font-normal text-text-muted group-open:hidden">{part.body.trim().split('\n')[0].slice(0, 48)}…</span>
            <Icon name="expand_more" className="text-[18px] text-text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-3 pb-3">
            <textarea
              value={part.body.trim()}
              onChange={(e) => update(i, e.target.value)}
              rows={Math.min(10, Math.max(2, part.body.trim().split('\n').length + 1))}
              className={`${inputCls} leading-relaxed`}
            />
          </div>
        </details>
      ))}
      <button type="button" onClick={() => setRaw(true)} className="self-end bg-transparent text-xs font-semibold text-primary hover:underline">
        Edit as one block
      </button>
    </div>
  )
}

const OPEN_AFTER_MS = 4500
// Confetti burst: angle (deg), distance (px), colour, delay (ms).
const CONFETTI = Array.from({ length: 14 }, (_, i) => ({
  angle: (360 / 14) * i + (i % 2 ? 9 : -6),
  distance: 70 + (i % 3) * 22,
  color: ['var(--color-primary)', 'var(--color-cyan)', 'var(--color-success)', '#f59e0b'][i % 4],
  delay: (i % 4) * 40,
}))

/** "Meet <agent>": the agent sends out voice ripples while confetti bursts,
 * its greeting shows in a speech bubble, and the agent opens on its own
 * after a short countdown (or straight away from either button). A bottom
 * sheet on phones, a card on larger screens. */
function CreatedOverlay({ draft, voiceName, onOpen }: { draft: AgentDraft; voiceName: string; onOpen: (test: boolean) => void }) {
  const opened = useRef(false)
  const open = (test: boolean) => {
    if (opened.current) return
    opened.current = true
    onOpen(test)
  }
  const openRef = useRef(open)
  openRef.current = open
  useEffect(() => {
    const timer = window.setTimeout(() => openRef.current(false), OPEN_AFTER_MS)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') openRef.current(false) }
    window.addEventListener('keydown', onKey)
    // The voice widget sits above everything; it steps aside for this moment.
    document.documentElement.dataset.focusMoment = '1'
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      delete document.documentElement.dataset.focusMoment
    }
  }, [])
  const language = LANGUAGES.find(([code]) => code === draft.language)?.[1] ?? draft.language
  const greeting = (draft.welcomeMessage || draft.welcomeMessageOutbound).trim()
  const initials = draft.name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'AI'
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-bg/75 backdrop-blur-md sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="agent-ready-title">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-[28rem] w-[28rem] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/25 blur-3xl" />
      <div className="vv-sheet-in relative w-full overflow-hidden rounded-t-3xl border border-primary/25 bg-surface shadow-2xl shadow-primary/25 sm:max-w-md sm:rounded-3xl">
        <div aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-border sm:hidden" />
        <div className="relative flex h-44 items-center justify-center overflow-hidden bg-gradient-to-br from-primary/15 via-surface to-cyan/10">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="vv-confetti absolute left-1/2 top-1/2 h-2 w-1.5 rounded-sm"
              style={{
                background: c.color,
                animationDelay: `${260 + c.delay}ms`,
                ['--vv-x' as string]: `${Math.cos((c.angle * Math.PI) / 180) * c.distance}px`,
                ['--vv-y' as string]: `${Math.sin((c.angle * Math.PI) / 180) * c.distance}px`,
                ['--vv-r' as string]: `${c.angle * 2}deg`,
              }}
            />
          ))}
          <span aria-hidden="true" className="vv-ring absolute h-20 w-20 rounded-3xl border-2 border-primary/50" />
          <span aria-hidden="true" className="vv-ring absolute h-20 w-20 rounded-3xl border-2 border-primary/40" style={{ animationDelay: '1100ms' }} />
          <span className="vv-pop relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-primary-dark text-2xl font-extrabold text-white shadow-xl shadow-primary/40">
            {initials}
            <span className="absolute -bottom-1.5 -right-1.5 rounded-full border-4 border-surface bg-surface">
              <SuccessCheck />
            </span>
          </span>
        </div>
        <div className="flex flex-col gap-4 px-5 pb-5 pt-1 sm:px-7 sm:pb-7">
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Agent created</span>
            <h2 id="agent-ready-title" className="text-xl font-bold tracking-tight sm:text-2xl">Meet {draft.name || 'your agent'}</h2>
            <p className="text-xs text-text-muted">{[draft.businessName, voiceName, language].filter(Boolean).join(' · ')}</p>
          </div>
          {greeting && (
            <div className="vv-bubble-in relative rounded-2xl rounded-tl-md bg-primary/10 px-4 py-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-primary">
                <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
                  {[0, 1, 2, 3].map((b) => (
                    <span key={b} className="vv-eq w-[3px] rounded-full bg-primary" style={{ animationDelay: `${b * 120}ms` }} />
                  ))}
                </span>
                Greets every caller with
              </div>
              <p className="line-clamp-3 text-sm leading-relaxed">“{greeting}”</p>
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" autoFocus onClick={() => open(true)} className={`${primaryBtn} flex-1`}>
              <Icon name="mic" className="text-[18px]" />
              Run a test call
            </button>
            <button
              type="button"
              onClick={() => open(false)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-bold text-text transition hover:border-primary"
            >
              Open agent
              <Icon name="arrow_forward" className="text-[16px]" />
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="h-1 overflow-hidden rounded-full bg-surface-high" aria-hidden="true">
              <div className="vv-countdown h-full rounded-full bg-gradient-to-r from-primary to-cyan" style={{ animationDuration: `${OPEN_AFTER_MS}ms` }} />
            </div>
            <p className="text-center text-[11px] text-text-muted">Opening your agent…</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  icon,
  busy,
  disabled,
  onRegenerate,
  children,
}: {
  title: string
  icon: string
  busy: boolean
  disabled: boolean
  onRegenerate: () => void
  children: ReactNode
}) {
  return (
    <div className="help-msg-in rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon name={icon} className="text-[17px]" />
          </span>
          {title}
        </h2>
        <button
          type="button"
          disabled={disabled}
          onClick={onRegenerate}
          className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:border-primary hover:text-text disabled:opacity-50"
        >
          <Icon name="refresh" className={`text-[15px] ${busy ? 'motion-safe:animate-spin' : ''}`} />
          {busy ? 'Regenerating…' : 'Regenerate'}
        </button>
      </div>
      <div className={`grid grid-cols-1 gap-3 transition-opacity sm:grid-cols-2 ${busy ? 'opacity-50' : ''}`}>{children}</div>
    </div>
  )
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">{label}</span>
      {children}
    </label>
  )
}
