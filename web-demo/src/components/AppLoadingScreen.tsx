import vistrowMark from '../assets/vistrow-mark.png'

/**
 * Used while we restore a signed-in session. Keeping this intentionally small
 * and on-theme prevents the old dark full-screen spinner from looking like an
 * application error while the dashboard route is resolving.
 */
export function AppLoadingScreen({ message = 'Loading your workspace…' }: { message?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6 text-text">
      <div className="w-full max-w-xs rounded-2xl border border-border bg-surface p-7 text-center shadow-sm" role="status" aria-live="polite">
        <img src={vistrowMark} alt="Vistrow Voice" className="mx-auto h-11 w-11 rounded-xl" />
        <div className="mx-auto mt-5 h-1 w-24 overflow-hidden rounded-full bg-surface-high">
          <span className="block h-full w-1/2 animate-pulse rounded-full bg-primary" />
        </div>
        <p className="mt-4 text-sm font-semibold">Vistrow Voice</p>
        <p className="mt-1 text-xs text-text-muted">{message}</p>
      </div>
    </div>
  )
}
