import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  BarVisualizer,
  useConnectionState,
  useDataChannel,
  useLocalParticipant,
  useParticipantAttribute,
  useRemoteParticipants,
  useRoomContext,
  useTracks,
  useTranscriptions,
} from '@livekit/components-react'
import type { AgentState } from '@livekit/components-react'
import { ConnectionState, Track } from 'livekit-client'
import type { RemoteParticipant } from 'livekit-client'
import { Icon } from './Icon'
import type { LeadSummary, TranscriptEntry } from '../lib/types'

interface ActiveCallUIProps {
  onLeadUpdate: (partial: Partial<LeadSummary>) => void
  onTranscriptUpdate: (entries: TranscriptEntry[]) => void
}

const STATE_STYLES: Record<string, { ring: string; label: string; fg: string }> = {
  listening: { ring: 'border-cyan', label: 'Listening…', fg: '#22D3EE' },
  thinking: { ring: 'border-primary border-dashed', label: 'Thinking…', fg: '#A855F7' },
  speaking: { ring: 'border-magenta', label: 'Riya is speaking…', fg: '#FF3D9A' },
}
const WAITING_STYLE = { ring: 'border-border', label: 'Waiting for Riya to join…', fg: '#9089B0' }

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

// useParticipantAttribute throws if it's ever called with no participant
// available (via useEnsureParticipant), so this can only be mounted once an
// agent participant actually exists — see the conditional render below.
function AgentOrb({ agentParticipant }: { agentParticipant: RemoteParticipant }) {
  const agentStateRaw = useParticipantAttribute('lk.agent.state', { participant: agentParticipant })
  const agentState = (agentStateRaw || 'initializing') as AgentState
  const agentTracks = useTracks([Track.Source.Microphone]).filter(
    (t) => t.participant.identity === agentParticipant.identity,
  )
  const stateStyle = STATE_STYLES[agentState] ?? WAITING_STYLE

  return (
    <div className="flex flex-col items-center gap-3 py-10">
      <div
        className={`flex h-56 w-56 items-center justify-center rounded-full border-4 transition-colors ${stateStyle.ring}`}
        style={{ '--lk-fg': stateStyle.fg } as CSSProperties}
      >
        {agentTracks[0] ? (
          <BarVisualizer state={agentState} track={agentTracks[0]} barCount={7} className="h-20 w-32" />
        ) : (
          <Icon name="mic" className="text-primary text-[40px]" />
        )}
      </div>
      <p className="text-sm text-text-muted">{stateStyle.label}</p>
    </div>
  )
}

export function ActiveCallUI({ onLeadUpdate, onTranscriptUpdate }: ActiveCallUIProps) {
  const room = useRoomContext()
  const connectionState = useConnectionState()
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant()
  const remoteParticipants = useRemoteParticipants()
  const agentParticipant = remoteParticipants[0]
  const [showTranscript, setShowTranscript] = useState(true)
  const [startedAt] = useState(() => Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)
  const transcriptEndRef = useRef<HTMLDivElement>(null)

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
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcriptEntries, onTranscriptUpdate])

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) return
    const interval = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000)
    return () => clearInterval(interval)
  }, [connectionState, startedAt])

  useDataChannel('lead-events', (msg) => {
    try {
      const text = new TextDecoder().decode(msg.payload)
      const data = JSON.parse(text) as Record<string, unknown>
      if (data.type === 'lead_update') {
        onLeadUpdate({
          name: data.name as string,
          phone: data.phone as string,
          budget: data.budget as string,
          location: data.location as string,
          timeline: data.timeline as string,
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

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <span className="h-2 w-2 rounded-full bg-primary" />
          Riya · AI Leasing Agent
        </div>
        <span className="font-mono text-sm text-text-muted">{formatDuration(elapsedMs)}</span>
      </div>

      {agentParticipant ? (
        <AgentOrb agentParticipant={agentParticipant} />
      ) : (
        <div className="flex flex-col items-center gap-3 py-10">
          <div
            className={`flex h-56 w-56 items-center justify-center rounded-full border-4 transition-colors ${WAITING_STYLE.ring}`}
          >
            <Icon name="mic" className="text-primary text-[40px]" />
          </div>
          <p className="text-sm text-text-muted">
            {connectionState === ConnectionState.Connected ? WAITING_STYLE.label : 'Connecting…'}
          </p>
        </div>
      )}

      {showTranscript && (
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 sm:px-6">
          {transcriptEntries.length === 0 && (
            <p className="text-center text-sm text-text-muted">
              Your conversation will appear here as you talk.
            </p>
          )}
          {transcriptEntries.map((entry) => (
            <div
              key={entry.id}
              className={`max-w-[75%] rounded-xl px-4 py-2 text-sm ${
                entry.isLocal
                  ? 'self-end bg-primary text-bg'
                  : 'self-start border border-border bg-surface text-text'
              }`}
            >
              {entry.text}
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>
      )}

      <div className="flex items-center justify-center gap-6 border-t border-border bg-surface px-4 py-4 sm:px-6">
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
        <button
          aria-label="Toggle transcript"
          onClick={() => setShowTranscript((v) => !v)}
          className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${
            showTranscript
              ? 'border-primary text-primary'
              : 'border-border bg-surface-high text-text-muted hover:text-text'
          }`}
        >
          <Icon name="closed_caption" />
        </button>
      </div>
    </div>
  )
}
