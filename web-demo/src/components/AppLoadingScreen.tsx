/**
 * Used while we restore a signed-in session. Keeping this intentionally small
 * and on-theme prevents the old dark full-screen spinner from looking like an
 * application error while the dashboard route is resolving.
 */
export function AppLoadingScreen({ message = 'Loading your workspace…' }: { message?: string }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center overflow-hidden bg-bg"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="app-loading-orb-shell" aria-hidden="true">
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
      <span className="sr-only">{message}</span>
    </div>
  )
}
