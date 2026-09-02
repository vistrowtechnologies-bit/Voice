import { useNavigate } from 'react-router-dom'
import { Icon } from './Icon'

interface UpgradeRequiredModalProps {
  /** The exact backend message (e.g. "Your starter plan includes 1 agent -
   * upgrade to add more.") - shown as-is so the reason always matches what
   * actually got rejected, instead of a generic "upgrade to continue". */
  message: string
  onClose: () => void
}

/** Shown wherever a plan-limit rejection (agent count, API access, voice
 * tier, ...) reaches the UI, instead of just surfacing the bare error
 * string from send() as a toast. A blocked action is a moment someone was
 * ready to pay more for something - this turns that into a path to
 * Billing instead of a dead end. */
export function UpgradeRequiredModal({ message, onClose }: UpgradeRequiredModalProps) {
  const navigate = useNavigate()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Icon name="workspace_premium" className="text-[20px]" />
        </div>
        <h3 className="mb-1.5 text-sm font-bold">Upgrade required</h3>
        <p className="mb-5 text-sm text-text-muted">{message}</p>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-border py-2 text-sm font-bold text-text-muted hover:bg-surface-high"
          >
            Maybe later
          </button>
          <button
            onClick={() => navigate('/dashboard/billing')}
            className="flex-1 rounded-lg bg-primary py-2 text-sm font-bold text-bg hover:opacity-90"
          >
            Upgrade your plan
          </button>
        </div>
      </div>
    </div>
  )
}
