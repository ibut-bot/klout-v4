/**
 * CPM multiplier tiers — independent of display tiers in score-tiers.ts.
 * Below 3000: heavy penalty, max 0.25x. Above 3000: exponential ramp to 1.0x.
 * Sorted ascending by maxScore; first match wins.
 */
const CPM_TIERS: { maxScore: number; multiplier: number }[] = [
  // 0 – 3,000: low trust zone, capped at 0.25x
  { maxScore: 100,  multiplier: 0.01 },
  { maxScore: 250,  multiplier: 0.02 },
  { maxScore: 500,  multiplier: 0.04 },
  { maxScore: 750,  multiplier: 0.06 },
  { maxScore: 1000, multiplier: 0.08 },
  { maxScore: 1500, multiplier: 0.12 },
  { maxScore: 2000, multiplier: 0.16 },
  { maxScore: 2500, multiplier: 0.20 },
  { maxScore: 3000, multiplier: 0.25 },

  // 3,001 – 10,000: exponential ramp to 1.0x
  { maxScore: 3500, multiplier: 0.32 },
  { maxScore: 4000, multiplier: 0.40 },
  { maxScore: 4500, multiplier: 0.50 },
  { maxScore: 5000, multiplier: 0.60 },
  { maxScore: 5500, multiplier: 0.70 },
  { maxScore: 6000, multiplier: 0.78 },
  { maxScore: 6500, multiplier: 0.84 },
  { maxScore: 7000, multiplier: 0.89 },
  { maxScore: 7500, multiplier: 0.93 },
  { maxScore: 8000, multiplier: 0.95 },
  { maxScore: 8500, multiplier: 0.97 },
  { maxScore: 9000, multiplier: 0.98 },
  { maxScore: 10000, multiplier: 1.00 },
]

export function getKloutCpmMultiplier(score: number): number {
  for (const tier of CPM_TIERS) {
    if (score <= tier.maxScore) return tier.multiplier
  }
  return 1.0
}
