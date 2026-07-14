import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { voicePreviewUrl } from '../lib/api'

type State = 'idle' | 'loading' | 'playing' | 'error'

// Plays a voice's cached Vistrow audition line. The first play of a given
// (voice, lang) triggers server-side synthesis (a second or two); every later
// play is a free cached read. Fetched as a blob so we can show a real loading
// state and surface errors, and so the httpOnly session cookie is sent.
export function VoicePreviewButton({
  voice,
  lang,
  className = '',
}: {
  voice: string
  lang: string
  className?: string
}) {
  const [state, setState] = useState<State>('idle')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  function cleanup() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }

  // Stop + revoke on unmount, and whenever the voice/lang changes.
  useEffect(() => cleanup, [voice, lang])

  async function toggle() {
    if (state === 'playing') {
      cleanup()
      setState('idle')
      return
    }
    setState('loading')
    try {
      const res = await fetch(voicePreviewUrl(voice, lang), { credentials: 'include' })
      if (!res.ok) throw new Error(String(res.status))
      const blob = await res.blob()
      cleanup()
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => setState('idle')
      audio.onerror = () => setState('error')
      await audio.play()
      setState('playing')
    } catch {
      setState('error')
    }
  }

  const icon =
    state === 'loading'
      ? 'progress_activity'
      : state === 'playing'
        ? 'stop'
        : state === 'error'
          ? 'error'
          : 'play_arrow'

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={state === 'loading'}
      aria-label={state === 'playing' ? 'Stop preview' : 'Play preview'}
      title={state === 'error' ? 'Preview unavailable — try again' : 'Listen to this voice'}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-high text-text transition-colors hover:border-primary hover:text-primary disabled:opacity-60 ${
        state === 'error' ? 'text-destructive' : ''
      } ${className}`}
    >
      <Icon name={icon} className={`text-[18px] ${state === 'loading' ? 'animate-spin' : ''}`} />
    </button>
  )
}
