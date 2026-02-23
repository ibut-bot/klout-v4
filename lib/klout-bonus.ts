const MAX_KLOUT_SCORE = 10000
const MIN_BONUS_FRACTION = 0.50

/**
 * Linear curve for flat bonus: users at the bonus minimum threshold get
 * 50% of the max bonus, scaling linearly up to 100% at 10 000.
 *
 *   percentage = 0.50 + 0.50 × normalizedScore
 *
 * where normalizedScore = (score − minScore) / (10 000 − minScore).
 */
export function calculateFlatBonus(
  kloutScore: number,
  bonusMinKloutScore: number,
  bonusMaxLamports: bigint,
): bigint {
  if (kloutScore < bonusMinKloutScore) return BigInt(0)

  const range = MAX_KLOUT_SCORE - bonusMinKloutScore
  if (range <= 0) return bonusMaxLamports

  const normalizedScore = Math.min(
    1,
    (kloutScore - bonusMinKloutScore) / range,
  )

  const percentage = MIN_BONUS_FRACTION + (1 - MIN_BONUS_FRACTION) * normalizedScore

  return BigInt(Math.floor(Number(bonusMaxLamports) * percentage))
}
