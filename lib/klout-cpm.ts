/**
 * Linear CPM multiplier: score / 10000, clamped to [0, 1].
 * 1000 → 0.1x, 10000 → 1.0x
 */
export function getKloutCpmMultiplier(score: number): number {
  return Math.min(1.0, Math.max(0, score / 10000))
}
