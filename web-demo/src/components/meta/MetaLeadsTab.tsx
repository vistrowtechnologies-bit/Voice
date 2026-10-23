import { Link } from 'react-router-dom'
import { Icon } from '../Icon'
import { Card } from '../ui/Card'
import { formatDateTime } from '../../lib/api'
import { utcTime } from '../IntegrationBits'
import { metaReasonLabel, type MetaLeadEvent } from '../../lib/metaLeads'
import { MetaStatusChip } from './bits'

// Every lead Meta told us about, in the state the worker left it. A lead is
// never silently dropped: a skipped, stale or test lead says why.

export function MetaLeadsTab({ leads }: { leads: MetaLeadEvent[] | null }) {
  return (
    <Card>
      {leads === null ? (
        <p className="py-6 text-center text-xs text-text-muted">Loading…</p>
      ) : leads.length === 0 ? (
        <div className="py-8 text-center">
          <Icon name="inbox" className="text-[28px] text-text-muted" />
          <p className="mt-2 text-sm font-semibold">No leads yet</p>
          <p className="text-xs text-text-muted">Leads from your Facebook and Instagram Lead Ads forms appear here as they arrive.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-widest text-text-muted">
                <th className="py-2 pr-3 font-bold">Received</th>
                <th className="py-2 pr-3 font-bold">Page</th>
                <th className="py-2 pr-3 font-bold">Form</th>
                <th className="py-2 pr-3 font-bold">Status</th>
                <th className="py-2 font-bold">Call</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={`${lead.page_id}:${lead.leadgen_id}`} className="border-b border-border/60 last:border-0">
                  <td className="whitespace-nowrap py-2.5 pr-3 text-text-muted">
                    {formatDateTime(utcTime(lead.received_at))}
                    {lead.via !== 'webhook' && <span className="ml-1 text-[10px] uppercase">· {lead.via}</span>}
                  </td>
                  <td className="py-2.5 pr-3 font-semibold">{lead.page_name || lead.page_id}</td>
                  <td className="py-2.5 pr-3">{lead.form_name || (lead.form_id ? `Form ${lead.form_id}` : '-')}</td>
                  <td className="py-2.5 pr-3">
                    <div className="flex flex-col gap-0.5">
                      <MetaStatusChip status={lead.status} />
                      {lead.reason && <span className="text-[11px] text-text-muted">{metaReasonLabel(lead.reason)}</span>}
                    </div>
                  </td>
                  <td className="py-2.5">
                    {lead.call_id ? (
                      <Link to={`/dashboard/calls/${lead.call_id}`} className="font-semibold text-primary hover:underline">
                        Open call
                      </Link>
                    ) : lead.dialed_at ? (
                      <span className="text-text-muted">Called {formatDateTime(utcTime(lead.dialed_at))}</span>
                    ) : lead.status === 'queued' ? (
                      <span className="text-text-muted">Waiting for a free line</span>
                    ) : lead.status === 'received' ? (
                      <span className="text-text-muted">Being fetched</span>
                    ) : (
                      <span className="text-text-muted">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
