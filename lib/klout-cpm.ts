/**
 * CPM multiplier tiers — independent of display tiers in score-tiers.ts.
 * Heavy granularity at 0-2000, moderate at 2000-5000, gradual above 5000.
 * Sorted ascending by maxScore; first match wins.
 */
const CPM_TIERS: { maxScore: number; multiplier: number }[] = [
  // 0 – 2,000: very granular (10 sub-tiers)
  { maxScore: 100,  multiplier: 0.01 },
  { maxScore: 250,  multiplier: 0.02 },
  { maxScore: 500,  multiplier: 0.04 },
  { maxScore: 750,  multiplier: 0.07 },
  { maxScore: 1000, multiplier: 0.10 },
  { maxScore: 1250, multiplier: 0.14 },
  { maxScore: 1500, multiplier: 0.18 },
  { maxScore: 1750, multiplier: 0.23 },
  { maxScore: 2000, multiplier: 0.28 },

  // 2,001 – 5,000: moderate (6 sub-tiers)
  { maxScore: 2500, multiplier: 0.35 },
  { maxScore: 3000, multiplier: 0.42 },
  { maxScore: 3500, multiplier: 0.50 },
  { maxScore: 4000, multiplier: 0.57 },
  { maxScore: 4500, multiplier: 0.64 },
  { maxScore: 5000, multiplier: 0.70 },

  // 5,001 – 10,000: gradual ramp to 1.0 (5 sub-tiers)
  { maxScore: 5750, multiplier: 0.78 },
  { maxScore: 6500, multiplier: 0.85 },
  { maxScore: 7500, multiplier: 0.91 },
  { maxScore: 8500, multiplier: 0.95 },
  { maxScore: 9000, multiplier: 0.97 },
  { maxScore: 10000, multiplier: 1.00 },
]

export function getKloutCpmMultiplier(score: number): number {
  for (const tier of CPM_TIERS) {
    if (score <= tier.maxScore) return tier.multiplier
  }
  return 1.0
}
