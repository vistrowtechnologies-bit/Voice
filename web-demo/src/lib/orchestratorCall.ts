import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchOrchestratorBrowserToken } from './api'
import type { TranscriptEntry } from './types'

export type OrchestratorCallPhase = 'connecting' | 'active' | 'error' | 'ended'
export type AgentState = 'listening' | 'thinking' | 'speaking'

interface UseOrchestratorCallResult {
  phase: OrchestratorCallPhase
  error: string | null
  agentState: AgentState
  agentVolume: number
  transcript: TranscriptEntry[]
  micEnabled: boolean
  toggleMic: () => void
  endCall: () => void
  elapsedMs: number
}

function floatTo16BitPCM(float32: Float32Array): Int16Array {
  const out = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

/** Drives a browser call against the orchestrator's /browser/stream
 * WebSocket — the non-LiveKit equivalent of LiveKitRoom + ActiveCallUI's
 * hooks. Owns mic capture, playback (with an AnalyserNode so the orb still
 * reacts to the agent's voice like useTrackVolume did), and the
 * thinking/speaking/listening state the orb displays. */
export function useOrchestratorCall(agentId: number): UseOrchestratorCallResult {
  const [phase, setPhase] = useState<OrchestratorCallPhase>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [agentState, setAgentState] = useState<AgentState>('listening')
  const [agentVolume, setAgentVolume] = useState(0)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [micEnabled, setMicEnabled] = useState(true)
  const [elapsedMs, setElapsedMs] = useState(0)

  const wsRef = useRef<WebSocket | null>(null)
  const micEnabledRef = useRef(true)
  const micStreamRef = useRef<MediaStream | null>(null)
  const captureCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const playbackCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const playQueueRef = useRef<ArrayBuffer[]>([])
  const playingRef = useRef(false)
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const wsSpeakingRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)

  const setSpeaking = useCallback((v: boolean) => {
    if (v === wsSpeakingRef.current) return
    wsSpeakingRef.current = v
    if (v) setAgentState('speaking')
    else setAgentState((s) => (s === 'speaking' ? 'listening' : s))
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: v ? 'speaking_start' : 'speaking_end' }))
    }
  }, [])

  const stopPlayback = useCallback(() => {
    playQueueRef.current = []
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop()
      } catch {
        // already stopped
      }
      currentSourceRef.current = null
    }
    playingRef.current = false
    setSpeaking(false)
  }, [setSpeaking])

  const playNext = useCallback(async () => {
    if (playingRef.current) return
    if (playQueueRef.current.length === 0) {
      setSpeaking(false)
      return
    }
    playingRef.current = true
    setSpeaking(true)
    const buf = playQueueRef.current.shift()!
    const playbackCtx = playbackCtxRef.current
    const analyser = analyserRef.current
    if (!playbackCtx || !analyser) return
    try {
      const audioBuffer = await playbackCtx.decodeAudioData(buf)
      const src = playbackCtx.createBufferSource()
      src.buffer = audioBuffer
      src.connect(analyser)
      currentSourceRef.current = src
      src.onended = () => {
        currentSourceRef.current = null
        playingRef.current = false
        void playNext()
      }
      src.start()
    } catch {
      playingRef.current = false
      void playNext()
    }
  }, [setSpeaking])

  const endCall = useCallback(() => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: 'stop' }))
      ws.close()
    }
    setPhase('ended')
  }, [])

  const toggleMic = useCallback(() => {
    micEnabledRef.current = !micEnabledRef.current
    setMicEnabled(micEnabledRef.current)
  }, [])

  useEffect(() => {
    let cancelled = false
    let cleanupFns: Array<() => void> = []

    ;(async () => {
      try {
        const data = await fetchOrchestratorBrowserToken(agentId)
        if (!data.ok || !data.wssUrl) throw new Error(data.error ?? 'Could not get a call token.')
        if (cancelled) return

        const playbackCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        const analyser = playbackCtx.createAnalyser()
        analyser.fftSize = 256
        analyser.connect(playbackCtx.destination)
        playbackCtxRef.current = playbackCtx
        analyserRef.current = analyser

        const volumeData = new Uint8Array(analyser.frequencyBinCount)
        const sampleVolume = () => {
          analyser.getByteTimeDomainData(volumeData)
          let sumSquares = 0
          for (const v of volumeData) {
            const centered = (v - 128) / 128
            sumSquares += centered * centered
          }
          setAgentVolume(Math.sqrt(sumSquares / volumeData.length))
          rafRef.current = requestAnimationFrame(sampleVolume)
        }
        rafRef.current = requestAnimationFrame(sampleVolume)

        const micStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } })
        if (cancelled) {
          micStream.getTracks().forEach((t) => t.stop())
          return
        }
        micStreamRef.current = micStream
        const captureCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        captureCtxRef.current = captureCtx
        const source = captureCtx.createMediaStreamSource(micStream)
        const processor = captureCtx.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor
        source.connect(processor)
        // Required by some browsers to keep the ScriptProcessor node alive;
        // its own output isn't audible since it's never routed anywhere
        // meaningful (destination gets the raw mic signal muted at 0 gain).
        const silence = captureCtx.createGain()
        silence.gain.value = 0
        processor.connect(silence)
        silence.connect(captureCtx.destination)
        processor.onaudioprocess = (e) => {
          const ws = wsRef.current
          if (!ws || ws.readyState !== WebSocket.OPEN || !micEnabledRef.current) return
          const input = e.inputBuffer.getChannelData(0)
          const pcm16 = floatTo16BitPCM(input)
          ws.send(pcm16.buffer as ArrayBuffer)
        }

        const ws = new WebSocket(data.wssUrl)
        ws.binaryType = 'arraybuffer'
        wsRef.current = ws

        ws.onopen = () => {
          ws.send(JSON.stringify({ event: 'start', sampleRate: captureCtx.sampleRate }))
          startedAtRef.current = Date.now()
          if (!cancelled) setPhase('active')
        }
        ws.onmessage = (evt) => {
          if (typeof evt.data === 'string') {
            const msg = JSON.parse(evt.data) as Record<string, unknown>
            if (msg.event === 'clear_audio') stopPlayback()
            else if (msg.event === 'state' && msg.state === 'thinking') setAgentState('thinking')
            else if (msg.event === 'transcript') {
              setTranscript((prev) => [
                ...prev,
                {
                  id: `${prev.length}-${Date.now()}`,
                  identity: msg.role === 'user' ? 'caller' : 'agent',
                  text: String(msg.text ?? ''),
                  isLocal: msg.role === 'user',
                },
              ])
            }
            return
          }
          playQueueRef.current.push(evt.data as ArrayBuffer)
          void playNext()
        }
        ws.onclose = () => {
          if (!cancelled) setPhase((p) => (p === 'error' ? p : 'ended'))
        }
        ws.onerror = () => {
          if (!cancelled) {
            setError('Connection error.')
            setPhase('error')
          }
        }

        cleanupFns = [
          () => processor.disconnect(),
          () => source.disconnect(),
          () => micStream.getTracks().forEach((t) => t.stop()),
          () => void captureCtx.close(),
          () => void playbackCtx.close(),
          () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
          },
          () => ws.close(),
        ]
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not connect.')
        setPhase('error')
      }
    })()

    return () => {
      cancelled = true
      cleanupFns.forEach((fn) => fn())
    }
  }, [agentId, playNext, stopPlayback])

  useEffect(() => {
    if (phase !== 'active') return
    const interval = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 1000)
    return () => clearInterval(interval)
  }, [phase])

  return { phase, error, agentState, agentVolume, transcript, micEnabled, toggleMic, endCall, elapsedMs }
}
