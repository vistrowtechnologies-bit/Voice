import { useCallback, useEffect, useRef, useState } from 'react'
import { micErrorMessage, pickRecorderMime } from './voiceClone'

export type RecorderState = 'idle' | 'starting' | 'recording' | 'done'

/** True when this browser can record from the microphone at all. */
export function canRecordAudio(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  )
}

/** In-browser microphone recorder for voice samples: timer, input level
 * (0..1, updated about 10 times a second), auto-stop at maxSeconds, and a
 * playable blob URL once stopped. Everything is released on unmount. */
export function useAudioRecorder({ maxSeconds }: { maxSeconds: number }) {
  const [state, setState] = useState<RecorderState>('idle')
  const [seconds, setSeconds] = useState(0)
  const [level, setLevel] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<number | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const discardRef = useRef(false)
  const urlRef = useRef<string | null>(null)

  const release = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
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

  const stop = useCallback(() => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
  }, [])

  const start = useCallback(async () => {
    if (!canRecordAudio()) {
      setError('This browser cannot record audio. Please upload a recording instead.')
      return
    }
    setError('')
    setPlayable(null)
    setSeconds(0)
    setState('starting')
    discardRef.current = false
    let stream: MediaStream
    try {
      // No noise suppression: it smears the voice the clone is learning from.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true },
      })
    } catch (e) {
      setError(micErrorMessage(e instanceof DOMException ? e.name : ''))
      setState('idle')
      return
    }
    streamRef.current = stream

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

    // Input level from an analyser on the same stream.
    let analyser: AnalyserNode | null = null
    let buf: Uint8Array<ArrayBuffer> | null = null
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctx) {
        const ctx = new Ctx()
        ctxRef.current = ctx
        analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        ctx.createMediaStreamSource(stream).connect(analyser)
        buf = new Uint8Array(new ArrayBuffer(analyser.fftSize))
      }
    } catch {
      analyser = null
    }

    rec.start(1000)
    startedAtRef.current = performance.now()
    setState('recording')
    timerRef.current = window.setInterval(() => {
      const elapsed = (performance.now() - startedAtRef.current) / 1000
      setSeconds(elapsed)
      if (analyser && buf) {
        analyser.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128
          sum += v * v
        }
        // RMS of normal speech sits around 0.05-0.2; scale so it fills the meter.
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4))
      }
      if (elapsed >= maxSeconds) stop()
    }, 100)
  }, [maxSeconds, release, setPlayable, stop])

  const reset = useCallback(() => {
    discardRef.current = true
    stop()
    release()
    setPlayable(null)
    setSeconds(0)
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

  return { state, seconds, level, blob, url, error, start, stop, reset, mime: blob?.type ?? '' }
}
