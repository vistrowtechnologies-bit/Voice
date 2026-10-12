import { useState } from 'react'
import { Icon } from './Icon'

/** The agent's 10-digit Agent ID with one-tap copy, for mapping the agent in
 * ArthaLeads or any other platform (every pushed lead carries it as agent_id). */
export function AgentIdChip({ publicId }: { publicId: string }) {
  const [copied, setCopied] = useState(false)
  if (!publicId) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publicId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      alert('Could not copy the agent ID. Check clipboard permission and try again.')
    }
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      title="Copy Agent ID"
      aria-label={copied ? 'Agent ID copied' : `Copy Agent ID ${publicId}`}
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:border-primary hover:text-text"
    >
      <span className="font-semibold">ID</span>
      <code className="font-mono font-semibold tracking-wide text-text">{publicId}</code>
      <Icon name={copied ? 'check' : 'content_copy'} className={`text-[14px] ${copied ? 'text-success' : ''}`} />
    </button>
  )
}
