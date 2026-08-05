import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { useOrchestratorCall } from '../lib/orchestratorCall'

interface OrchestratorTestCallUIProps {
  agentId: number
  agentLabel: string
  onClose: () => void
  onConnectionError: () => void
}

const STATE_LABEL: Record<string, string> = {
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

const SPEAKING_PLAYBACK_RATE = 2.2

function OrbVideo({ volume, dimmed, speaking }: { volume: number; dimmed?: boolean; speaking?: boolean }) {
  const scale = 1 + Math.min(volume, 1) * 0.14
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speaking ? SPEAKING_PLAYBACK_RATE : 1
  }, [speaking])

  return (
    <div
      className="relative h-72 w-72 overflow-hidden rounded-full transition-transform duration-150 ease-out sm:h-[26rem] sm:w-[26rem]"
      style={{ transform: `scale(${scale})`, opacity: dimmed ? 0.45 : 1 }}
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

/** Orchestrator/WebSocket equivalent of ActiveCallUI - same visual shell
 * (orb, states, transcript, mic/end/transcript-toggle controls) but driven
 * by useOrchestratorCall's local state instead of LiveKit's React hooks,
 * since there's no LiveKitRoom/participant model on this transport. */
export function OrchestratorTestCallUI({ agentId, agentLabel, onClose, onConnectionError }: OrchestratorTestCallUIProps) {
  const { phase, error, agentState, agentVolume, transcript, micEnabled, toggleMic, endCall, elapsedMs } =
    useOrchestratorCall(agentId)
  const [showTranscript, setShowTranscript] = useState(true)
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  useEffect(() => {
    if (phase === 'ended') onClose()
  }, [phase, onClose])

  useEffect(() => {
    if (phase === 'error') onConnectionError()
  }, [phase, onConnectionError])

  if (phase === 'error') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="mb-4 text-sm text-destructive">{error ?? 'Could not connect.'}</p>
          <button
            onClick={onClose}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'connecting') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-4 text-sm text-cyan">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
          Connecting…
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex h-screen flex-col overflow-hidden bg-bg text-text">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <span className="h-2 w-2 rounded-full bg-primary" />
          {agentLabel}
        </div>
        <span className="font-mono text-sm text-text-muted">{formatDuration(elapsedMs)}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden sm:flex-row">
        <div className="flex shrink-0 items-center justify-center border-b border-border py-6 sm:w-[42%] sm:border-b-0 sm:border-r sm:py-0">
          <div className="flex flex-col items-center gap-4">
            <OrbVideo
              volume={agentState === 'speaking' ? agentVolume : 0}
              dimmed={agentState !== 'speaking'}
              speaking={agentState === 'speaking'}
            />
            <p className="text-sm text-text-muted">{STATE_LABEL[agentState]}</p>
          </div>
        </div>

        {showTranscript && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-6">
            {transcript.length === 0 && (
              <p className="text-center text-sm text-text-muted">
                Your conversation will appear here as you talk.
              </p>
            )}
            {transcript.map((entry) => (
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

      <div className="flex shrink-0 items-center justify-center gap-6 border-t border-border bg-surface px-4 py-4 sm:px-6">
        <button
          aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
          onClick={toggleMic}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-high text-text-muted transition-colors hover:text-text"
        >
          <Icon name={micEnabled ? 'mic' : 'mic_off'} />
        </button>
        <button
          aria-label="End call"
          onClick={endCall}
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
