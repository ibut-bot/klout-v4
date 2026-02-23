/**
 * CPM multiplier tiers — independent of display tiers in score-tiers.ts.
 * Below 3000: max 0.05x. Below 5000: max 0.10x. Above 5000: ramp to 1.0x.
 * Sorted ascending by maxScore; first match wins.
 */
const CPM_TIERS: { maxScore: number; multiplier: number }[] = [
  // 0 – 3,000: low trust zone, capped at 0.05x
  { maxScore: 250,  multiplier: 0.001 },
  { maxScore: 500,  multiplier: 0.003 },
  { maxScore: 1000, multiplier: 0.008 },
  { maxScore: 1500, multiplier: 0.015 },
  { maxScore: 2000, multiplier: 0.025 },
  { maxScore: 2500, multiplier: 0.035 },
  { maxScore: 3000, multiplier: 0.05 },

  // 3,001 – 5,000: mid zone, capped at 0.10x
  { maxScore: 3500, multiplier: 0.06 },
  { maxScore: 4000, multiplier: 0.07 },
  { maxScore: 4500, multiplier: 0.085 },
  { maxScore: 5000, multiplier: 0.10 },

  // 5,001 – 10,000: high trust, ramp to 1.0x
  { maxScore: 5500, multiplier: 0.18 },
  { maxScore: 6000, multiplier: 0.30 },
  { maxScore: 6500, multiplier: 0.45 },
  { maxScore: 7000, multiplier: 0.58 },
  { maxScore: 7500, multiplier: 0.70 },
  { maxScore: 8000, multiplier: 0.80 },
  { maxScore: 8500, multiplier: 0.88 },
  { maxScore: 9000, multiplier: 0.94 },
  { maxScore: 10000, multiplier: 1.00 },
]

export function getKloutCpmMultiplier(score: number): number {
  for (const tier of CPM_TIERS) {
    if (score <= tier.maxScore) return tier.multiplier
  }
  return 1.0
}
