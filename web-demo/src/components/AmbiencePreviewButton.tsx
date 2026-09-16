import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

type State = 'idle' | 'playing' | 'error'

// Shares the same "only one preview plays at once" bus as VoicePreviewButton
// would use, but kept separate: a voice preview and an ambience preview are
// never expected to play together, and coupling the two modules for a
// scenario that doesn't happen isn't worth the shared state.
const PREVIEW_BUS = new EventTarget()
const STARTED = 'ambience-preview-started'

function announceStart(id: symbol) {
  PREVIEW_BUS.dispatchEvent(new CustomEvent(STARTED, { detail: id }))
}

/** Plays one of web-demo/public/ambience/*.ogg on loop, at the same volume
 * the caller would actually hear it at, so "how loud" is honestly
 * previewable. `file` is null for the "Off" option - the button is
 * disabled rather than rendered silent, so there's nothing to accidentally
 * play. */
export function AmbiencePreviewButton({
  file,
  volume,
  className = '',
}: {
  file: string | null
  /** 0.0-1.0, matching the dashboard slider. */
  volume: number
  className?: string
}) {
  const [state, setState] = useState<State>('idle')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const idRef = useRef(Symbol('ambience-preview'))

  function cleanup() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
  }

  // Stop on unmount, and whenever a different sound is selected.
  useEffect(() => cleanup, [file])

  // Live-adjust an already-playing preview as the volume slider moves,
  // instead of making the operator stop and restart it to hear a change.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  useEffect(() => {
    const onStart = (e: Event) => {
      if ((e as CustomEvent).detail !== idRef.current) {
        cleanup()
        setState('idle')
      }
    }
    PREVIEW_BUS.addEventListener(STARTED, onStart)
    return () => PREVIEW_BUS.removeEventListener(STARTED, onStart)
  }, [])

  function toggle() {
    if (state === 'playing') {
      cleanup()
      setState('idle')
      return
    }
    if (!file) return
    cleanup()
    const audio = new Audio(file)
    audio.loop = true
    audio.volume = volume
    audioRef.current = audio
    audio.onerror = () => setState('error')
    announceStart(idRef.current)
    audio
      .play()
      .then(() => setState('playing'))
      .catch(() => setState('error'))
  }

  const icon = state === 'playing' ? 'stop' : state === 'error' ? 'error' : 'play_arrow'

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!file}
      aria-label={state === 'playing' ? 'Stop preview' : 'Play preview'}
      title={!file ? 'No sound to preview' : state === 'error' ? 'Preview unavailable' : 'Listen to this ambience'}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-high text-text transition-colors hover:border-primary hover:text-primary disabled:opacity-40 ${
        state === 'error' ? 'text-destructive' : ''
      } ${className}`}
    >
      <Icon name={icon} className="text-[18px]" />
    </button>
  )
}
