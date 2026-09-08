import { useCallback, useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react'
import { ActiveCallUI } from './ActiveCallUI'
import { OrchestratorTestCallUI } from './OrchestratorTestCallUI'
import { Icon } from './Icon'
import { fetchOrchestratorBrowserToken, placeTestCall } from '../lib/api'
import { fetchLiveKitToken, randomId } from '../lib/livekit'
import { COMMON_DIAL_CODES, composeE164, isE164 } from '../lib/phone'
import type { AgentConfig } from '../lib/types'

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const titleId = useId()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-high hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Places a real outbound call, through this agent's assigned EnableX number,
 * to a number the operator types in - reuses the same placeTestCall flow
 * already on the Phone Numbers page. */
export function DialTestModal({
  agent,
  fromNumber,
  onClose,
}: {
  agent: AgentConfig
  fromNumber: string | null
  onClose: () => void
}) {
  const [to, setTo] = useState('')
  const [dialCode, setDialCode] = useState('+91')
  const [placing, setPlacing] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const runTest = async () => {
    const target = composeE164(dialCode, to)
    if (!target || !fromNumber) return
    if (!isE164(target)) {
      setResult('✕ Enter a valid phone number for the selected country code.')
      return
    }
    setPlacing(true)
    setResult(null)
    try {
      const res = await placeTestCall(fromNumber, target)
      setResult(res.ok ? '✓ Call started successfully.' : `✕ ${res.error}`)
    } catch {
      setResult('✕ Request failed - is the backend running?')
    } finally {
      setPlacing(false)
    }
  }

  return (
    <ModalShell title={`Call test - ${agent.name}`} onClose={onClose}>
      {!fromNumber ? (
        <div className="flex flex-col gap-3 text-sm text-text-muted">
          <p>No phone number is assigned to {agent.name} yet, so there's nothing to call from.</p>
          <Link to="/dashboard/numbers" className="font-bold text-cyan hover:underline">
            Assign a number on the Phone Numbers page →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-text-muted">
            Places a real call from <span className="font-mono text-text">{fromNumber}</span> to the number below.
          </p>
          <label htmlFor="agent-test-phone" className="text-xs font-medium text-text-muted">Destination number</label>
          <div className="flex gap-2">
            <select
              value={dialCode}
              onChange={(e) => setDialCode(e.target.value)}
              aria-label="Country dial code"
              className="rounded-lg border border-border bg-surface-high px-2 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            >
              {COMMON_DIAL_CODES.map((country) => (
                <option key={country.code} value={country.dial}>{country.code} {country.dial}</option>
              ))}
            </select>
            <input
              id="agent-test-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="98765 43210"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <button
            onClick={runTest}
            disabled={placing || !to.trim()}
            className="rounded-lg bg-primary py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-40"
          >
            {placing ? 'Placing…' : 'Place call'}
          </button>
          {result && (
            <p className={`text-xs ${result.startsWith('✓') ? 'text-cyan' : 'text-destructive'}`}>{result}</p>
          )}
        </div>
      )}
    </ModalShell>
  )
}

/** Embedded, in-dashboard version of the public browser-call demo - talks to
 * THIS specific agent (via the token endpoint's agentId → room metadata),
 * not just whichever agent is first/live. */
export function BrowserTestModal({
  agent,
  onClose,
  testContext,
}: {
  agent: AgentConfig
  onClose: () => void
  testContext?: { runId: string; scenarioId?: number; scenarioKey?: string; scenarioName: string }
}) {
  const [phase, setPhase] = useState<'checking' | 'connecting' | 'active' | 'error'>('checking')
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const [useOrchestrator, setUseOrchestrator] = useState(false)
  // Lab runs must use LiveKit today because their correlation metadata is
  // stored on the room and written into the durable call row by that worker.
  // The ordinary quick-test button keeps its existing orchestrator-first flow.
  const [forceLiveKit, setForceLiveKit] = useState(() => Boolean(testContext))
  const [status, setStatus] = useState('Checking the fastest available call route')
  const [retryNonce, setRetryNonce] = useState(0)
  const diagnosticId = useState(() => `VV-${Date.now().toString(36).toUpperCase().slice(-6)}`)[0]

  const handleOrchestratorConnectionError = useCallback(() => {
    // The orchestrator token endpoint can be reachable server-to-server
    // while its public WebSocket hostname is blocked or unavailable from
    // the operator's network. Fall back to LiveKit with the same agent ID
    // instead of leaving the test call on a generic connection error.
    setUseOrchestrator(false)
    setPhase('connecting')
    setStatus('Primary route unavailable — switching safely to LiveKit')
    setForceLiveKit(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Accounts on the orchestrator pipeline (Phase 3 of the LiveKit-
      // removal plan) get routed there instead - everyone else falls
      // through to the existing LiveKit room flow below unchanged.
      if (!forceLiveKit) {
        setStatus('Checking the fastest available call route')
        try {
          const orch = await fetchOrchestratorBrowserToken(agent.id)
          if (cancelled) return
          if (orch.ok) {
            setStatus('Connected')
            setUseOrchestrator(true)
            setPhase('active')
            return
          }
        } catch {
          // fall through to LiveKit
        }
      }
      if (cancelled) return
      setPhase('connecting')
      try {
        setStatus('Requesting microphone access')
        const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        permissionStream.getTracks().forEach((track) => track.stop())
        setStatus('Preparing agent and secure call room')
        const identity = randomId('operator')
        const room = randomId(`${testContext ? 'test-lab' : 'test-agent'}-${agent.id}`)
        const { token: newToken, url } = await fetchLiveKitToken(
          identity,
          room,
          agent.id,
          undefined,
          undefined,
          testContext
            ? { runId: testContext.runId, scenarioId: testContext.scenarioId, scenarioKey: testContext.scenarioKey }
            : undefined,
        )
        if (cancelled) return
        setToken(newToken)
        setServerUrl(url)
        setStatus('Agent prepared — joining call')
        setPhase('active')
      } catch (err) {
        if (cancelled) return
        const raw = err instanceof Error ? err.message : ''
        const message = /NotAllowed|Permission|denied/i.test(raw)
          ? 'Microphone access is blocked. Allow microphone access in your browser, then retry.'
          : /network|fetch|failed/i.test(raw)
            ? 'The call service could not be reached. Check your connection and retry.'
            : 'The agent could not start this test call. Retry once, then share the reference below with support.'
        setError(message)
        setPhase('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [agent.id, forceLiveKit, retryNonce, testContext])

  if (useOrchestrator && phase === 'active') {
    return (
      <OrchestratorTestCallUI
        agentId={agent.id}
        agentLabel={`${agent.name} · Test Call`}
        onClose={onClose}
        onConnectionError={handleOrchestratorConnectionError}
      />
    )
  }

  if (phase === 'error') {
    return (
      <ModalShell title={`${testContext ? testContext.scenarioName : 'Browser test'} - ${agent.name}`} onClose={onClose}>
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-sm font-semibold text-destructive">Couldn’t start the conversation</p>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">{error ?? 'Could not connect.'}</p>
            <p className="mt-2 font-mono text-[10px] text-text-muted">Reference: {diagnosticId}</p>
          </div>
          <button
            onClick={() => {
              setError(null)
              setToken(null)
              setServerUrl(null)
              setUseOrchestrator(false)
              setForceLiveKit(Boolean(testContext))
              setPhase('checking')
              setRetryNonce((value) => value + 1)
            }}
            className="rounded-lg bg-primary py-2 text-sm font-bold text-bg transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            Retry test
          </button>
        </div>
      </ModalShell>
    )
  }

  if (phase === 'checking' || phase === 'connecting') {
    return (
      <ModalShell title={`${testContext ? testContext.scenarioName : 'Browser test'} - ${agent.name}`} onClose={onClose}>
        <div className="flex items-center gap-3 py-2 text-sm text-cyan">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
          <span><span className="block font-semibold">{status}</span><span className="mt-0.5 block text-[11px] text-text-muted">This usually takes a few seconds.</span></span>
        </div>
      </ModalShell>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-bg">
      <LiveKitRoom
        serverUrl={serverUrl ?? undefined}
        token={token ?? undefined}
        connect
        audio
        onDisconnected={onClose}
      >
        <RoomAudioRenderer />
        <ActiveCallUI
          agentLabel={`${agent.name} · ${testContext?.scenarioName ?? 'Test Call'}`}
          onLeadUpdate={() => {}}
          onTranscriptUpdate={() => {}}
        />
      </LiveKitRoom>
    </div>
  )
}
