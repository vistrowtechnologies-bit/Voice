/**
 * Used while we restore a signed-in session. Keeping this intentionally small
 * and on-theme prevents the old dark full-screen spinner from looking like an
 * application error while the dashboard route is resolving.
 */
export function AppLoadingScreen({ message = 'Loading your workspace…' }: { message?: string }) {
  return (
    <div className="app-loading-screen flex min-h-screen items-center justify-center overflow-hidden bg-bg px-6 text-text">
      <div
        className="app-loading-card relative w-full max-w-sm rounded-[28px] border border-border bg-surface/95 px-8 py-9 text-center shadow-xl"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="app-loading-signal mx-auto" aria-hidden="true">
          <span className="app-loading-ring app-loading-ring-outer" />
          <span className="app-loading-ring app-loading-ring-inner" />
          <span className="app-loading-orb-shell">
            <video
              src="/agent-orb.mp4"
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              className="app-loading-orb-video"
            />
          </span>
        </div>

        <div className="app-loading-wave mt-6" aria-hidden="true">
          {Array.from({ length: 7 }, (_, index) => <span key={index} />)}
        </div>

        <p className="mt-5 font-display text-base font-bold tracking-[-0.01em]">Vistrow Voice</p>
        <p className="mt-1.5 text-sm text-text-muted">{message}</p>

        <div className="app-loading-progress mx-auto mt-6 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-surface-high" aria-hidden="true">
          <span className="block h-full rounded-full" />
        </div>
        <span className="sr-only">Please wait while the application loads.</span>
      </div>
    </div>
  )
}
