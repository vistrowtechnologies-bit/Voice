import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useParticipantAttribute, useRemoteParticipants, useRoomContext, useTrackVolume, useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import type { RemoteParticipant } from 'livekit-client'
import { Icon } from './Icon'
import {
  DEMO_CALL_CAP,
  getDemoCallResetMs,
  getRemainingDemoCalls,
  hasDemoCallsRemaining,
  recordDemoCall,
} from '../lib/demoCallCap'
import { fetchLiveKitToken, randomId } from '../lib/livekit'

type Phase = 'idle' | 'connecting' | 'active' | 'denied' | 'capped' | 'unreachable'

// How long the visitor's browser waits for the AI agent to actually join the
// room after connecting. A healthy dispatch + (cold) worker start is a few
// seconds; if no agent joins within this window the demo worker is genuinely
// unavailable (restarting/crashed/no capacity), so we surface a clean retry
// instead of leaving the visitor staring at a ticking timer over dead air.
const AGENT_JOIN_TIMEOUT_MS = 20_000

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

function formatResetHint(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000))
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000))
  if (hours < 1) return `Free calls refresh in ${Math.max(1, minutes)} min`
  return `Free calls refresh in ${hours}h ${minutes}m`
}

// The recurring "LIVE DEMO" card — tapping the orb starts the call right
// here (no separate confirmation page/route): mic permission is the
// browser's own native prompt, then the same card shows live call state
// (status, timer, mute/end controls) in place of the idle "Tap to talk"
// content. Reused on the homepage hero and every solution/product page.
export function DemoOrbCard() {
  const [phase, setPhase] = useState<Phase>(() => (hasDemoCallsRemaining() ? 'idle' : 'capped'))
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string | null>(null)

  const remaining = getRemainingDemoCalls()

  const handleStart = useCallback(async () => {
    if (!hasDemoCallsRemaining()) {
      setPhase('capped')
      return
    }
    setPhase('connecting')
    setErrorMessage(null)
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      const identity = randomId('visitor')
      const room = randomId('voice-agent-demo')
      const { token: newToken, url } = await fetchLiveKitToken(identity, room)
      recordDemoCall()
      setToken(newToken)
      setServerUrl(url)
      setPhase('active')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setErrorMessage('Mic access is blocked. Enable it in your browser settings to continue.')
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Could not connect. Please try again.')
      }
      setPhase('denied')
    }
  }, [])

  // Ending the call just returns the card to its idle "Tap to talk" state,
  // right here — no separate summary page or route to send the visitor to.
  const handleDisconnected = useCallback(() => {
    setToken(null)
    setServerUrl(null)
    setPhase(hasDemoCallsRemaining() ? 'idle' : 'capped')
  }, [])

  // The browser connected to the room but no AI agent ever joined (worker
  // unavailable). Tear down the connection and show an explicit retry rather
  // than a fake "live call" over dead air — this is what a client saw as a
  // "dead agent" before.
  const handleAgentUnavailable = useCallback(() => {
    setToken(null)
    setServerUrl(null)
    setErrorMessage('Artha didn’t pick up just now — please try again.')
    setPhase('unreachable')
  }, [])

  const exhausted = phase === 'capped'
  const isCallLive = phase === 'active'

  return (
    <div className="relative mx-auto w-full max-w-[420px] lg:mx-0 lg:ml-auto">
      <div className="pointer-events-none absolute -inset-10 rounded-full bg-primary/20 blur-[100px]" />
      <div className="relative flex w-full flex-col items-center rounded-[28px] border border-border bg-surface/80 p-8 text-center backdrop-blur-xl sm:p-10">
        <div className="absolute right-5 top-5 flex items-center gap-1.5 rounded-full border border-border bg-surface-high px-3 py-1">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-cyan">Live demo</span>
        </div>

        {isCallLive && token && serverUrl ? (
          <LiveKitRoom serverUrl={serverUrl} token={token} connect audio onDisconnected={handleDisconnected}>
            <RoomAudioRenderer />
            <InlineCallBody onAgentUnavailable={handleAgentUnavailable} />
          </LiveKitRoom>
        ) : (
          <>
            <button
              type="button"
              onClick={exhausted ? undefined : handleStart}
              disabled={phase === 'connecting'}
              className="group relative my-6 flex h-48 w-48 items-center justify-center disabled:cursor-wait"
            >
              <span className="absolute inset-0 rounded-full border border-primary/20" />
              <span className="absolute inset-5 rounded-full border border-primary/10" />
              <span className="relative h-32 w-32 overflow-hidden rounded-full shadow-[0_0_60px_-5px_rgba(168,85,247,0.6)] transition-transform group-hover:scale-105">
                <video src="/agent-orb.mp4" autoPlay loop muted playsInline className="h-full w-full scale-150 object-cover" />
              </span>
              {phase === 'connecting' && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-bg/50">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
                </span>
              )}
            </button>

            <h3 className="font-display text-2xl font-semibold">
              {exhausted
                ? 'Book a live walkthrough'
                : phase === 'connecting'
                  ? 'Connecting…'
                  : phase === 'denied'
                    ? 'Mic access blocked'
                    : phase === 'unreachable'
                      ? 'Couldn’t reach Artha'
                      : 'Tap to talk'}
            </h3>
            <p className="mt-1 text-sm text-text-muted">
              {exhausted
                ? 'You’ve used all your free demo calls'
                : phase === 'connecting'
                  ? `Connecting you to Artha…`
                  : phase === 'denied' || phase === 'unreachable'
                    ? errorMessage
                    : 'Try Artha, no signup required'}
            </p>

            {phase === 'denied' || phase === 'unreachable' ? (
              <button
                type="button"
                onClick={handleStart}
                className="mt-5 rounded-full bg-primary px-5 py-2 text-xs font-bold text-bg transition-opacity hover:opacity-90"
              >
                Try Again
              </button>
            ) : (
              <div className="mt-5 rounded-xl border border-border bg-bg px-4 py-2 text-sm">
                <span className="font-bold text-cyan">{remaining}/{DEMO_CALL_CAP}</span>{' '}
                <span className="text-text-muted">free calls left</span>
              </div>
            )}

            {exhausted && (
              <p className="mt-2 text-xs text-text-muted">{formatResetHint(getDemoCallResetMs())}</p>
            )}

            {exhausted && (
              <Link
                to="/contact"
                className="mt-4 rounded-full bg-primary px-5 py-2 text-xs font-bold text-bg transition-opacity hover:opacity-90"
              >
                Book a demo
              </Link>
            )}

            <div className="mt-6 grid w-full grid-cols-2 gap-4 border-t border-border pt-5 text-left">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Native support</p>
                <p className="mt-1 text-xs text-text">Hindi · Hinglish +8 more</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Low latency</p>
                <p className="mt-1 text-xs text-text">Real-time · emotion-aware</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Rendered inside <LiveKitRoom> once connected — same card, same footprint,
// swapped from the idle "Tap to talk" content to live call state: a running
// timer and mute/end-call controls. No "Listening…/Thinking…/Speaking…"
// status text — it read as distracting chatter rather than useful signal.
function InlineCallBody({ onAgentUnavailable }: { onAgentUnavailable: () => void }) {
  const room = useRoomContext()
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant()
  const remoteParticipants = useRemoteParticipants()
  const agentParticipant = remoteParticipants[0]
  const agentJoined = !!agentParticipant
  // Timer starts when the AGENT joins, not when the browser connects to the
  // room — otherwise a call that never got an agent still showed a ticking
  // "live" timer against silence, which read as a broken/dead agent.
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (agentJoined && startedAt === null) setStartedAt(Date.now())
  }, [agentJoined, startedAt])

  useEffect(() => {
    if (startedAt === null) return
    const interval = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  // If no agent joins within the timeout, the demo worker is unavailable —
  // bail out to an explicit retry instead of holding the visitor on a silent
  // dead call.
  useEffect(() => {
    if (agentJoined) return
    const timer = setTimeout(onAgentUnavailable, AGENT_JOIN_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [agentJoined, onAgentUnavailable])

  return (
    <>
      <div className="relative my-6 flex h-48 w-48 items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-primary/20" />
        <span className="absolute inset-5 rounded-full border border-primary/10" />
        {agentParticipant ? (
          <AgentVisual agentParticipant={agentParticipant} />
        ) : (
          <span className="relative h-32 w-32 overflow-hidden rounded-full opacity-45 shadow-[0_0_60px_-5px_rgba(168,85,247,0.6)]">
            <video src="/agent-orb.mp4" autoPlay loop muted playsInline className="h-full w-full scale-150 object-cover" />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-bg/40">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
            </span>
          </span>
        )}
      </div>

      {agentJoined ? (
        <div className="mt-5 rounded-xl border border-border bg-bg px-4 py-2 font-mono text-sm text-cyan">
          {formatDuration(elapsedMs)}
        </div>
      ) : (
        <p className="mt-5 text-sm text-text-muted">Connecting to Artha…</p>
      )}

      <div className="mt-6 flex w-full items-center justify-center gap-4 border-t border-border pt-5">
        <button
          aria-label={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
          onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-high text-text-muted transition-colors hover:text-text"
        >
          <Icon name={isMicrophoneEnabled ? 'mic' : 'mic_off'} />
        </button>
        <button
          aria-label="End call"
          onClick={() => room.disconnect()}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive text-white transition-opacity hover:opacity-90"
        >
          <Icon name="call_end" className="text-[24px]" />
        </button>
      </div>
    </>
  )
}

// useParticipantAttribute throws if called before an agent participant
// exists, so these only ever mount once InlineCallBody has confirmed
// agentParticipant is defined — mirrors ActiveCallUI's AgentOrb pattern.
// Video's ring animation spins at this rate while the agent is actively
// speaking (vs. 1x its authored speed the rest of the time) — matches
// ActiveCallUI.tsx's SPEAKING_PLAYBACK_RATE.
const SPEAKING_PLAYBACK_RATE = 2.2

function AgentVisual({ agentParticipant }: { agentParticipant: RemoteParticipant }) {
  const agentTracks = useTracks([Track.Source.Microphone]).filter(
    (t) => t.participant.identity === agentParticipant.identity,
  )
  const volume = useTrackVolume(agentTracks[0])
  const agentState = useParticipantAttribute('lk.agent.state', { participant: agentParticipant })
  const scale = 1 + Math.min(volume, 1) * 0.14
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = agentState === 'speaking' ? SPEAKING_PLAYBACK_RATE : 1
  }, [agentState])

  return (
    <span
      className="relative h-32 w-32 overflow-hidden rounded-full shadow-[0_0_60px_-5px_rgba(168,85,247,0.6)] transition-transform duration-150 ease-out"
      style={{ transform: `scale(${scale})` }}
    >
      <video ref={videoRef} src="/agent-orb.mp4" autoPlay loop muted playsInline className="h-full w-full scale-150 object-cover" />
    </span>
  )
}

