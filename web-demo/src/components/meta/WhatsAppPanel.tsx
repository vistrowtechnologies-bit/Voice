import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../Icon'
import {
  connectWhatsAppNumber,
  disconnectWhatsAppNumber,
  fetchWhatsAppLeads,
  fetchWhatsAppStatus,
  type WhatsAppLead,
  type WhatsAppStatus,
} from '../../lib/whatsappLeads'
import { MetaPanel, MetaPrimaryButton, MetaSecondaryButton, metaTimeAgo } from './bits'

type Notice = { tone: 'ok' | 'error'; text: string } | null

// Click-to-WhatsApp ads: a chat that starts from an ad is called back by the
// agent that ad's rule names (same rules as Lead Ads). The number is connected
// with Meta's own signup popup, so it never leaves this page.

const LEAD_STATUS: Record<string, string> = {
  queued: 'Call queued',
  skipped: 'Not from an ad',
  stale: 'Too old to call',
  opted_out: 'Asked to stop',
  received: 'Received',
  failed: 'Failed',
}

export function WhatsAppPanel({ canManage, onNotice }: { canManage: boolean; onNotice: (n: Notice) => void }) {
  const [status, setStatus] = useState<WhatsAppStatus | null | undefined>(undefined)
  const [leads, setLeads] = useState<WhatsAppLead[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetchWhatsAppStatus().then(setStatus)
    fetchWhatsAppLeads(20).then(setLeads, () => setLeads(null))
  }, [])
  useEffect(load, [load])

  // Older server without these routes: show nothing rather than a broken panel.
  if (status === null || status === undefined) return null

  const connect = async () => {
    setBusy(true)
    try {
      const added = await connectWhatsAppNumber(status)
      if (added) {
        onNotice({ tone: 'ok', text: `Connected ${added.displayPhone || 'your WhatsApp number'}. Chats from your ads will now be called.` })
        load()
      }
    } catch (err) {
      onNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Could not connect WhatsApp' })
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async (id: string, label: string) => {
    if (!window.confirm(`Stop calling chats that arrive on ${label}?`)) return
    try {
      await disconnectWhatsAppNumber(id)
      onNotice({ tone: 'ok', text: `${label} disconnected.` })
      load()
    } catch (err) {
      onNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Could not disconnect' })
    }
  }

  return (
    <MetaPanel
      title="WhatsApp chat ads"
      icon="chat"
      subtitle="When someone taps an ad’s WhatsApp button and sends a message, your agent calls them back."
      action={
        canManage && status.available ? (
          <MetaPrimaryButton icon="add" onClick={connect} disabled={busy}>
            {busy ? 'Connecting…' : 'Connect WhatsApp number'}
          </MetaPrimaryButton>
        ) : undefined
      }
    >
      {!status.available && status.numbers.length === 0 && (
        <p className="text-xs text-text-muted">Connecting a WhatsApp number is not available on this server yet.</p>
      )}

      {status.numbers.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {status.numbers.map((n) => (
            <li key={n.phone_number_id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <Icon name="check_circle" className="text-[16px] text-primary" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{n.display_phone || n.phone_number_id}</p>
                  <p className="text-[11px] text-text-muted">Connected {metaTimeAgo(n.linked_at)}</p>
                </div>
              </div>
              {canManage && (
                <MetaSecondaryButton icon="link_off" onClick={() => disconnect(n.phone_number_id, n.display_phone || 'this number')}>
                  Disconnect
                </MetaSecondaryButton>
              )}
            </li>
          ))}
        </ul>
      ) : (
        status.available && (
          <p className="text-xs text-text-muted">
            No number connected. You’ll sign in with Facebook, pick or add your WhatsApp Business number, and come straight back here.
          </p>
        )
      )}

      <p className="text-[11px] text-text-muted">
        Which agent calls is set by your lead rules above: add a rule for the ad’s ID, otherwise the Page’s default agent calls.
        Replying “STOP” puts the person on your do-not-call list. Chats that did not start from an ad are never called.
      </p>

      {leads && leads.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Recent chats</p>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border text-xs">
            {leads.map((l) => (
              <li key={`${l.phone_number_id}-${l.message_id}`} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{l.profile_name || `+${l.from_phone}`}</p>
                  <p className="truncate text-[11px] text-text-muted">{l.ad_headline || (l.ad_id ? `Ad ${l.ad_id}` : 'Direct chat')}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold">{LEAD_STATUS[l.status] || l.status}</p>
                  <p className="text-[11px] text-text-muted">{metaTimeAgo(l.received_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </MetaPanel>
  )
}
