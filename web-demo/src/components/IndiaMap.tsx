import { INDIA_CITIES, INDIA_DOTS, INDIA_MAP } from '../lib/indiaMapData'

/** India as a quiet dot grid; cities brighten one after another, each named in its own script.
 * The animation is in index.css (.india-city) and stops for reduced-motion visitors. */
export function IndiaMap({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${INDIA_MAP.width} ${INDIA_MAP.height}`}
      role="img"
      aria-label={`Map of India: ${INDIA_CITIES.map((c) => c.en).join(', ')}`}
      className={`h-auto w-full overflow-visible ${className}`}
    >
      <path d={INDIA_DOTS} className="stroke-text/15" strokeWidth={3.2} strokeLinecap="round" />
      {INDIA_CITIES.map((c, i) => (
        <g key={c.en} className="india-city" style={{ animationDelay: `${(i * 0.55).toFixed(2)}s` }} transform={`translate(${c.x} ${c.y})`}>
          <circle className="india-ring fill-none stroke-brass" r={7} strokeWidth={1} />
          <circle className="fill-brass" r={2.6} />
          <text x={7} y={c.below ? 14 : -6} className="fill-text-muted text-[11px] font-medium">{c.nat}</text>
        </g>
      ))}
    </svg>
  )
}
