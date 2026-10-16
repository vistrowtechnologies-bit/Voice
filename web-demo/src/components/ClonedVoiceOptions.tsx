import { useEffect, useState } from 'react'
import { fetchCustomVoices } from '../lib/api'
import type { CustomVoice } from '../lib/api'

/** The account's cloned voices, for the agent voice picker. Failures leave
 * the list empty so the picker still works without them. */
export function useClonedVoices() {
  const [voices, setVoices] = useState<CustomVoice[]>([])
  useEffect(() => {
    fetchCustomVoices()
      .then(setVoices)
      .catch(() => setVoices([]))
  }, [])
  return voices
}

/** Picker label for a cloned voice, e.g. "Priya (Cloned) - 3 credits/min". */
export const clonedVoiceLabel = (v: CustomVoice) =>
  `${v.name} (Cloned) - ${v.creditsPerMinute.toLocaleString('en-IN', { maximumFractionDigits: 2 })} credits/min`

/** Name for an agent's stored "custom:..." voice that the picker cannot offer
 * (still being made, failed, or deleted). Undefined for any other voice. */
export function clonedVoiceFallbackName(value: string, voices: CustomVoice[]): string | undefined {
  if (!value.startsWith('custom:')) return undefined
  const v = voices.find((x) => x.voiceValue === value)
  if (!v) return 'Cloned voice'
  return v.status === 'ready' ? `${v.name} (Cloned)` : `${v.name} (Cloned, ${v.status === 'failed' ? 'failed' : 'not ready yet'})`
}

/** "Your voices" group in a voice <select>: ready cloned voices only. */
export function ClonedVoiceOptions({ voices }: { voices: CustomVoice[] }) {
  const ready = voices.filter((v) => v.status === 'ready')
  if (ready.length === 0) return null
  return (
    <optgroup label="Your voices - cloned from your recordings">
      {ready.map((v) => (
        <option key={v.voiceValue} value={v.voiceValue}>
          {clonedVoiceLabel(v)}
        </option>
      ))}
    </optgroup>
  )
}
