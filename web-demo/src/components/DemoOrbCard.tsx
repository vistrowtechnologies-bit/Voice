import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LiveKitRoom, RoomAudioRenderer, useConnectionState, useDataChannel, useLocalParticipant, useParticipantAttribute, useRemoteParticipants, useRoomContext, useTrackVolume, useTracks, useTranscriptions } from '@livekit/components-react'
import type { AgentState } from '@livekit/components-react'
import { ConnectionState, Track } from 'livekit-client'
import type { RemoteParticipant } from 'livekit-client'
import { Icon } from './Icon'
import { CONTACT_PHONE } from '../lib/marketingContent'
import { DEMO_CALL_CAP, getRemainingDemoCalls, hasDemoCallsRemaining, recordDemoCall } from '../lib/demoCallCap'
import { fetchLiveKitToken, randomId } from '../lib/livekit'
import type { LeadSummary, TranscriptEntry } from '../lib/types'

type Phase = 'idle' | 'connecting' | 'active' | 'denied' | 'capped'

const STATE_LABELS: Record<string, string> = {
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Agent is speaking…',
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
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
  const navigate = useNavigate()

  const remaining = getRemainingDemoCalls()
  const leadSummaryRef = useRef<LeadSummary>({})
  const transcriptRef = useRef<TranscriptEntry[]>([])

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

  const handleDisconnected = useCallback(() => {
    navigate('/summary', {
      state: { leadSummary: leadSummaryRef.current, transcript: transcriptRef.current },
    })
  }, [navigate])

  const exhausted = phase === 'capped'
  const isCallLive = phase === 'active'

  return (
    <div className="relative w-full max-w-[420px]">
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
            <InlineCallBody
              onLeadUpdate={(partial) => {
                leadSummaryRef.current = { ...leadSummaryRef.current, ...partial }
              }}
              onTranscriptUpdate={(entries) => {
                transcriptRef.current = entries
              }}
            />
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
                <video src="/agent-orb.mp4" autoPlay loop muted playsInline className="h-full w-full object-cover" />
              </span>
              {phase === 'connecting' && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-bg/50">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
                </span>
              )}
            </button>

            <h3 className="font-display text-2xl font-semibold">
              {exhausted ? 'Book a live walkthrough' : phase === 'connecting' ? 'Connecting…' : phase === 'denied' ? 'Mic access blocked' : 'Tap to talk'}
            </h3>
            <p className="mt-1 text-sm text-text-muted">
              {exhausted
                ? 'You’ve used all your free demo calls'
                : phase === 'connecting'
                  ? `Connecting you to Artha…`
                  : phase === 'denied'
                    ? errorMessage
                    : 'Try Artha, no signup required'}
            </p>

            {phase === 'denied' ? (
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
                <p className="mt-1 text-xs text-text">Hindi · Hinglish +28 more</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Low latency</p>
                <p className="mt-1 text-xs text-text">&lt;300ms · emotion-aware</p>
              </div>
            </div>

            <p className="mt-5 text-xs text-text-muted">
              No mic? Dial{' '}
              <a href={`tel:${CONTACT_PHONE.replace(/\s/g, '')}`} className="text-primary hover:underline">
                {CONTACT_PHONE}
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// Rendered inside <LiveKitRoom> once connected — same card, same footprint,
// swapped from the idle "Tap to talk" content to live call state: status,
// a running timer, and mute/end-call controls.
function InlineCallBody({
  onLeadUpdate,
  onTranscriptUpdate,
}: {
  onLeadUpdate: (partial: Partial<LeadSummary>) => void
  onTranscriptUpdate: (entries: TranscriptEntry[]) => void
}) {
  const room = useRoomContext()
  const connectionState = useConnectionState()
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant()
  const remoteParticipants = useRemoteParticipants()
  const agentParticipant = remoteParticipants[0]
  const [startedAt] = useState(() => Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)

  const transcriptions = useTranscriptions()
  const transcriptEntries: TranscriptEntry[] = useMemo(
    () =>
      transcriptions.map((t) => ({
        id: t.streamInfo.id,
        identity: t.participantInfo.identity,
        text: t.text,
        isLocal: t.participantInfo.identity === localParticipant.identity,
      })),
    [transcriptions, localParticipant.identity],
  )

  useEffect(() => {
    onTranscriptUpdate(transcriptEntries)
  }, [transcriptEntries, onTranscriptUpdate])

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) return
    const interval = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000)
    return () => clearInterval(interval)
  }, [connectionState, startedAt])

  useDataChannelLeadUpdates(onLeadUpdate)

  const waitingLabel = connectionState === ConnectionState.Connected ? 'Waiting for agent to join…' : 'Connecting…'

  return (
    <>
      <div className="relative my-6 flex h-48 w-48 items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-primary/20" />
        <span className="absolute inset-5 rounded-full border border-primary/10" />
        {agentParticipant ? (
          <AgentVisual agentParticipant={agentParticipant} />
        ) : (
          <span className="relative h-32 w-32 overflow-hidden rounded-full opacity-45 shadow-[0_0_60px_-5px_rgba(168,85,247,0.6)]">
            <video src="/agent-orb.mp4" autoPlay loop muted playsInline className="h-full w-full object-cover" />
          </span>
        )}
      </div>

      <h3 className="font-display text-2xl font-semibold">
        {agentParticipant ? <AgentStatusLabel agentParticipant={agentParticipant} /> : waitingLabel}
      </h3>

      <div className="mt-5 rounded-xl border border-border bg-bg px-4 py-2 font-mono text-sm text-cyan">
        {formatDuration(elapsedMs)}
      </div>

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
function AgentVisual({ agentParticipant }: { agentParticipant: RemoteParticipant }) {
  const agentTracks = useTracks([Track.Source.Microphone]).filter(
    (t) => t.participant.identity === agentParticipant.identity,
  )
  const volume = useTrackVolume(agentTracks[0])
  const scale = 1 + Math.min(volume, 1) * 0.14
  return (
    <span
      className="relative h-32 w-32 overflow-hidden rounded-full shadow-[0_0_60px_-5px_rgba(168,85,247,0.6)] transition-transform duration-150 ease-out"
      style={{ transform: `scale(${scale})` }}
    >
      <video src="/agent-orb.mp4" autoPlay loop muted playsInline className="h-full w-full object-cover" />
    </span>
  )
}

function AgentStatusLabel({ agentParticipant }: { agentParticipant: RemoteParticipant }) {
  const agentStateRaw = useParticipantAttribute('lk.agent.state', { participant: agentParticipant })
  const agentState = (agentStateRaw || 'initializing') as AgentState
  return <>{STATE_LABELS[agentState] ?? 'On the line…'}</>
}

function useDataChannelLeadUpdates(onLeadUpdate: (partial: Partial<LeadSummary>) => void) {
  useDataChannel('lead-events', (msg) => {
    try {
      const text = new TextDecoder().decode(msg.payload)
      const data = JSON.parse(text) as Record<string, unknown>
      if (data.type === 'lead_update' || data.type === 'platform_lead_update') {
        onLeadUpdate({
          name: data.name as string,
          phone: (data.phone as string) ?? (data.contact as string),
          budget: data.budget as string,
          location: data.location as string,
          timeline: data.timeline as string,
          company: data.company as string,
          useCase: data.use_case as string,
          teamSize: data.team_size as string,
        })
      } else if (data.type === 'site_visit_booked') {
        onLeadUpdate({
          siteVisit: {
            propertyId: data.property_id as string,
            date: data.date as string,
            time: data.time as string,
          },
        })
      }
    } catch {
      // ignore malformed payloads
    }
  })
}
