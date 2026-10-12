import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminHealth, adminRunVendorHealth, type AdminHealth as Data, type AdminWorker, type VendorReport } from '../../lib/adminApi'
import { AdminCard, BarList, EmptyState, ErrorState, fmtDateTime, PageHeader, Pill, StatCard, timeAgo, useVisiblePoll } from '../../components/AdminUI'
import { Icon } from '../../components/Icon'

const POLL_MS = 15000

export function AdminHealth() {
  const [d, setD] = useState<Data | null>(null)
  // A failed refresh is transient: keep the last good data on screen, say the
  // refresh failed, and clear the note on the next success.
  const [failure, setFailure] = useState<string | null>(null)
  const navigate = useNavigate()

  const load = useCallback(() => {
    adminHealth()
      .then((r) => {
        setD(r)
        setFailure(null)
      })
      .catch((e: unknown) => setFailure(e instanceof Error ? e.message : 'Request failed'))
  }, [])
  useVisiblePoll(load, POLL_MS)

  if (!d && failure) return <ErrorState message={`Couldn't load system health: ${failure}`} onRetry={load} />
  if (!d) return <div className="h-40 animate-pulse rounded-xl border border-border bg-surface" />

  return (
    <>
      <PageHeader title="System Health" subtitle="Live platform status, error feed, and configuration. Refreshes every 15 s while this tab is open." />

      {failure && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber">
          <Icon name="sync_problem" className="text-[16px]" />
          Last refresh failed ({failure}), retrying. Showing the previous data.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatusCard label="Database" ok={d.dbOk} okText="Connected" badText="Unreachable" />
        {d.api ? (
          <StatusCard
            label="API"
            ok={d.api.ok}
            okText="OK"
            badText="Degraded"
            sub={d.api.dbLatencyMs == null ? 'DB latency not measured' : `DB round trip ${d.api.dbLatencyMs.toLocaleString('en-IN')} ms`}
          />
        ) : (
          <StatCard label="API" value="-" sub="Not reported by this server" icon="api" />
        )}
        <StatCard label="Live calls" value={d.liveCalls == null ? '—' : d.liveCalls.toLocaleString('en-IN')} sub={d.liveCalls == null ? 'LiveKit unreachable' : 'active rooms'} live={d.liveCalls != null} />
        <StatCard label="Errors (24h)" value={d.errorCount24h.toLocaleString('en-IN')} sub="logged events" icon="error" />
      </div>

      <VendorsCard report={d.vendors} onChecked={load} />

      <WorkersCard workers={d.workers} />

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <AdminCard className="overflow-hidden lg:col-span-2">
          <div className="border-b border-border px-5 py-3 font-display text-base font-semibold">Recent errors</div>
          {d.errors.length === 0 ? (
            <EmptyState icon="check_circle" message="No errors logged. All clear." />
          ) : (
            <div className="divide-y divide-border/60">
              {d.errors.map((e) => (
                <div key={e.id} className="px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Pill tone={e.level === 'error' ? 'suspended' : 'warning'}>{e.level}</Pill>
                    <span className="text-text-muted">{e.source}</span>
                    {e.account_name && (
                      <button onClick={() => navigate(`/admin/accounts/${e.account_id}`)} className="text-cyan hover:underline">
                        {e.account_name}
                      </button>
                    )}
                    <span className="ml-auto text-xs text-text-muted">{timeAgo(e.created_at)}</span>
                  </div>
                  <div className="mt-1 text-sm">{e.message}</div>
                  {e.context && <div className="mt-0.5 font-mono text-[11px] text-text-muted">{e.context}</div>}
                </div>
              ))}
            </div>
          )}
        </AdminCard>

        <AdminCard className="overflow-hidden">
          <div className="border-b border-border px-5 py-3 font-display text-base font-semibold">API keys configured</div>
          <div className="divide-y divide-border/60">
            {d.apiKeys.map((k) => (
              <div key={k.name} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span>{k.name}</span>
                {k.configured ? (
                  <Icon name="check_circle" className="text-[18px] text-success" />
                ) : (
                  <span className="text-xs text-text-muted">not set</span>
                )}
              </div>
            ))}
          </div>
        </AdminCard>

        <AdminCard className="overflow-hidden lg:col-span-3">
          <div className="border-b border-border px-5 py-3">
            <div className="font-display text-base font-semibold">How calls ended, last 24h</div>
            <div className="mt-0.5 text-xs text-text-muted">
              A spike in "client_initiated" across many accounts usually isn't callers hanging up — it's the shape a
              silent mid-call failure makes (agent goes dead air, the carrier drops the leg). Worth a look whenever
              one reason dominates.
            </div>
          </div>
          <div className="p-5">
            {d.disconnectReasons24h?.length ? (
              <BarList items={d.disconnectReasons24h.map((r) => ({ label: r.reason, value: r.count }))} />
            ) : (
              <EmptyState icon="call_end" message="No calls in the last 24h." />
            )}
          </div>
        </AdminCard>
      </div>
    </>
  )
}

function StatusCard({ label, ok, okText, badText, sub }: { label: string; ok: boolean; okText: string; badText: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</span>
        <span className={`h-2 w-2 rounded-full ${ok ? 'bg-success' : 'bg-destructive'}`} />
      </div>
      <div className={`mt-1 font-display text-lg font-bold ${ok ? 'text-success' : 'text-destructive'}`}>{ok ? okText : badText}</div>
      {sub && <div className="mt-0.5 text-xs text-text-muted">{sub}</div>}
    </div>
  )
}

const WORKER_TONE = { ok: 'active', stale: 'warning', unknown: 'neutral' } as const

function fmtAge(seconds: number | null): string {
  if (seconds == null) return 'never seen'
  const s = Math.max(0, Math.round(seconds))
  if (s < 120) return `last seen ${s.toLocaleString('en-IN')} s ago`
  if (s < 7200) return `last seen ${Math.floor(s / 60).toLocaleString('en-IN')} min ago`
  return `last seen ${Math.floor(s / 3600).toLocaleString('en-IN')} h ago`
}

const VENDOR_TONE = { ok: 'active', warn: 'warning', fail: 'suspended', skipped: 'neutral' } as const
const VENDOR_LABEL = { ok: 'OK', warn: 'Warning', fail: 'Failing', skipped: 'Not configured' } as const

/** Every vendor checked with a tiny real request (credit and quota, not just
 * reachability): every 3 hours by the ops worker, or now from here. */
function VendorsCard({ report, onChecked }: { report?: VendorReport | null; onChecked: () => void }) {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fresh, setFresh] = useState<VendorReport | null>(null)
  const shown = fresh && (!report || fresh.checkedAt >= report.checkedAt) ? fresh : report
  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      setFresh(await adminRunVendorHealth())
      onChecked()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check failed')
    } finally {
      setRunning(false)
    }
  }
  const failing = shown?.results.filter((r) => r.status === 'fail').length ?? 0
  return (
    <AdminCard className="mt-6 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-display text-base font-semibold">
            Vendor health
            {shown && <Pill tone={failing ? 'suspended' : 'active'}>{failing ? `${failing} failing` : 'all OK'}</Pill>}
          </div>
          <div className="mt-0.5 text-xs text-text-muted">
            A tiny real request to each vendor every 3 hours, with an email when one fails and a daily digest at 9 AM.
            {shown && <> Last checked <span title={fmtDateTime(shown.checkedAt)}>{timeAgo(shown.checkedAt)}</span>.</>}
          </div>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-bold text-text-muted transition-colors hover:border-primary hover:text-text disabled:opacity-60"
        >
          <Icon name={running ? 'progress_activity' : 'refresh'} className={`text-[16px] ${running ? 'motion-safe:animate-spin' : ''}`} />
          {running ? 'Checking…' : 'Run check now'}
        </button>
      </div>
      {error && <div className="border-b border-border bg-destructive/5 px-5 py-2 text-xs text-destructive">{error}</div>}
      {!shown ? (
        <EmptyState icon="monitor_heart" message="Not checked yet. Run a check, or wait for the next 3-hourly run." />
      ) : (
        <div className="divide-y divide-border/60">
          {shown.results.map((r) => (
            <div key={r.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm">
              <span className="w-36 shrink-0 font-semibold">{r.name}</span>
              <Pill tone={VENDOR_TONE[r.status] ?? 'neutral'}>{VENDOR_LABEL[r.status] ?? r.status}</Pill>
              <span className={`min-w-0 flex-1 text-xs ${r.status === 'fail' ? 'text-destructive' : 'text-text-muted'}`}>{r.detail}</span>
              <span className="font-mono text-[11px] text-text-muted">{r.latencyMs.toLocaleString('en-IN')} ms</span>
            </div>
          ))}
        </div>
      )}
    </AdminCard>
  )
}

/** LiveKit agent workers (web demo + phone), from their 60 s heartbeats. */
function WorkersCard({ workers }: { workers?: AdminWorker[] }) {
  return (
    <AdminCard className="mt-6 overflow-hidden">
      <div className="border-b border-border px-5 py-3">
        <div className="font-display text-base font-semibold">Workers</div>
        <div className="mt-0.5 text-xs text-text-muted">
          LiveKit agent workers report a heartbeat every 60 s; older than 3 minutes is stale.
        </div>
      </div>
      {!workers ? (
        <EmptyState icon="dns" message="Worker heartbeats are not reported by this server yet." />
      ) : workers.length === 0 ? (
        <EmptyState icon="dns" message="No workers configured." />
      ) : (
        <div className="divide-y divide-border/60">
          {workers.map((w) => (
            <div key={w.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm">
              <span className="font-semibold">{w.name}</span>
              <span className="font-mono text-[11px] text-text-muted">{w.agentId}</span>
              <Pill tone={WORKER_TONE[w.status] ?? 'neutral'}>{w.status}</Pill>
              <span className="text-xs text-text-muted" title={fmtDateTime(w.lastSeenAt)}>
                {fmtAge(w.ageSeconds)}
              </span>
              <span className="ml-auto font-mono text-[11px] text-text-muted">
                {w.version ? `version ${w.version}` : 'version unknown'}
                {w.host ? ` · ${w.host}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </AdminCard>
  )
}
