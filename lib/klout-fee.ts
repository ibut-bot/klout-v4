const BASE_FEE_LAMPORTS = Number(process.env.NEXT_PUBLIC_X_API_FEE_LAMPORTS || 500000)

export function getKloutFeeMultiplier(score: number): number {
  if (score >= 1000) return 1
  if (score >= 750) return 1.75
  if (score >= 500) return 1.5
  return 2
}

export function getKloutAdjustedFee(score: number): number {
  return Math.floor(BASE_FEE_LAMPORTS * getKloutFeeMultiplier(score))
}
