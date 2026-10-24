import { useEffect, useRef, useState } from 'react'
import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useParticipantAttribute, useRemoteParticipants, useRoomContext, useTrackVolume, useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import type { RemoteParticipant } from 'livekit-client'
import { Icon } from './Icon'
import { AGENT_JOIN_TIMEOUT_MS, AGENT_READY_TIMEOUT_MS, DemoCardFooter, MAX_CALL_MS, SPEAKING_PLAYBACK_RATE, STATE_LABELS, WAITING_LABEL } from './DemoOrbCard'

// The live LiveKit part of DemoOrbCard, split out so the LiveKit client is
// downloaded on the first call instead of with every marketing page.
export function DemoOrbLiveRoom({ serverUrl, token, onDisconnected, onError, onAgentUnavailable, onConnected }: {
  serverUrl: string
  token: string
  onDisconnected: () => void
  onError: (error: Error) => void
  onAgentUnavailable: () => void
  onConnected: () => void
}) {
  return (
    // className="contents" - LiveKitRoom renders its own wrapping div
    // with no flex styling, which broke the card's `flex flex-col
    // items-center` centering for InlineCallBody's fixed-width w-48
    // orb (w-full children like the footer/button row still looked
    // fine since they just stretch to fill it). display:contents
    // removes that wrapper from layout entirely so InlineCallBody's
    // children are centered as if they were direct children of the
    // card again.
    <LiveKitRoom
      className="contents"
      serverUrl={serverUrl}
      token={token}
      connect
      audio
      onDisconnected={onDisconnected}
      onError={onError}
    >
      <RoomAudioRenderer />
      <InlineCallBody onAgentUnavailable={onAgentUnavailable} onConnected={onConnected} />
    </LiveKitRoom>
  )
}

// Rendered inside <LiveKitRoom> once connected - same card, same footprint,
// swapped from the idle "Tap to talk" content to live call state: a running
// timer and mute/end-call controls. No "Listening…/Thinking…/Speaking…"
// status text - it read as distracting chatter rather than useful signal.
// Joined-but-never-ready watchdog: without it a call whose agent crashed after
// joining sat on "Connecting..." until the visitor gave up (5 Oct 2026).
function AgentReadyWatchdog({ agentParticipant, onUnavailable }: { agentParticipant: RemoteParticipant; onUnavailable: () => void }) {
  const agentState = useParticipantAttribute('lk.agent.state', { participant: agentParticipant })
  useEffect(() => {
    if (agentState) return
    const timer = setTimeout(onUnavailable, AGENT_READY_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [agentState, onUnavailable])
  return null
}

function InlineCallBody({ onAgentUnavailable, onConnected }: { onAgentUnavailable: () => void; onConnected: () => void }) {
  const room = useRoomContext()
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant()
  const remoteParticipants = useRemoteParticipants()
  const agentParticipant = remoteParticipants[0]
  const agentJoined = !!agentParticipant

  useEffect(() => {
    if (agentJoined) onConnected()
  }, [agentJoined, onConnected])
  // Timer starts when the AGENT joins, not when the browser connects to the
  // room - otherwise a call that never got an agent still showed a ticking
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

  // If no agent joins within the timeout, the demo worker is unavailable -
  // bail out to an explicit retry instead of holding the visitor on a silent
  // dead call.
  useEffect(() => {
    if (agentJoined) return
    const timer = setTimeout(onAgentUnavailable, AGENT_JOIN_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [agentJoined, onAgentUnavailable])

  // Hard cap enforced silently - no visible countdown, see MAX_CALL_MS.
  useEffect(() => {
    if (elapsedMs >= MAX_CALL_MS) room.disconnect()
  }, [elapsedMs, room])

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

      {agentJoined && <AgentReadyWatchdog agentParticipant={agentParticipant} onUnavailable={onAgentUnavailable} />}
      {agentJoined ? (
        <AgentStateLabel agentParticipant={agentParticipant} />
      ) : (
        <p className="mt-5 text-sm text-text-muted">Connecting to Artha…</p>
      )}

      <div className="mt-6 flex w-full items-center justify-center gap-4">
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

      <DemoCardFooter />
    </>
  )
}

// useParticipantAttribute throws if called before an agent participant
// exists, so these only ever mount once InlineCallBody has confirmed
// agentParticipant is defined - mirrors ActiveCallUI's AgentOrb pattern.
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

// Separate component (not folded into AgentVisual) purely so InlineCallBody
// can place it below the mic/end-call row's divider instead of right under
// the orb - same gating rule applies: only mount once agentParticipant exists.
function AgentStateLabel({ agentParticipant }: { agentParticipant: RemoteParticipant }) {
  const agentState = useParticipantAttribute('lk.agent.state', { participant: agentParticipant })
  return <p className="mt-5 text-sm text-text-muted">{STATE_LABELS[agentState ?? ''] ?? WAITING_LABEL}</p>
}
