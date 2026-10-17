import { useCallback, useEffect, useRef, useState } from 'react'
import { micErrorMessage, pickRecorderMime } from './voiceClone'
import type { LevelFrame } from './voiceClone'

export type RecorderState = 'idle' | 'starting' | 'monitoring' | 'recording' | 'done'

/** True when this browser can record from the microphone at all. */
export function canRecordAudio(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  )
}

const TICK_MS = 100
// Frames kept while only listening (mic check): the last few seconds.
const MONITOR_FRAMES = 40

/** In-browser microphone recorder for voice samples.
 *
 * - `monitor()` opens the mic and reports levels without recording (mic check).
 * - `start()` records (reusing the monitor's mic when it is open), stopping
 *   on its own at maxSeconds.
 * - `frames` is one RMS/peak reading per 100 ms (see voiceClone.levelHints);
 *   `level` is the latest RMS.
 * Everything is released on unmount. */
export function useAudioRecorder({ maxSeconds }: { maxSeconds: number }) {
  const [state, setState] = useState<RecorderState>('idle')
  const [seconds, setSeconds] = useState(0)
  const [level, setLevel] = useState(0)
  const [frames, setFrames] = useState<LevelFrame[]>([])
  const [blob, setBlob] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const timerRef = useRef<number | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const discardRef = useRef(false)
  const urlRef = useRef<string | null>(null)
  const modeRef = useRef<'monitor' | 'record' | null>(null)

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const release = useCallback(() => {
    stopTimer()
    modeRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    analyserRef.current = null
    ctxRef.current?.close().catch(() => undefined)
    ctxRef.current = null
    setLevel(0)
  }, [])

  const setPlayable = useCallback((next: Blob | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = next ? URL.createObjectURL(next) : null
    setBlob(next)
    setUrl(urlRef.current)
  }, [])

  /** One RMS/peak reading of the current input, or null without an analyser. */
  const readFrame = useCallback((): LevelFrame | null => {
    const analyser = analyserRef.current
    if (!analyser) return null
    const buf = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(buf)
    let sum = 0
    let peak = 0
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i]
      sum += v * v
      const a = Math.abs(v)
      if (a > peak) peak = a
    }
    return { rms: Math.sqrt(sum / buf.length), peak: Math.min(1, peak) }
  }, [])

  /** Opens the microphone and an analyser on it, unless already open. */
  const openMic = useCallback(async (): Promise<MediaStream | null> => {
    const live = streamRef.current
    if (live && live.getAudioTracks().some((t) => t.readyState === 'live')) return live
    if (!canRecordAudio()) {
      setError('This browser cannot record audio. Please upload a recording instead.')
      return null
    }
    let stream: MediaStream
    try {
      // No noise suppression: it smears the voice the clone is learning from.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true },
      })
    } catch (e) {
      setError(micErrorMessage(e instanceof DOMException ? e.name : ''))
      return null
    }
    streamRef.current = stream
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctx) {
        const ctx = new Ctx()
        ctxRef.current = ctx
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 2048
        ctx.createMediaStreamSource(stream).connect(analyser)
        analyserRef.current = analyser
      }
    } catch {
      analyserRef.current = null
    }
    return stream
  }, [])

  const stop = useCallback(() => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
  }, [])

  /** Mic check: listen and report levels, without recording. */
  const monitor = useCallback(async () => {
    if (modeRef.current) return
    setError('')
    setState('starting')
    const stream = await openMic()
    if (!stream) {
      setState('idle')
      return
    }
    modeRef.current = 'monitor'
    setFrames([])
    setState('monitoring')
    stopTimer()
    timerRef.current = window.setInterval(() => {
      const f = readFrame()
      if (!f) return
      setLevel(f.rms)
      setFrames((prev) => [...prev.slice(-(MONITOR_FRAMES - 1)), f])
    }, TICK_MS)
  }, [openMic, readFrame])

  /** Stops the mic check and releases the microphone. */
  const stopMonitor = useCallback(() => {
    if (modeRef.current !== 'monitor') return
    release()
    setFrames([])
    setState('idle')
  }, [release])

  const start = useCallback(async () => {
    if (modeRef.current === 'record') return
    setError('')
    setPlayable(null)
    setSeconds(0)
    setFrames([])
    setState('starting')
    discardRef.current = false
    stopTimer()
    const stream = await openMic()
    if (!stream) {
      setState('idle')
      return
    }

    const mime = pickRecorderMime(MediaRecorder.isTypeSupported?.bind(MediaRecorder))
    let rec: MediaRecorder
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    } catch {
      release()
      setError('Recording could not start. You can upload a recording instead.')
      setState('idle')
      return
    }
    modeRef.current = 'record'
    recorderRef.current = rec
    chunksRef.current = []
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
    }
    rec.onstop = () => {
      const elapsed = (performance.now() - startedAtRef.current) / 1000
      release()
      recorderRef.current = null
      if (discardRef.current) return
      setSeconds(Math.min(elapsed, maxSeconds))
      setPlayable(new Blob(chunksRef.current, { type: rec.mimeType || mime || 'audio/webm' }))
      setState('done')
    }

    rec.start(1000)
    startedAtRef.current = performance.now()
    setState('recording')
    timerRef.current = window.setInterval(() => {
      const elapsed = (performance.now() - startedAtRef.current) / 1000
      setSeconds(elapsed)
      const f = readFrame()
      if (f) {
        setLevel(f.rms)
        setFrames((prev) => [...prev, f])
      }
      if (elapsed >= maxSeconds) stop()
    }, TICK_MS)
  }, [maxSeconds, openMic, readFrame, release, setPlayable, stop])

  const reset = useCallback(() => {
    discardRef.current = true
    stop()
    release()
    setPlayable(null)
    setSeconds(0)
    setFrames([])
    setError('')
    setState('idle')
  }, [release, setPlayable, stop])

  useEffect(
    () => () => {
      discardRef.current = true
      const rec = recorderRef.current
      if (rec && rec.state !== 'inactive') rec.stop()
      release()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [release],
  )

  return {
    state,
    seconds,
    level,
    frames,
    blob,
    url,
    error,
    start,
    stop,
    reset,
    monitor,
    stopMonitor,
    mime: blob?.type ?? '',
  }
}
