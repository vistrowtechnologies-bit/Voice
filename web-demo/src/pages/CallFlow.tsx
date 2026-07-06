import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react'
import { PreCallModal } from '../components/PreCallModal'
import { ActiveCallUI } from '../components/ActiveCallUI'
import { fetchLiveKitToken, randomId } from '../lib/livekit'
import type { LeadSummary, TranscriptEntry } from '../lib/types'

type Phase = 'permission' | 'denied' | 'connecting' | 'active'

export function CallFlow() {
  const [phase, setPhase] = useState<Phase>('permission')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const navigate = useNavigate()

  const leadSummaryRef = useRef<LeadSummary>({})
  const transcriptRef = useRef<TranscriptEntry[]>([])

  const handleStart = useCallback(async () => {
    setPhase('connecting')
    setErrorMessage(null)
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      const identity = randomId('visitor')
      const room = randomId('voice-agent-demo')
      const { token: newToken, url } = await fetchLiveKitToken(identity, room)
      setToken(newToken)
      setServerUrl(url)
      setPhase('active')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setErrorMessage('Mic access is blocked. Enable it in your browser settings to continue.')
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Could not connect. Please try again.')
      }
      setPhase('denied')
    }
  }, [])

  const handleDisconnected = useCallback(() => {
    navigate('/summary', {
      state: { leadSummary: leadSummaryRef.current, transcript: transcriptRef.current },
    })
  }, [navigate])

  if (phase !== 'active') {
    return <PreCallModal phase={phase} errorMessage={errorMessage} onStart={handleStart} />
  }

  return (
    <LiveKitRoom
      serverUrl={serverUrl ?? undefined}
      token={token ?? undefined}
      connect
      audio
      onDisconnected={handleDisconnected}
    >
      <RoomAudioRenderer />
      <ActiveCallUI
        onLeadUpdate={(partial) => {
          leadSummaryRef.current = { ...leadSummaryRef.current, ...partial }
        }}
        onTranscriptUpdate={(entries) => {
          transcriptRef.current = entries
        }}
      />
    </LiveKitRoom>
  )
}
