import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useConnectionState,
  useDataChannel,
  useLocalParticipant,
  useParticipantAttribute,
  useRemoteParticipants,
  useRoomContext,
  useTrackVolume,
  useTracks,
  useTranscriptions,
} from '@livekit/components-react'
import type { AgentState } from '@livekit/components-react'
import { ConnectionState, Track } from 'livekit-client'
import type { RemoteParticipant } from 'livekit-client'
import { Icon } from './Icon'
import { BRAND } from '../lib/brand'
import type { LeadSummary, TranscriptEntry } from '../lib/types'

interface ActiveCallUIProps {
  onLeadUpdate: (partial: Partial<LeadSummary>) => void
  onTranscriptUpdate: (entries: TranscriptEntry[]) => void
  agentLabel?: string
}

const STATE_STYLES: Record<string, { label: string }> = {
  listening: { label: 'Listening…' },
  thinking: { label: 'Thinking…' },
  speaking: { label: 'Agent is speaking…' },
}
const WAITING_STYLE = { label: 'Waiting for agent to join…' }
// How long to wait before adding a "this is slow" hint under the plain
// waiting label - a worker restart (crash, redeploy, LiveKit Cloud
// recycling the node) can take 10-15s to cold-boot and pick up the job, and
// without this the screen looks identical whether it's about to recover or
// genuinely stuck, which is exactly what prompted "is it dead?" questions.
const SLOW_JOIN_HINT_MS = 12_000

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

// The video's own ring animation plays at this rate while the agent is
// actively speaking, vs. 1x (its authored speed) the rest of the time - the
// ring is designed to visibly spin faster as a "talking" cue.
const SPEAKING_PLAYBACK_RATE = 2.2

// Looping abstract orb animation used as the agent's visual - its scale
// reacts in real time to the agent's mic track volume, so it reads as
// "alive" rather than a static clip. scale-150 crops in tighter on the
// source video's bright ring/core, since the raw footage has a lot of black
// margin around it that otherwise reads as dead space inside the circle.
function OrbVideo({ volume, dimmed, speaking }: { volume: number; dimmed?: boolean; speaking?: boolean }) {
  const scale = 1 + Math.min(volume, 1) * 0.14
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speaking ? SPEAKING_PLAYBACK_RATE : 1
  }, [speaking])

  return (
    <div
      className="relative h-72 w-72 overflow-hidden rounded-full transition-transform duration-150 ease-out sm:h-[26rem] sm:w-[26rem]"
      style={{
        transform: `scale(${scale})`,
        opacity: dimmed ? 0.45 : 1,
      }}
    >
      <video
        ref={videoRef}
        src="/agent-orb.mp4"
        autoPlay
        loop
        muted
        playsInline
        className="h-full w-full scale-150 object-cover"
      />
    </div>
  )
}

// useParticipantAttribute throws if it's ever called with no participant
// available (via useEnsureParticipant), so this can only be mounted once an
// agent participant actually exists - see the conditional render below.
function AgentOrb({ agentParticipant }: { agentParticipant: RemoteParticipant }) {
  const agentStateRaw = useParticipantAttribute('lk.agent.state', { participant: agentParticipant })
  const agentState = (agentStateRaw || 'initializing') as AgentState
  const agentTracks = useTracks([Track.Source.Microphone]).filter(
    (t) => t.participant.identity === agentParticipant.identity,
  )
  const volume = useTrackVolume(agentTracks[0])
  const stateStyle = STATE_STYLES[agentState] ?? WAITING_STYLE

  return (
    <div className="flex flex-col items-center gap-4">
      <OrbVideo volume={volume} speaking={agentState === 'speaking'} />
      <p className="text-sm text-text-muted">{stateStyle.label}</p>
    </div>
  )
}

export function ActiveCallUI({
  onLeadUpdate,
  onTranscriptUpdate,
  agentLabel = `${BRAND.defaultAgentName} · ${BRAND.name} Assistant`,
}: ActiveCallUIProps) {
  const room = useRoomContext()
  const connectionState = useConnectionState()
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant()
  const remoteParticipants = useRemoteParticipants()
  const agentParticipant = remoteParticipants[0]
  const [showTranscript, setShowTranscript] = useState(true)
  const [startedAt] = useState(() => Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)
  const [slowJoin, setSlowJoin] = useState(false)
  const [textInput, setTextInput] = useState('')
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  // LiveKit's own RoomInputOptions has text input enabled by default
  // (livekit.agents.voice.room_io — text_enabled is only ever turned off,
  // never explicitly turned on, in agent/main.py) and its default
  // text_input_cb feeds this straight into session.generate_reply(), the
  // same path a transcribed voice turn takes — so typing here talks to the
  // real agent, not a separate chatbot. It does NOT show up via
  // useTranscriptions below, though: that hook only listens on the
  // "lk.transcription" topic (voice-to-text), while sendText publishes on
  // the separate "lk.chat" topic — so a typed message reached and was
  // answered by the agent but never appeared as a bubble here. Echo it
  // into sentTexts locally instead of relying on the SDK to reflect it back.
  const [sentTexts, setSentTexts] = useState<{ id: string; text: string }[]>([])

  const handleSendText = () => {
    const value = textInput.trim()
    if (!value) return
    localParticipant.sendText(value, { topic: 'lk.chat' }).catch(() => {
      // Best-effort — a failed send just leaves the caller's draft in the
      // box to retry, same as a dropped mic packet would.
    })
    setSentTexts((prev) => [...prev, { id: `local-text-${prev.length}-${value.slice(0, 20)}`, text: value }])
    setTextInput('')
  }

  const transcriptions = useTranscriptions()
  // Sequence local text sends and live transcription events into a single
  // stable order (append-order, since neither source carries a timestamp)
  // so a typed message lands where it was actually sent relative to the
  // rest of the conversation, not always trailing behind it.
  const seqRef = useRef(new Map<string, number>())
  const nextSeqRef = useRef(0)
  const seqFor = (id: string) => {
    let seq = seqRef.current.get(id)
    if (seq === undefined) {
      seq = nextSeqRef.current++
      seqRef.current.set(id, seq)
    }
    return seq
  }
  const transcriptEntries: TranscriptEntry[] = useMemo(() => {
    const fromVoice = transcriptions.map((t) => ({
      id: t.streamInfo.id,
      identity: t.participantInfo.identity,
      text: t.text,
      isLocal: t.participantInfo.identity === localParticipant.identity,
    }))
    const fromTyped = sentTexts.map((t) => ({
      id: t.id,
      identity: localParticipant.identity,
      text: t.text,
      isLocal: true,
    }))
    return [...fromVoice, ...fromTyped].sort((a, b) => seqFor(a.id) - seqFor(b.id))
  }, [transcriptions, sentTexts, localParticipant.identity])

  useEffect(() => {
    onTranscriptUpdate(transcriptEntries)
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcriptEntries, onTranscriptUpdate])

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) return
    const interval = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000)
    return () => clearInterval(interval)
  }, [connectionState, startedAt])

  // Surface a "this is slower than usual" hint once the wait crosses the
  // threshold, instead of leaving a bare "Waiting for agent to join…" that
  // reads identically whether the worker is about to recover or truly dead.
  useEffect(() => {
    if (agentParticipant) {
      setSlowJoin(false)
      return
    }
    const timer = setTimeout(() => setSlowJoin(true), SLOW_JOIN_HINT_MS)
    return () => clearTimeout(timer)
  }, [agentParticipant])

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
            property_id: data.property_id as string,
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
    <div className="flex h-screen flex-col overflow-hidden bg-bg text-text">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <span className="h-2 w-2 rounded-full bg-primary" />
          {agentLabel}
        </div>
        <span className="font-mono text-sm text-text-muted">{formatDuration(elapsedMs)}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden sm:flex-row">
        <div className="flex shrink-0 items-center justify-center border-b border-border py-6 sm:w-[42%] sm:border-b-0 sm:border-r sm:py-0">
          {agentParticipant ? (
            <AgentOrb agentParticipant={agentParticipant} />
          ) : (
            <div className="flex flex-col items-center gap-2 text-center">
              <OrbVideo volume={0} dimmed />
              <p className="text-sm text-text-muted">
                {connectionState === ConnectionState.Connected ? WAITING_STYLE.label : 'Connecting…'}
              </p>
              {slowJoin && connectionState === ConnectionState.Connected && (
                <p className="max-w-[220px] text-xs text-text-muted">
                  Taking longer than usual - the agent worker may be restarting. You can keep waiting or end the call and try again shortly.
                </p>
              )}
            </div>
          )}
        </div>

        {showTranscript && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-6">
            {transcriptEntries.length === 0 && (
              <p className="text-center text-sm text-text-muted">
                Your conversation will appear here as you talk.
              </p>
            )}
            {transcriptEntries.map((entry) => (
              <div
                key={entry.id}
                className={`max-w-[85%] rounded-xl px-4 py-2 text-sm ${
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
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-border bg-surface px-4 py-3 sm:px-6">
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSendText()
            }
          }}
          placeholder="Or type here instead…"
          className="flex-1 rounded-full border border-border bg-surface-high px-4 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          aria-label="Send message"
          onClick={handleSendText}
          disabled={!textInput.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-bg disabled:opacity-40"
        >
          <Icon name="send" className="text-[18px]" />
        </button>
      </div>

      <div className="flex shrink-0 items-center justify-center gap-6 border-t border-border bg-surface px-4 py-4 sm:px-6">
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
