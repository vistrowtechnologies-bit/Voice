import { Reveal } from '../Reveal'
import { StatTile, type StatTone } from '../ui/StatTile'

export interface ProofTile {
  label: string
  value: string
  hint?: string
  icon: string
  tone: StatTone
}

/** Dashboard-style stat tiles under the hero. Facts only, never invented numbers. */
export function ProofStrip({ tiles }: { tiles: ProofTile[] }) {
  if (!tiles.length) return null
  const cols = tiles.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'
  return (
    <section className="mx-auto max-w-7xl px-5 md:px-8" aria-label="At a glance">
      <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${cols}`}>
        {tiles.map((tile, i) => (
          <Reveal key={tile.label} delayMs={i * 60} className="h-full [&>div]:h-full">
            <StatTile label={tile.label} value={tile.value} hint={tile.hint} icon={tile.icon} tone={tile.tone} />
          </Reveal>
        ))}
      </div>
    </section>
  )
}
