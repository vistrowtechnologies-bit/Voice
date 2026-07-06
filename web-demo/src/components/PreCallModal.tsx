import { useNavigate } from 'react-router-dom'
import { Icon } from './Icon'

type Phase = 'permission' | 'denied' | 'connecting'

interface PreCallModalProps {
  phase: Phase
  errorMessage: string | null
  onStart: () => void
}

const STEPS = [
  { icon: 'mic', label: 'Allow mic' },
  { icon: 'waving_hand', label: 'Say hi' },
  { icon: 'check_circle', label: 'Get matched' },
]

export function PreCallModal({ phase, errorMessage, onStart }: PreCallModalProps) {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
        <div className="flex justify-end">
          <button
            aria-label="Close"
            onClick={() => navigate('/')}
            className="text-text-muted transition-colors hover:text-text"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary">
            <Icon name="mic" className="text-bg text-[26px]" />
          </div>
          <h1 className="text-xl font-semibold">Ready to talk to our AI agent?</h1>
          <p className="text-sm text-text-muted">
            We&apos;ll ask your mic permission, then connect you to Riya, our AI leasing
            assistant. Calls are not recorded without your consent.
          </p>

          <div className="flex gap-8 py-2">
            {STEPS.map((step) => (
              <div key={step.label} className="flex flex-col items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-high">
                  <Icon name={step.icon} className="text-text-muted text-[18px]" />
                </div>
                <span className="text-xs text-text-muted">{step.label}</span>
              </div>
            ))}
          </div>

          {phase === 'denied' && (
            <div className="w-full rounded-lg border-l-[3px] border-destructive bg-surface-high px-4 py-3 text-left text-sm text-text">
              {errorMessage ?? 'Mic access is blocked. Enable it in your browser settings to continue.'}
            </div>
          )}

          {phase === 'connecting' ? (
            <div className="flex items-center gap-3 py-2 text-sm text-cyan">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
              Connecting to Riya…
            </div>
          ) : (
            <button
              onClick={onStart}
              className="mt-2 w-full rounded-full bg-primary py-3 text-sm font-bold text-bg transition-opacity hover:opacity-90"
            >
              {phase === 'denied' ? 'Try Again' : 'Start the Call'}
            </button>
          )}

          <button
            onClick={() => navigate('/')}
            className="text-xs text-text-muted transition-colors hover:text-text"
          >
            Maybe later
          </button>

          <p className="text-[11px] text-text-muted">
            Powered by AI · Hindi, English &amp; regional languages
          </p>
        </div>
      </div>
    </div>
  )
}
