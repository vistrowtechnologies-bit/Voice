import { useRef } from 'react'
import { useScrollProgress } from '../lib/useScrollProgress'
import arthaAvatar from '../assets/artha-avatar.webp'

const CALLER = 'Mujhe pricing samajhni hai, but please explain in English.'
const ARTHA = 'Of course. I’ll explain the plans in English and help you choose based on your call volume.'

/** The Hinglish exchange types itself out as the card scrolls into view: the caller's line
 * first, then Artha answering in English, and the language chip flips with the switch.
 * Each bubble reserves its full text's space (invisible copy underneath), so nothing jumps;
 * screen readers get the whole conversation at once. */
export function ScrollTypedCall() {
  const ref = useRef<HTMLDivElement>(null)
  // starts as the card's top reaches 85% of the screen height, finishes at 35%
  const p = useScrollProgress(ref, (r, vh) => (vh * 0.85 - r.top) / (vh * 0.5))
  const caller = Math.min(1, p / 0.4)
  const artha = Math.max(0, Math.min(1, (p - 0.5) / 0.45))
  const switched = artha > 0

  return (
    <div ref={ref} className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-surface p-7" aria-label="Example multilingual conversation">
      <p className="sr-only">Caller: {CALLER} Artha: {ARTHA}</p>
      <div aria-hidden="true">
        <div className="mb-4 flex items-center justify-end gap-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">
          Caller speaks
          <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 font-sans normal-case tracking-normal text-text transition-colors duration-300">
            {switched ? 'English' : 'हिंदी + English'}
          </span>
        </div>
        <div className="flex gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-high text-xs font-bold">You</span>
          <Typed full={CALLER} part={caller} className="rounded-2xl rounded-tl-sm bg-surface-high px-4 py-3 text-sm" />
        </div>
        <div className={`mt-4 flex justify-end gap-3 transition-opacity duration-300 ${p > 0.45 ? 'opacity-100' : 'opacity-0'}`}>
          <Typed full={ARTHA} part={artha} className="rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm text-white" />
          <img src={arthaAvatar} alt="" loading="lazy" decoding="async" className="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-primary/25" />
        </div>
        <p className={`mt-4 text-right text-[11px] font-semibold uppercase tracking-wider text-text-muted transition-opacity duration-500 ${artha >= 1 ? 'opacity-100' : 'opacity-0'}`}>
          Hindi → English · same voice · same conversation
        </p>
      </div>
    </div>
  )
}

function Typed({ full, part, className }: { full: string; part: number; className: string }) {
  const shown = full.slice(0, Math.round(part * full.length))
  return (
    <p className={`grid ${className}`}>
      <span className="invisible col-start-1 row-start-1">{full}</span>
      <span className="col-start-1 row-start-1">
        {shown}
        {part > 0 && part < 1 && <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-current" />}
      </span>
    </p>
  )
}
