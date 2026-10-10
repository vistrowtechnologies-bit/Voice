/** Preserve source stream time when captions arrive late. This is publication
 * time, not a promise of the original spoken time when a provider withholds it. */
export class TranscriptOrder {
  private positions = new Map<string, { time: number; sequence: number }>()
  private sequence = 0

  sort<T extends { id: string; timestamp?: number }>(entries: T[], now = Date.now()): T[] {
    for (const entry of entries) {
      if (!this.positions.has(entry.id)) {
        const time = typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp) && entry.timestamp > 0
          ? entry.timestamp : now
        this.positions.set(entry.id, { time, sequence: this.sequence++ })
      }
    }
    return [...entries].sort((a, b) => {
      const x = this.positions.get(a.id)!
      const y = this.positions.get(b.id)!
      return x.time - y.time || x.sequence - y.sequence
    })
  }
}
