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
import { TranscriptOrder } from '../lib/transcriptOrder'
import { BRAND } from '../lib/brand'
import type { LeadSummary, TranscriptEntry } from '../lib/types'

interface ActiveCallUIProps {
  onLeadUpdate: (partial: Partial<LeadSummary>) => void
  onTranscriptUpdate: (entries: TranscriptEntry[]) => void
  agentLabel?: string
  /** The agent's own name, for the status line and transcript labels. */
  agentName?: string
}

const STATE_STYLES: Record<string, { label: string; hint: string }> = {
  listening: { label: 'Listening', hint: 'Your turn - speak naturally, in any language.' },
  thinking: { label: 'Thinking…', hint: 'Working out the reply.' },
  speaking: { label: 'Speaking', hint: 'You can interrupt at any time.' },
}
const WAITING_STYLE = { label: 'Waiting for agent to join…', hint: 'This usually takes a few seconds.' }
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
    <div className="relative">
      {/* Halo rings ripple out while the agent talks. */}
      {speaking && (
        <>
          <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full border-2 border-primary/40 [animation-duration:1.6s]" />
          <span aria-hidden="true" className="absolute -inset-3 animate-ping rounded-full border border-primary/25 [animation-delay:0.5s] [animation-duration:1.6s]" />
        </>
      )}
    <div
      className="relative h-44 w-44 overflow-hidden rounded-full shadow-[0_18px_50px_-12px_rgb(168_85_247/0.7)] ring-4 ring-white/70 transition-transform duration-150 ease-out sm:h-56 sm:w-56"
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
    </div>
  )
}

// useParticipantAttribute throws if it's ever called with no participant
// available (via useEnsureParticipant), so this can only be mounted once an
// agent participant actually exists - see the conditional render below.
function AgentOrb({ agentParticipant, agentName }: { agentParticipant: RemoteParticipant; agentName: string }) {
  const agentStateRaw = useParticipantAttribute('lk.agent.state', { participant: agentParticipant })
  const agentState = (agentStateRaw || 'initializing') as AgentState
  const agentTracks = useTracks([Track.Source.Microphone]).filter(
    (t) => t.participant.identity === agentParticipant.identity,
  )
  const volume = useTrackVolume(agentTracks[0])
  const stateStyle = STATE_STYLES[agentState] ?? WAITING_STYLE

  return (
    <div className="flex flex-col items-center gap-5">
      <OrbVideo volume={volume} speaking={agentState === 'speaking'} />
      <CallStatus
        label={agentState === 'speaking' ? `${agentName} is speaking` : stateStyle.label}
        hint={stateStyle.hint}
        live={agentState === 'listening' || agentState === 'speaking'}
      />
    </div>
  )
}

function CallStatus({ label, hint, live }: { label: string; hint: string; live: boolean }) {
  return (
    <div className="text-center" role="status">
      <p className="flex items-center justify-center gap-2 font-display text-xl font-bold">
        <span className={`h-2.5 w-2.5 rounded-full ${live ? 'animate-pulse bg-success' : 'bg-text-muted'}`} />
        {label}
      </p>
      <p className="mt-1 text-sm text-text-muted">{hint}</p>
    </div>
  )
}

export function ActiveCallUI({
  onLeadUpdate,
  onTranscriptUpdate,
  agentLabel = `${BRAND.defaultAgentName} · ${BRAND.name} Assistant`,
  agentName = BRAND.defaultAgentName,
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
  const [sentTexts, setSentTexts] = useState<{ id: string; text: string; timestamp: number }[]>([])

  const handleSendText = () => {
    const value = textInput.trim()
    if (!value) return
    localParticipant.sendText(value, { topic: 'lk.chat' }).catch(() => {
      // Best-effort — a failed send just leaves the caller's draft in the
      // box to retry, same as a dropped mic packet would.
    })
    setSentTexts((prev) => [...prev, { id: `local-text-${prev.length}-${value.slice(0, 20)}`, text: value, timestamp: Date.now() }])
    setTextInput('')
  }

  const transcriptions = useTranscriptions()
  // Caption chunks may arrive after newer turns. Use the stream header time,
  // retaining each entry's position when its partial text is updated.
  const transcriptOrder = useRef(new TranscriptOrder())
  const transcriptEntries: TranscriptEntry[] = useMemo(() => {
    const fromVoice = transcriptions.map((t) => ({
      id: t.streamInfo.id,
      timestamp: t.streamInfo.timestamp,
      identity: t.participantInfo.identity,
      text: t.text,
      isLocal: t.participantInfo.identity === localParticipant.identity,
    }))
    const fromTyped = sentTexts.map((t) => ({
      id: t.id,
      timestamp: t.timestamp,
      identity: localParticipant.identity,
      text: t.text,
      isLocal: true,
    }))
    const entries = [...fromVoice, ...fromTyped]
    return transcriptOrder.current.sort(entries)
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

  const [title, subtitle] = agentLabel.split(' · ')
  const controlCls = 'flex flex-col items-center gap-1.5 text-xs font-semibold text-text-muted'
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg text-text">
      {/* Floating helpers (dashboard help bubble, website widget) would sit
          over the call controls, so they are hidden while a call is on. */}
      <style>{'.vv-help-root,#vistrow-voice-widget-host{display:none!important}'}</style>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#c026d3] font-display text-xs font-extrabold text-white">
            {agentName.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-bold">{title}</p>
            {subtitle && <p className="truncate text-xs text-text-muted">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5">
          <span className={`h-2 w-2 rounded-full ${connectionState === ConnectionState.Connected ? 'animate-pulse bg-success' : 'bg-amber'}`} />
          <span className="text-xs font-semibold text-text-muted">{connectionState === ConnectionState.Connected ? 'Live' : 'Connecting'}</span>
          <span className="font-mono text-sm font-bold tabular-nums">{formatDuration(elapsedMs)}</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 sm:p-6 lg:flex-row">
        {/* Stage: the agent, what it is doing, and the controls. */}
        {/* With captions off the stage takes the whole width, centred. */}
        <section className={`bento-tile flex flex-col items-center justify-center gap-6 py-6 lg:py-10 ${showTranscript ? 'shrink-0 lg:w-[44%]' : 'flex-1'}`}>
          {agentParticipant ? (
            <AgentOrb agentParticipant={agentParticipant} agentName={agentName} />
          ) : (
            <div className="flex flex-col items-center gap-5">
              <OrbVideo volume={0} dimmed />
              <CallStatus
                label={connectionState === ConnectionState.Connected ? WAITING_STYLE.label : 'Connecting…'}
                hint={
                  slowJoin && connectionState === ConnectionState.Connected
                    ? 'Taking longer than usual - the agent worker may be restarting. Keep waiting, or end the call and try again shortly.'
                    : WAITING_STYLE.hint
                }
                live={false}
              />
            </div>
          )}
          <div className="flex items-end justify-center gap-8">
            <button
              type="button"
              aria-label={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
              onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
              className={controlCls + ' bg-transparent'}
            >
              <span className={`flex h-12 w-12 items-center justify-center rounded-full border transition-colors ${isMicrophoneEnabled ? 'border-border bg-surface-high text-text hover:border-primary' : 'border-amber/50 bg-amber/15 text-amber'}`}>
                <Icon name={isMicrophoneEnabled ? 'mic' : 'mic_off'} />
              </span>
              {isMicrophoneEnabled ? 'Mute' : 'Unmute'}
            </button>
            <button type="button" aria-label="End call" onClick={() => room.disconnect()} className={controlCls + ' bg-transparent'}>
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive text-white shadow-[0_12px_28px_-10px_rgb(239_68_68/0.8)] transition-transform hover:scale-105">
                <Icon name="call_end" className="text-[28px]" />
              </span>
              End call
            </button>
            <button
              type="button"
              aria-label="Toggle transcript"
              aria-pressed={showTranscript}
              onClick={() => setShowTranscript((v) => !v)}
              className={controlCls + ' bg-transparent'}
            >
              <span className={`flex h-12 w-12 items-center justify-center rounded-full border transition-colors ${showTranscript ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface-high text-text hover:border-primary'}`}>
                <Icon name="closed_caption" />
              </span>
              Captions
            </button>
          </div>
        </section>

        {/* Live transcript, with the type box at its foot. */}
        {showTranscript && (
          <section className="bento-tile flex min-h-0 flex-1 flex-col" style={{ padding: 0 }}>
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <p className="bento-title text-[15px]">Live transcript</p>
              <span className="text-xs text-text-muted">{transcriptEntries.length} {transcriptEntries.length === 1 ? 'line' : 'lines'}</span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
              {transcriptEntries.length === 0 && (
                <div className="m-auto max-w-xs text-center">
                  <p className="font-semibold">Say hello to start</p>
                  <p className="mt-1 text-sm text-text-muted">What you and {agentName} say appears here, line by line.</p>
                </div>
              )}
              {transcriptEntries.map((entry) => (
                <div key={entry.id} className={`flex max-w-[85%] flex-col gap-1 ${entry.isLocal ? 'self-end items-end' : 'self-start items-start'}`}>
                  <span className="px-1 text-[11px] font-semibold text-text-muted">
                    {entry.isLocal ? 'You' : agentName}
                  </span>
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      entry.isLocal ? 'rounded-tr-md bg-primary text-bg' : 'rounded-tl-md border border-border bg-surface-high text-text'
                    }`}
                  >
                    {entry.text}
                  </div>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
            <div className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3">
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
                placeholder={`Or type a message to ${agentName}…`}
                className="flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
              <button
                type="button"
                aria-label="Send message"
                onClick={handleSendText}
                disabled={!textInput.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-bg disabled:opacity-40"
              >
                <Icon name="send" className="text-[18px]" />
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
