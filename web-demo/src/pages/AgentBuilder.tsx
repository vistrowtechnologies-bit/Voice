import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { UpgradeRequiredModal } from '../components/UpgradeRequiredModal'
import { useAuth } from '../lib/auth'
import { createAgent, draftAgent, fetchMyVoices, updateAgent } from '../lib/api'
import { LANGUAGES, modelLabel, modelOptionsFor, TONES, voiceLabel, voicePickerGroups } from '../lib/agentOptions'
import type { AgentDraft, AgentDraftQuestion, AgentDraftSection, VoiceEntry } from '../lib/types'
import { PostCallFieldsEditor } from './AgentDetail'

const EXAMPLES: { label: string; text: string }[] = [
  {
    label: 'Real estate · Pune',
    text: "We're a real estate developer in Pune selling 2 and 3 BHK flats in Baner. The agent should answer enquiry calls in Hindi and English, ask about budget, BHK and purchase timeline, and book site visits.",
  },
  {
    label: 'Clinic receptionist',
    text: "We run a dental clinic open 10am to 8pm, Monday to Saturday. The agent should answer patient calls, tell them our timings and treatments, and book appointments with the doctor.",
  },
  {
    label: 'D2C order support',
    text: "We're a D2C skincare brand. The agent should take customer calls in Hindi and English about order status, returns and refunds, collect the order number, and pass anything it can't solve to our support team.",
  },
  {
    label: 'Education counsellor',
    text: "We're a JEE and NEET coaching institute. The agent should call back students who filled our enquiry form, understand their class, target exam and preferred batch, and book a counselling session.",
  },
  {
    label: 'Insurance renewals',
    text: "We're an insurance agency. The agent should make outbound calls to customers whose motor insurance renews in the next 15 days, remind them of the due date, answer basic questions and set up a callback with an advisor.",
  },
]

const PROGRESS = ['Understanding your business…', 'Writing the instructions…', 'Choosing a voice…', 'Setting up after-call fields…']

// Same optional built-ins and "" = all-on convention as AgentDetail.tsx.
const OPTIONAL_FUNCTIONS: { name: string; label: string }[] = [
  { name: 'end_call', label: 'Let the agent end the call' },
  { name: 'transfer_call', label: 'Transfer to a human (needs a transfer number on the agent page)' },
  { name: 'web_search', label: 'Let the agent search the web' },
  { name: 'send_dtmf', label: 'Let the agent press phone keys (DTMF)' },
]

const inputCls = 'w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary'

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
  const [error, setError] = useState<string | null>(null)
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null)
  const [myVoices, setMyVoices] = useState<VoiceEntry[]>([])
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
      navigate(`/dashboard/agents/${agentId}?drafted=1`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create the agent. Please try again.'
      if (msg.toLowerCase().includes('upgrade') && agentId === null) setUpgradeMessage(msg)
      else if (agentId !== null) setError(`The agent was created, but some settings did not save: ${msg} Open it from Agents to finish.`)
      else setError(msg)
    } finally {
      setBusy(null)
    }
  }

  const set = <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d))

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
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
        {step === 'describe' && (
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-bold">Tell us about your business and what the agent should do</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={7}
                maxLength={4000}
                placeholder="For example: who calls you (or who you call), what they ask, which languages they speak, what the agent should collect, and whether it books appointments."
                className={`${inputCls} resize-y leading-relaxed`}
              />
            </label>
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Or start from an example</span>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example.label}
                    type="button"
                    onClick={() => setDescription(example.text)}
                    className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:border-primary hover:text-text"
                  >
                    {example.label}
                  </button>
                ))}
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
            {busy === 'draft' ? (
              <ProgressLine />
            ) : (
              <button
                type="button"
                disabled={description.trim().length < 10}
                onClick={() => requestDraft(answers)}
                className="flex items-center justify-center gap-1.5 self-start rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="auto_awesome" className="text-[18px]" />
                Draft my agent
              </button>
            )}
          </div>
        )}

        {step === 'questions' && (
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
            <p className="flex items-center gap-2 text-sm font-bold">
              <Icon name="auto_awesome" className="text-[18px] text-primary" />
              A few quick questions so the agent fits your business
            </p>
            {questions.map((q) => (
              <div key={q.id} className="flex flex-col gap-2 rounded-lg bg-surface-high/40 p-3">
                <p className="text-sm">{q.question}</p>
                <div className="flex flex-wrap gap-2">
                  {q.options.map((option) => {
                    const chosen = answers?.[q.id] === option
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={chosen}
                        onClick={() => setAnswers((a) => ({ ...(a ?? {}), [q.id]: option }))}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${chosen ? 'border-primary bg-primary text-bg' : 'border-border bg-surface text-text-muted hover:border-primary hover:text-text'}`}
                      >
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
            ))}
            {busy === 'draft' ? (
              <ProgressLine />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => requestDraft(answers ?? {})}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-bg hover:opacity-90"
                >
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
            )}
          </div>
        )}

        {step === 'review' && draft && (
          <>
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
              Here's your draft. Edit anything below, or regenerate a section. Nothing is saved until you click <b>Create agent</b>.
            </div>

            <Section title="Basics" busy={busy === 'basics'} disabled={busy !== null} onRegenerate={() => regenerate('basics')}>
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

            <Section title="Voice & language" busy={busy === 'voice'} disabled={busy !== null} onRegenerate={() => regenerate('voice')}>
              <Field label="Voice">
                <select value={draft.voice} onChange={(e) => set('voice', e.target.value)} className={inputCls}>
                  {!myVoices.some((v) => v.value === draft.voice) && <option value={draft.voice}>{voiceLabel(draft.voice)}</option>}
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

            <Section title="Instructions" busy={busy === 'instructions'} disabled={busy !== null} onRegenerate={() => regenerate('instructions')}>
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
                <textarea value={draft.welcomeMessageOutbound} onChange={(e) => set('welcomeMessageOutbound', e.target.value)} rows={2} maxLength={300} className={inputCls} />
              </Field>
              <Field label="System prompt" wide>
                <textarea
                  value={draft.systemPrompt}
                  onChange={(e) => set('systemPrompt', e.target.value)}
                  rows={14}
                  className={`${inputCls} font-mono text-xs leading-relaxed`}
                />
              </Field>
            </Section>

            <Section title="Conversation & tools" busy={busy === 'conversation'} disabled={busy !== null} onRegenerate={() => regenerate('conversation')}>
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

            <Section title="After the call" busy={busy === 'after'} disabled={busy !== null} onRegenerate={() => regenerate('after')}>
              <div className="sm:col-span-2">
                <PostCallFieldsEditor value={draft.postCallFields} onChange={(v) => set('postCallFields', v)} inputCls={inputCls} />
              </div>
            </Section>

            <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-border bg-bg/95 px-4 py-3 sm:mx-0 sm:rounded-xl sm:border sm:bg-surface">
              <button
                type="button"
                disabled={busy !== null}
                onClick={create}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-50"
              >
                <Icon name={busy === 'create' ? 'progress_activity' : 'check'} className={`text-[18px] ${busy === 'create' ? 'motion-safe:animate-spin' : ''}`} />
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
          </>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </section>
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

/** Steps through what the server is doing while the draft is on its way.
 * The text change is not motion; only the dot pulses, and only when the
 * user hasn't asked for reduced motion. */
function ProgressLine() {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setIndex((i) => Math.min(i + 1, PROGRESS.length - 1)), 2600)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-semibold text-primary">
      <span className="h-2 w-2 rounded-full bg-primary motion-safe:animate-pulse" />
      {PROGRESS[index]}
    </p>
  )
}

function Section({
  title,
  busy,
  disabled,
  onRegenerate,
  children,
}: {
  title: string
  busy: boolean
  disabled: boolean
  onRegenerate: () => void
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">{title}</h2>
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
      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${busy ? 'opacity-60' : ''}`}>{children}</div>
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
