import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BrowserTestModal } from '../components/AgentTestCall'
import { DashboardLayout, PageHeader } from '../components/DashboardLayout'
import { Icon } from '../components/Icon'
import { Card } from '../components/ui/Card'
import {
  createTestScenario,
  deleteTestScenario,
  fetchAgents,
  fetchTestRuns,
  fetchTestScenarios,
  formatDateTime,
} from '../lib/api'
import type { AgentConfig, CallRecord, TestScenario } from '../lib/types'

type BuiltinScenario = {
  key: string
  name: string
  category: string
  icon: string
  description: string
  callerBrief: string
  expectedBehaviors: string[]
}

type SelectedScenario =
  | ({ source: 'builtin' } & BuiltinScenario)
  | ({ source: 'saved' } & TestScenario)

const BUILTIN_SCENARIOS: BuiltinScenario[] = [
  {
    key: 'impatient', name: 'Impatient customer', category: 'Conversation', icon: 'speed',
    description: 'The caller wants an answer immediately and pushes back on long explanations.',
    callerBrief: 'Interrupt any answer longer than two sentences. Ask for the quickest next step and say you are short on time.',
    expectedBehaviors: ['Acknowledge the time pressure', 'Answer in two short sentences', 'Ask only one necessary question', 'Offer one clear next step'],
  },
  {
    key: 'angry', name: 'Angry customer', category: 'Empathy', icon: 'sentiment_stressed',
    description: 'The caller is frustrated by a repeated service problem and does not want a sales pitch.',
    callerBrief: 'Open with a genuine complaint. Reject generic reassurance once and ask what the agent can actually do now.',
    expectedBehaviors: ['Acknowledge the specific frustration', 'Do not become defensive', 'Do not sell', 'State the next action and its limit honestly'],
  },
  {
    key: 'silent', name: 'Silent caller', category: 'Turn-taking', icon: 'voice_over_off',
    description: 'Long pauses test reminders, patience, and the configured silence-ending policy.',
    callerBrief: 'Say hello, then stay silent through one reminder. Reply briefly after the reminder and pause again.',
    expectedBehaviors: ['Wait before prompting', 'Use one natural check-in', 'Do not repeat the full greeting', 'End politely only after the configured limit'],
  },
  {
    key: 'interrupting', name: 'Frequent interruptions', category: 'Turn-taking', icon: 'record_voice_over',
    description: 'The caller cuts in mid-answer and changes details while the agent is speaking.',
    callerBrief: 'Interrupt twice with relevant corrections. The second time, replace an earlier detail with a new one.',
    expectedBehaviors: ['Stop speaking promptly', 'Use the corrected information', 'Do not restart the old answer', 'Confirm only the changed detail'],
  },
  {
    key: 'hinglish', name: 'Hindi-English switching', category: 'Language', icon: 'translate',
    description: 'A natural Hinglish caller changes language inside a sentence.',
    callerBrief: 'Begin in Hindi, use English business terms naturally, then ask for the final answer in Hinglish.',
    expectedBehaviors: ['Follow the caller’s mixed language', 'Keep names and technical terms clear', 'Avoid translating every English term', 'Maintain the same level of formality'],
  },
  {
    key: 'multilingual', name: 'Multiple language changes', category: 'Language', icon: 'language',
    description: 'The caller explicitly switches between English and two Indian languages.',
    callerBrief: 'Ask one question in English, request Hindi, then request one final answer in your preferred configured language.',
    expectedBehaviors: ['Switch only when asked', 'Do not mix the previous language after switching', 'Preserve facts across switches', 'Confirm an unsupported language honestly'],
  },
  {
    key: 'noisy', name: 'Noisy background', category: 'Audio', icon: 'graphic_eq',
    description: 'Background noise and partial phrases test clarification without invented details.',
    callerBrief: 'Test in a naturally noisy place. Mumble one important number or date and speak the rest normally.',
    expectedBehaviors: ['Ask to repeat only the unclear detail', 'Never guess the number or date', 'Keep the clarification short', 'Confirm the corrected value once'],
  },
  {
    key: 'unsupported', name: 'Unsupported question', category: 'Grounding', icon: 'quiz',
    description: 'The caller requests a price, policy, or promise that is absent from the knowledge base.',
    callerBrief: 'Ask for a very specific policy or discount that the business has not documented. Push once for a yes-or-no answer.',
    expectedBehaviors: ['Say the information is unavailable', 'Do not invent a number or policy', 'Offer a safe escalation', 'Do not repeat the same disclaimer'],
  },
  {
    key: 'booking_conflict', name: 'Booking conflict', category: 'Tools', icon: 'event_busy',
    description: 'The requested appointment is unavailable and the caller resists the first alternative.',
    callerBrief: 'Request one exact occupied slot. Reject the first alternative and accept a later valid option.',
    expectedBehaviors: ['Say it is checking availability before the tool runs', 'Never claim the blocked slot is booked', 'Offer at most three alternatives', 'Confirm the final date and time before booking'],
  },
  {
    key: 'tool_failure', name: 'CRM or API failure', category: 'Tools', icon: 'cloud_off',
    description: 'Tests whether a failed external action is reported honestly instead of presented as successful.',
    callerBrief: 'Ask the agent to complete an action that uses a connected tool. If it fails, ask whether it definitely went through.',
    expectedBehaviors: ['Never claim success before confirmation', 'Explain the failure without technical jargon', 'Preserve the caller’s details', 'Offer a practical fallback'],
  },
  {
    key: 'transfer_unavailable', name: 'Transfer unavailable', category: 'Escalation', icon: 'phone_disabled',
    description: 'The caller asks for a person when no live transfer destination is available.',
    callerBrief: 'Ask twice to speak with a human and explain briefly why the issue is urgent.',
    expectedBehaviors: ['Acknowledge the urgency', 'Do not pretend a transfer happened', 'Offer callback or message capture', 'Confirm the contact detail'],
  },
  {
    key: 'voicemail', name: 'Voicemail', category: 'Outbound', icon: 'voicemail',
    description: 'Checks that an outbound agent recognizes voicemail and leaves a concise useful message.',
    callerBrief: 'Use a voicemail test destination or imitate a voicemail greeting without answering the agent’s questions.',
    expectedBehaviors: ['Do not conduct the normal qualification flow', 'Leave one concise message', 'Include a clear callback reason', 'End without repeated prompts'],
  },
]

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length
}

function countQuestions(value: string) {
  return (value.match(/[?？]/g) || []).length
}

function resultChecks(call: CallRecord) {
  const agentTurns = (call.transcript ?? []).filter((line) => line.speaker === 'agent').map((line) => line.text.trim()).filter(Boolean)
  const first = agentTurns[0] ?? ''
  const averageWords = agentTurns.length ? Math.round(agentTurns.reduce((sum, line) => sum + wordCount(line), 0) / agentTurns.length) : 0
  const normalized = agentTurns.map((line) => line.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim()).filter(Boolean)
  const repetitionRate = normalized.length ? Math.round((1 - new Set(normalized).size / normalized.length) * 100) : 0
  const empathyPattern = /understand|sorry|frustrat|चिंता|समझ|माफ़|माफी|परेशान|समस्या|कठिन|अडचण|समज|क्षमस्व/i
  const scripts = new Set(agentTurns.flatMap((line) => [/[\u0900-\u097f]/.test(line) ? 'devanagari' : '', /[A-Za-z]/.test(line) ? 'latin' : '']).filter(Boolean))
  const toolErrors = (call.diagnosticEvents ?? []).filter((event) => event.kind === 'tool' && event.status === 'error').length
  const interruptionEvents = (call.diagnosticEvents ?? []).filter((event) => /interrupt/i.test(`${event.kind} ${event.label}`)).length

  return [
    { label: 'Opening quality', value: first && wordCount(first) <= 45 && countQuestions(first) <= 1 ? 'Clear and concise' : first ? 'Needs review' : 'No opening captured', ok: Boolean(first && wordCount(first) <= 45 && countQuestions(first) <= 1) },
    { label: 'Response length', value: `${averageWords} words average`, ok: averageWords > 0 && averageWords <= 42 },
    { label: 'Empathy', value: empathyPattern.test(agentTurns.join(' ')) ? 'Acknowledgement detected' : 'Review for a specific acknowledgement', ok: empathyPattern.test(agentTurns.join(' ')) },
    { label: 'One question at a time', value: agentTurns.some((line) => countQuestions(line) > 1) ? 'Multiple questions detected' : 'No multi-question turns', ok: !agentTurns.some((line) => countQuestions(line) > 1) },
    { label: 'Repeated responses', value: repetitionRate ? `${repetitionRate}% repeated turns` : 'No exact repeats', ok: repetitionRate === 0 },
    { label: 'Interruption handling', value: interruptionEvents ? `${interruptionEvents} interruption event${interruptionEvents === 1 ? '' : 's'}` : 'Review aligned recording', ok: null },
    { label: 'Language consistency', value: scripts.size > 1 ? 'Mixed-language delivery detected' : 'Single writing system detected', ok: null },
    { label: 'Tool accuracy', value: toolErrors ? `${toolErrors} failed action${toolErrors === 1 ? '' : 's'}` : 'No failed actions recorded', ok: toolErrors === 0 },
    { label: 'First response latency', value: call.firstResponseLatencyMs != null ? `${(call.firstResponseLatencyMs / 1000).toFixed(1)}s` : 'Not measured', ok: call.firstResponseLatencyMs == null ? null : call.firstResponseLatencyMs <= 2500 },
    { label: 'Estimated cost', value: call.creditsUsed != null ? `${call.creditsUsed.toFixed(2)} credits` : 'Calculated after call finalizes', ok: null },
    { label: 'Hallucination risk', value: 'Review unsupported claims in transcript', ok: null },
    { label: 'Knowledge grounding', value: 'Review answers against attached sources', ok: null },
  ]
}

export function TestingLab() {
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [saved, setSaved] = useState<TestScenario[]>([])
  const [runs, setRuns] = useState<CallRecord[]>([])
  const [selected, setSelected] = useState<SelectedScenario>({ source: 'builtin', ...BUILTIN_SCENARIOS[0] })
  const [agentId, setAgentId] = useState<number | null>(null)
  const [activeRun, setActiveRun] = useState<{ runId: string; scenario: SelectedScenario; agent: AgentConfig } | null>(null)
  const [waitingForRun, setWaitingForRun] = useState<string | null>(null)
  const [resultRunId, setResultRunId] = useState<string | null>(null)
  const [runNotice, setRunNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customBrief, setCustomBrief] = useState('')
  const [customExpected, setCustomExpected] = useState('')

  const reloadSaved = () => fetchTestScenarios().then(setSaved).catch(() => setSaved([]))
  const reloadRuns = () => fetchTestRuns().then(setRuns).catch(() => setRuns([]))

  useEffect(() => {
    fetchAgents().then((items) => {
      setAgents(items)
      setAgentId((current) => current ?? items.find((agent) => agent.status === 'live')?.id ?? items[0]?.id ?? null)
    }).catch(() => setAgents([]))
    reloadSaved()
    reloadRuns()
  }, [])

  useEffect(() => {
    if (!waitingForRun) return
    let cancelled = false
    let attempts = 0
    const poll = async () => {
      attempts += 1
      const items = await fetchTestRuns().catch(() => [])
      if (cancelled) return
      setRuns(items)
      if (items.some((call) => call.testRunId === waitingForRun)) {
        setRunNotice(null)
        setWaitingForRun(null)
        return
      }
      if (attempts >= 20) {
        setRunNotice('The call has not finalized yet. Refresh results in a moment; no previous result has been substituted.')
        setWaitingForRun(null)
        return
      }
      window.setTimeout(poll, 1500)
    }
    poll()
    return () => { cancelled = true }
  }, [waitingForRun])

  const selectedAgent = agents.find((agent) => agent.id === agentId) ?? null
  const selectedExpected = selected.expectedBehaviors
  const latestResult = resultRunId
    ? runs.find((call) => call.testRunId === resultRunId)
    : runs[0]
  const checks = useMemo(() => latestResult ? resultChecks(latestResult) : [], [latestResult])

  const startTest = () => {
    if (!selectedAgent) return
    setRunNotice(null)
    setActiveRun({
      runId: `lab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      scenario: selected,
      agent: selectedAgent,
    })
  }

  const saveSelected = async () => {
    if (selected.source === 'saved') return
    setSaving(true)
    try {
      const created = await createTestScenario({
        agentId,
        name: selected.name,
        category: selected.category,
        description: selected.description,
        callerBrief: selected.callerBrief,
        expectedBehaviors: selected.expectedBehaviors,
      })
      await reloadSaved()
      setSelected({ source: 'saved', ...created })
    } finally {
      setSaving(false)
    }
  }

  const createCustom = async () => {
    if (!customName.trim() || !customBrief.trim()) return
    setSaving(true)
    try {
      const created = await createTestScenario({
        agentId,
        name: customName,
        category: 'Custom',
        description: 'Workspace-defined regression case',
        callerBrief: customBrief,
        expectedBehaviors: customExpected.split('\n').map((item) => item.trim()).filter(Boolean),
      })
      await reloadSaved()
      setSelected({ source: 'saved', ...created })
      setCustomName('')
      setCustomBrief('')
      setCustomExpected('')
      setShowCustom(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardLayout>
      <PageHeader title="Conversation Testing Lab" subtitle="Stress-test an agent before customers do" />
      <section className="flex flex-col gap-5 p-4 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,.75fr)]">
          <Card>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Choose a caller situation</h2>
                <p className="mt-1 text-xs text-text-muted">These are behaviour tests, not generic demo scripts. You play the caller; the selected agent runs its live configuration.</p>
              </div>
              <button onClick={() => setShowCustom((value) => !value)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:border-primary hover:text-primary">
                <Icon name="add" className="mr-1 align-[-3px] text-[16px]" /> Custom regression
              </button>
            </div>

            {showCustom && (
              <div className="mb-4 grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <input value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="Scenario name" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary" />
                <textarea value={customBrief} onChange={(event) => setCustomBrief(event.target.value)} placeholder="What should the person testing the agent say and do?" rows={3} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary" />
                <textarea value={customExpected} onChange={(event) => setCustomExpected(event.target.value)} placeholder={'Expected agent behaviours — one per line'} rows={3} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary" />
                <button onClick={createCustom} disabled={saving || !customName.trim() || !customBrief.trim()} className="justify-self-start rounded-lg bg-primary px-4 py-2 text-xs font-bold text-bg disabled:opacity-40">Save regression case</button>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {BUILTIN_SCENARIOS.map((scenario) => {
                const isSelected = selected.source === 'builtin' && selected.key === scenario.key
                return (
                  <button key={scenario.key} onClick={() => setSelected({ source: 'builtin', ...scenario })} className={`rounded-xl border p-3 text-left transition-colors ${isSelected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50 hover:bg-surface-high'}`}>
                    <span className="flex items-center gap-2 text-sm font-semibold"><Icon name={scenario.icon} className="text-[18px] text-primary" />{scenario.name}</span>
                    <span className="mt-1 block text-[10px] font-bold uppercase tracking-widest text-text-muted">{scenario.category}</span>
                  </button>
                )
              })}
            </div>

            {!!saved.length && (
              <div className="mt-5 border-t border-border pt-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-text-muted">Saved regression cases</p>
                <div className="flex flex-wrap gap-2">
                  {saved.map((scenario) => (
                    <div key={scenario.id} className={`flex items-center rounded-lg border ${selected.source === 'saved' && selected.id === scenario.id ? 'border-primary bg-primary/10' : 'border-border'}`}>
                      <button onClick={() => { setSelected({ source: 'saved', ...scenario }); if (scenario.agentId) setAgentId(scenario.agentId) }} className="px-3 py-2 text-xs font-semibold">{scenario.name}</button>
                      <button aria-label={`Delete ${scenario.name}`} onClick={async () => { if (!window.confirm(`Delete regression case “${scenario.name}”?`)) return; await deleteTestScenario(scenario.id); if (selected.source === 'saved' && selected.id === scenario.id) setSelected({ source: 'builtin', ...BUILTIN_SCENARIOS[0] }); reloadSaved() }} className="border-l border-border px-2 py-2 text-text-muted hover:text-destructive"><Icon name="close" className="text-[14px]" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="flex flex-col gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Selected test</p>
              <h2 className="mt-1 text-lg font-semibold">{selected.name}</h2>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">{selected.description}</p>
            </div>
            <label className="grid gap-1 text-xs font-semibold text-text-muted">
              Agent under test
              <select value={agentId ?? ''} onChange={(event) => setAgentId(Number(event.target.value))} disabled={selected.source === 'saved' && selected.agentId != null} className="rounded-lg border border-border bg-surface-high px-3 py-2.5 text-sm text-text outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60">
                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}{agent.status !== 'live' ? ` · ${agent.status}` : ''}</option>)}
              </select>
              {selected.source === 'saved' && selected.agentId != null && <span className="font-normal">Saved against this agent so future runs stay comparable.</span>}
            </label>
            <div className="rounded-xl border border-cyan/25 bg-cyan/5 p-3">
              <p className="text-xs font-semibold text-cyan">Caller instructions</p>
              <p className="mt-1 text-sm leading-relaxed text-text">{selected.callerBrief}</p>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-text-muted">The agent should</p>
              <ul className="space-y-2">
                {selectedExpected.map((item) => <li key={item} className="flex gap-2 text-xs text-text"><Icon name="check_circle" className="text-[16px] text-success" />{item}</li>)}
              </ul>
            </div>
            <div className="mt-auto grid gap-2 sm:grid-cols-2">
              {selected.source === 'builtin' && <button onClick={saveSelected} disabled={saving} className="rounded-lg border border-primary px-3 py-2.5 text-xs font-bold text-primary disabled:opacity-40">{saving ? 'Saving…' : 'Save as regression'}</button>}
              <button onClick={startTest} disabled={!selectedAgent} className="rounded-lg bg-primary px-3 py-2.5 text-xs font-bold text-bg disabled:opacity-40"><Icon name="mic" className="mr-1 align-[-3px] text-[16px]" />Start live test</button>
            </div>
          </Card>
        </div>

        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Latest test result</h2>
              <p className="mt-1 text-xs text-text-muted">Automated checks flag measurable behaviour. Grounding and hallucination checks stay review items until evidence can be verified safely.</p>
            </div>
            {latestResult && <Link to={`/dashboard/calls/${latestResult.id}`} className="text-xs font-bold text-primary hover:underline">Open transcript and diagnostics →</Link>}
          </div>
          {waitingForRun && !latestResult ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-high p-4 text-sm"><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />Finalizing the call and running checks…</div>
          ) : runNotice && !latestResult ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber/35 bg-amber/5 p-4 text-sm text-text"><Icon name="schedule" className="text-[20px] text-amber" /><span>{runNotice}</span></div>
          ) : latestResult ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                <span className="font-semibold text-text">{latestResult.testScenarioName || 'Testing Lab run'}</span>
                <span>·</span><span>{latestResult.agent}</span><span>·</span><span>{formatDateTime(latestResult.callDate)}</span><span>·</span>
                <span className="rounded-full bg-primary/10 px-2 py-1 font-semibold text-primary">{latestResult.channel} test</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {checks.map((check) => (
                  <div key={check.label} className="rounded-xl border border-border bg-surface-high/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-text">{check.label}</p>
                      <Icon name={check.ok == null ? 'visibility' : check.ok ? 'check_circle' : 'warning'} className={`text-[17px] ${check.ok == null ? 'text-cyan' : check.ok ? 'text-success' : 'text-amber'}`} />
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-text-muted">{check.value}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Icon name="science" className="text-3xl text-primary" />
              <p className="mt-2 text-sm font-semibold">Run a scenario to create the first result</p>
              <p className="mt-1 text-xs text-text-muted">The result is tied to the real call transcript, diagnostics, latency, and cost.</p>
            </div>
          )}
        </Card>
      </section>

      {activeRun && (
        <BrowserTestModal
          agent={activeRun.agent}
          testContext={{
            runId: activeRun.runId,
            scenarioName: activeRun.scenario.name,
            scenarioId: activeRun.scenario.source === 'saved' ? activeRun.scenario.id : undefined,
            scenarioKey: activeRun.scenario.source === 'builtin' ? activeRun.scenario.key : undefined,
          }}
          onClose={() => {
            setResultRunId(activeRun.runId)
            setWaitingForRun(activeRun.runId)
            setActiveRun(null)
          }}
        />
      )}
    </DashboardLayout>
  )
}
