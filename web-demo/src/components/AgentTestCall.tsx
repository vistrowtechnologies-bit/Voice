import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react'
import { ActiveCallUI } from './ActiveCallUI'
import { Icon } from './Icon'
import { placeTestCall } from '../lib/api'
import { fetchLiveKitToken, randomId } from '../lib/livekit'
import { isE164 } from '../lib/phone'
import type { AgentConfig } from '../lib/types'

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text">
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Places a real outbound call, through this agent's assigned EnableX number,
 * to a number the operator types in — reuses the same placeTestCall flow
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
  const [placing, setPlacing] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const runTest = async () => {
    const target = to.trim()
    if (!target || !fromNumber) return
    if (!isE164(target)) {
      setResult('✕ Enter the number in full international format, starting with + and the country code (e.g. +919812345678).')
      return
    }
    setPlacing(true)
    setResult(null)
    try {
      const res = await placeTestCall(fromNumber, target)
      setResult(res.ok ? '✓ EnableX accepted the call — the destination should ring shortly.' : `✕ ${res.error}`)
    } catch {
      setResult('✕ Request failed — is the backend running?')
    } finally {
      setPlacing(false)
    }
  }

  return (
    <ModalShell title={`Call test — ${agent.name}`} onClose={onClose}>
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
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="+919812345678"
            className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
          />
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

/** Embedded, in-dashboard version of the public browser-call demo — talks to
 * THIS specific agent (via the token endpoint's agentId → room metadata),
 * not just whichever agent is first/live. */
export function BrowserTestModal({ agent, onClose }: { agent: AgentConfig; onClose: () => void }) {
  const [phase, setPhase] = useState<'connecting' | 'active' | 'error'>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true })
        const identity = randomId('operator')
        const room = randomId(`test-agent-${agent.id}`)
        const { token: newToken, url } = await fetchLiveKitToken(identity, room, agent.id)
        if (cancelled) return
        setToken(newToken)
        setServerUrl(url)
        setPhase('active')
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not connect.')
        setPhase('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [agent.id])

  if (phase === 'error') {
    return (
      <ModalShell title={`Browser test — ${agent.name}`} onClose={onClose}>
        <p className="text-sm text-destructive">{error ?? 'Could not connect.'}</p>
      </ModalShell>
    )
  }

  if (phase === 'connecting') {
    return (
      <ModalShell title={`Browser test — ${agent.name}`} onClose={onClose}>
        <div className="flex items-center gap-3 py-2 text-sm text-cyan">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
          Connecting…
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
          agentLabel={`${agent.name} · Test Call`}
          onLeadUpdate={() => {}}
          onTranscriptUpdate={() => {}}
        />
      </LiveKitRoom>
    </div>
  )
}
