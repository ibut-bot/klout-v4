/**
 * Exponential (quadratic) CPM multiplier: (score / 10000)^2, clamped to [0, 1].
 * Heavily punishes low-score users (likely bots).
 * 1000 → 0.01x, 3000 → 0.09x, 5000 → 0.25x, 7000 → 0.49x, 10000 → 1.0x
 */
export function getKloutCpmMultiplier(score: number): number {
  const normalized = Math.min(1.0, Math.max(0, score / 10000))
  return normalized * normalized
}
