// Shown only on the staging build (VITE_APP_ENV=staging, set on the Vercel
// preview). Staging data is fake and its calls are locked, so a visible marker
// keeps anyone from mistaking it for production.
export function StagingBadge() {
  if (import.meta.env.VITE_APP_ENV !== 'staging') return null
  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-3 left-3 z-[90] rounded-full bg-amber-500 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-black shadow-lg"
    >
      Staging
    </div>
  )
}
