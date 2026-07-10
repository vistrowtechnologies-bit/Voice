import { Link } from 'react-router-dom'
import { CONTACT_PHONE } from '../lib/marketingContent'
import { DEMO_CALL_CAP, getRemainingDemoCalls } from '../lib/demoCallCap'

// The recurring "LIVE DEMO" card — a glowing voice orb (the real agent-orb.mp4,
// the same asset the call widget uses) that links to the full browser-call
// experience at /demo. Reused on the homepage hero and every solution page.
export function DemoOrbCard() {
  const remaining = getRemainingDemoCalls()
  const exhausted = remaining <= 0

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-10 rounded-full bg-primary/20 blur-[100px]" />
      <div className="relative flex flex-col items-center rounded-[28px] border border-border bg-surface/80 p-8 text-center backdrop-blur-xl sm:p-10">
        <div className="absolute right-5 top-5 flex items-center gap-1.5 rounded-full border border-border bg-surface-high px-3 py-1">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-cyan">Live demo</span>
        </div>

        <Link to={exhausted ? '/contact' : '/demo'} className="group relative my-6 flex h-48 w-48 items-center justify-center">
          <span className="absolute inset-0 rounded-full border border-primary/20" />
          <span className="absolute inset-5 rounded-full border border-primary/10" />
          <span className="relative h-32 w-32 overflow-hidden rounded-full shadow-[0_0_60px_-5px_rgba(168,85,247,0.6)] transition-transform group-hover:scale-105">
            <video
              src="/agent-orb.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="h-full w-full object-cover"
            />
          </span>
        </Link>

        <h3 className="font-display text-2xl font-semibold">{exhausted ? 'Book a live walkthrough' : 'Tap to talk'}</h3>
        <p className="mt-1 text-sm text-text-muted">
          {exhausted ? 'You’ve used all your free demo calls' : 'Try Artha, no signup required'}
        </p>

        <div className="mt-5 rounded-xl border border-border bg-bg px-4 py-2 text-sm">
          <span className="font-bold text-cyan">{remaining}/{DEMO_CALL_CAP}</span>{' '}
          <span className="text-text-muted">free calls left</span>
        </div>

        <div className="mt-6 grid w-full grid-cols-2 gap-4 border-t border-border pt-5 text-left">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Native support</p>
            <p className="mt-1 text-xs text-text">Hindi · Hinglish +28 more</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Low latency</p>
            <p className="mt-1 text-xs text-text">&lt;300ms · emotion-aware</p>
          </div>
        </div>

        <p className="mt-5 text-xs text-text-muted">
          No mic? Dial{' '}
          <a href={`tel:${CONTACT_PHONE.replace(/\s/g, '')}`} className="text-primary hover:underline">
            {CONTACT_PHONE}
          </a>
        </p>
      </div>
    </div>
  )
}
